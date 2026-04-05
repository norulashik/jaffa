import { MatchParticipant, UserPrediction, Prediction } from "../models";
import sequelize from "../config/database";
import { Server as SocketIOServer } from "socket.io";

const BOOST_MULTIPLIER = 2;
const ALL_IN_MULTIPLIER = 3;
const ALL_IN_PENALTY = -30;
export const ALL_CORRECT_OPTION = "__all__";

function getStreakBonus(streak: number): number {
  let bonus = 0;
  if (streak >= 3) bonus += 5;
  if (streak >= 5) bonus += 10;
  if (streak >= 10) bonus += 20;
  return bonus;
}

export interface PointsResult {
  basePoints: number;
  multiplier: number;
  streakBonus: number;
  totalPoints: number;
  isCorrect: boolean;
  newStreak: number;
}

export interface RecomputeScope {
  matchId?: string;
  venueId?: string;
  userId?: string;
}

export interface RecomputeSummary {
  participantsRecomputed: number;
  userPredictionsRecomputed: number;
}

function isAllCorrectPrediction(prediction: Prediction): boolean {
  return prediction.correctOption === ALL_CORRECT_OPTION;
}

function isSelectedOptionCorrect(prediction: Prediction, selectedOption: string): boolean {
  return isAllCorrectPrediction(prediction) || prediction.correctOption === selectedOption;
}

function getResolvedLabel(prediction: Prediction, correctOption: string): string {
  if (correctOption === ALL_CORRECT_OPTION) {
    return "Tie - all answers correct";
  }

  return prediction.options.find((o) => o.key === correctOption)?.label || correctOption;
}

export function calculatePoints(
  prediction: Prediction,
  selectedOption: string,
  boostType: string,
  currentStreak: number
): PointsResult {
  const isCorrect = isSelectedOptionCorrect(prediction, selectedOption);
  const option = prediction.options.find((o) => o.key === selectedOption);
  const basePoints = option?.points || 0;

  if (!isCorrect) {
    return {
      basePoints: 0,
      multiplier: 1,
      streakBonus: 0,
      totalPoints: boostType === "all_in" ? ALL_IN_PENALTY : 0,
      isCorrect: false,
      newStreak: 0,
    };
  }

  const newStreak = currentStreak + 1;

  let multiplier = 1;
  if (boostType === "boost") {
    multiplier = BOOST_MULTIPLIER;
  } else if (boostType === "all_in") {
    multiplier = ALL_IN_MULTIPLIER;
  }

  const streakBonus = getStreakBonus(newStreak);
  const totalPoints = Math.round(basePoints * multiplier) + streakBonus;

  return {
    basePoints,
    multiplier,
    streakBonus,
    totalPoints,
    isCorrect,
    newStreak,
  };
}

export async function resolvePrediction(
  prediction: Prediction,
  correctOption: string,
  io: SocketIOServer
): Promise<void> {
  if (prediction.status === "resolved") {
    if (prediction.correctOption === correctOption) {
      return;
    }

    throw new Error(
      `Prediction ${prediction.id} is already resolved with ${prediction.correctOption}, cannot change to ${correctOption}`
    );
  }

  await prediction.update({ correctOption, status: "resolved" });

  const userPredictions = await UserPrediction.findAll({
    where: { predictionId: prediction.id },
  });

  let correctCount = 0;

  for (const up of userPredictions) {
    let result: ReturnType<typeof calculatePoints> | undefined;

    await sequelize.transaction(async (t) => {
      const participant = await MatchParticipant.findOne({
        where: { userId: up.userId, matchId: up.matchId, venueId: up.venueId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!participant) return;

      result = calculatePoints(prediction, up.selectedOption, up.boostType, participant.currentStreak);

      await up.update({ isCorrect: result.isCorrect, pointsEarned: result.totalPoints }, { transaction: t });

      if (result.isCorrect) {
        correctCount++;

        const roundField = `round${prediction.round}Points` as string;
        const updateData: Record<string, unknown> = {
          totalPoints: participant.totalPoints + result.totalPoints,
          currentStreak: result.newStreak,
          bestStreak: Math.max(participant.bestStreak, result.newStreak),
          correctPredictions: participant.correctPredictions + 1,
        };
        // round0Points column does not exist — only persist round fields for rounds 1-6
        if (prediction.round >= 1) {
          updateData[roundField] = ((participant as unknown as Record<string, number>)[roundField] || 0) + result.totalPoints;
        }

        await participant.update(updateData as Partial<MatchParticipant>, { transaction: t });
      } else {
        const updateData: Record<string, unknown> = { currentStreak: 0 };

        if (result.totalPoints < 0) {
          const roundField = `round${prediction.round}Points` as string;
          const newTotal = Math.max(0, participant.totalPoints + result.totalPoints);
          updateData.totalPoints = newTotal;
          if (prediction.round >= 1) {
            const currentRoundPts = (participant as unknown as Record<string, number>)[roundField] || 0;
            updateData[roundField] = Math.max(0, currentRoundPts + result.totalPoints);
          }
        }

        await participant.update(updateData as Partial<MatchParticipant>, { transaction: t });
      }
    });

    // Emit hype events outside transaction (non-critical, socket emits)
    if (result) {
      if (result.isCorrect && result.newStreak >= 5) {
        const { User } = await import("../models");
        const user = await User.findByPk(up.userId);
        io.to(`venue:${up.venueId}:${up.matchId}`).emit("hypeEvent", {
          type: "streak",
          playerName: user?.displayName || "Someone",
          streak: result.newStreak,
        });
      } else if (!result.isCorrect && result.totalPoints < 0) {
        const { User } = await import("../models");
        const user = await User.findByPk(up.userId);
        io.to(`venue:${up.venueId}:${up.matchId}`).emit("hypeEvent", {
          type: "all_in_failed",
          playerName: user?.displayName || "Someone",
          pointsLost: Math.abs(result.totalPoints),
        });
      }
    }
  }

  const venues = [...new Set(userPredictions.map((up) => up.venueId))];
  for (const venueId of venues) {
    const venueAnswers = userPredictions.filter((up) => up.venueId === venueId);
    const venueCorrect = venueAnswers.filter((up) => isSelectedOptionCorrect(prediction, up.selectedOption)).length;
    const venueTotal = venueAnswers.length;

    io.to(`venue:${venueId}:${prediction.matchId}`).emit("predictionPulse", {
      predictionId: prediction.id,
      matchId: prediction.matchId,
      question: prediction.question,
      correctOption,
      correctLabel: getResolvedLabel(prediction, correctOption),
      totalAnswered: venueTotal,
      correctCount: venueCorrect,
      correctPercentage: venueTotal > 0 ? Math.round((venueCorrect / venueTotal) * 100) : 0,
      pulse: generatePulseMessage(venueCorrect, venueTotal, prediction.question),
    });

    io.to(`venue:${venueId}:${prediction.matchId}`).emit("predictionResolved", {
      matchId: prediction.matchId,
      predictionId: prediction.id,
      correctOption,
    });

    io.to(`venue:${venueId}:${prediction.matchId}`).emit("leaderboardUpdate", {
      round: prediction.round,
    });
  }
}

export async function reResolvePrediction(
  prediction: Prediction,
  newCorrectOption: string,
  io: SocketIOServer
): Promise<boolean> {
  if (prediction.correctOption === newCorrectOption) return false;

  const oldCorrectOption = prediction.correctOption;
  console.log(
    `[ReResolve] Prediction ${prediction.id}: "${prediction.question}" changing from "${oldCorrectOption}" to "${newCorrectOption}"`
  );

  await prediction.update({ correctOption: newCorrectOption });

  const userPredictions = await UserPrediction.findAll({
    where: { predictionId: prediction.id },
  });

  const changed = userPredictions.some((up) => {
    const oldWasCorrect =
      oldCorrectOption === ALL_CORRECT_OPTION || up.selectedOption === oldCorrectOption;
    const newIsCorrect =
      newCorrectOption === ALL_CORRECT_OPTION || up.selectedOption === newCorrectOption;
    return oldWasCorrect !== newIsCorrect;
  });

  if (!changed) return false;

  await recomputeParticipantScores({ matchId: prediction.matchId });

  const venues = [...new Set(userPredictions.map((up) => up.venueId))];
  for (const venueId of venues) {
    io.to(`venue:${venueId}:${prediction.matchId}`).emit("predictionResolved", {
      matchId: prediction.matchId,
      predictionId: prediction.id,
      correctOption: newCorrectOption,
      reResolved: true,
    });
    io.to(`venue:${venueId}:${prediction.matchId}`).emit("leaderboardUpdate", {
      round: prediction.round,
    });
  }

  return true;
}

function initialRoundPoints(): Record<string, number> {
  return {
    round1Points: 0,
    round2Points: 0,
    round3Points: 0,
    round4Points: 0,
    round5Points: 0,
    round6Points: 0,
  };
}

export async function recomputeParticipantScores(
  scope: RecomputeScope = {}
): Promise<RecomputeSummary> {
  const participantWhere: Record<string, string> = {};
  if (scope.matchId) participantWhere.matchId = scope.matchId;
  if (scope.venueId) participantWhere.venueId = scope.venueId;
  if (scope.userId) participantWhere.userId = scope.userId;

  const participants = await MatchParticipant.findAll({
    where: participantWhere,
    order: [["createdAt", "ASC"]],
  });

  let userPredictionsRecomputed = 0;

  for (const participant of participants) {
    const answers = await UserPrediction.findAll({
      where: {
        userId: participant.userId,
        matchId: participant.matchId,
        venueId: participant.venueId,
      },
      include: [{ model: Prediction, as: "prediction" }],
      order: [["answeredAt", "ASC"], ["createdAt", "ASC"]],
    });

    let totalPoints = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    let correctPredictions = 0;
    const roundPoints = initialRoundPoints();
    const currentRound = participant.currentRound || 0;
    const boostsUsedRound = answers.filter((up: any) => {
      const prediction = up.prediction as Prediction | undefined;
      return up.boostType === "boost" && prediction?.round === currentRound;
    }).length;
    const allInUsed = answers.some((up) => up.boostType === "all_in");

    for (const up of answers as Array<UserPrediction & { prediction?: Prediction }>) {
      const prediction = up.prediction;
      let isCorrect: boolean | null = null;
      let pointsEarned = 0;

      if (prediction?.status === "resolved" && prediction.correctOption) {
        const result = calculatePoints(
          prediction,
          up.selectedOption,
          up.boostType,
          currentStreak
        );

        isCorrect = result.isCorrect;
        pointsEarned = result.totalPoints;

        if (result.isCorrect) {
          totalPoints += result.totalPoints;
          if (prediction.round >= 1 && prediction.round <= 6) {
            const roundField = `round${prediction.round}Points`;
            roundPoints[roundField] = (roundPoints[roundField] || 0) + result.totalPoints;
          }
          currentStreak = result.newStreak;
          bestStreak = Math.max(bestStreak, currentStreak);
          correctPredictions += 1;
        } else {
          currentStreak = 0;
          if (result.totalPoints < 0) {
            totalPoints = Math.max(0, totalPoints + result.totalPoints);
            if (prediction.round >= 1 && prediction.round <= 6) {
              const roundField = `round${prediction.round}Points`;
              roundPoints[roundField] = Math.max(
                0,
                (roundPoints[roundField] || 0) + result.totalPoints
              );
            }
          }
        }
      }

      const nextIsCorrect = isCorrect === null ? null : isCorrect;
      if (up.isCorrect !== nextIsCorrect || up.pointsEarned !== pointsEarned) {
        await up.update({
          isCorrect: nextIsCorrect as boolean | null,
          pointsEarned,
        } as any);
        userPredictionsRecomputed += 1;
      }
    }

    await participant.update({
      totalPoints,
      ...roundPoints,
      currentStreak,
      bestStreak,
      totalPredictions: answers.length,
      correctPredictions,
      boostsUsedRound,
      allInUsed,
    } as Partial<MatchParticipant>);
  }

  return {
    participantsRecomputed: participants.length,
    userPredictionsRecomputed,
  };
}

function generatePulseMessage(correctCount: number, totalCount: number, question: string): string {
  const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  if (percentage === 0) {
    const messages = [
      "Nobody saw that coming. Absolutely nobody.",
      "Zero correct. The cricket gods are ruthless today.",
      "Not a single person got it right. Respect to the game.",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (percentage <= 10) {
    const messages = [
      `Only ${correctCount} of you called it. Take a bow.`,
      `${correctCount} genius${correctCount === 1 ? "" : "es"} in the room. The rest of you... better luck next over.`,
      "Almost nobody got that. If you did, you're built different.",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (percentage <= 30) {
    const messages = [
      `${correctCount} out of ${totalCount} got it right. Decent reading of the game.`,
      "Tough one. Only the sharp ones caught that.",
      `${percentage}% accuracy. Cricket IQ check passed by a few.`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (percentage <= 60) {
    const messages = [
      "Split room. Half of you are geniuses, half need to watch more cricket.",
      `${percentage}% got it. The room was divided on this one.`,
      "Close call. Could have gone either way.",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (percentage <= 85) {
    const messages = [
      "Most of you saw that coming. Almost too easy.",
      `${percentage}% correct. Not bad, but not exactly a bold prediction.`,
      "The majority got it. No bragging rights for this one.",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  const messages = [
    "Too easy. Everyone and their grandmother got that one.",
    `${percentage}% correct. Points for everyone, thrills for nobody.`,
    "If you got this wrong, what match are you watching?",
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

export async function generateRoundRewards(
  matchId: string,
  venueId: string,
  round: number,
  io: SocketIOServer
): Promise<void> {
  const { Reward, Venue, User } = await import("../models");

  const venue = await Venue.findByPk(venueId);
  if (!venue) return;

  const orderField = round === 0 ? "totalPoints" : `round${round}Points`;

  const topPlayers = await MatchParticipant.findAll({
    where: { matchId, venueId },
    order: [[orderField, "DESC"]],
    limit: 3,
    include: [{ model: User, as: "user", attributes: ["displayName"] }],
  });

  if (topPlayers.length === 0) return;

  const rewardConfig = round === 0 ? venue.rewardConfig.grandPrize : venue.rewardConfig.roundReward;
  const expiresAt = new Date(Date.now() + (round === 0 ? 60 : 40) * 60 * 1000);

  const winners = [];

  for (let i = 0; i < Math.min(topPlayers.length, 3); i++) {
    const player = topPlayers[i];
    const position = i + 1;
    const rewardKey = `top${position}` as keyof typeof rewardConfig;
    const rewardText = rewardConfig[rewardKey] || "Reward";
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    await Reward.create({
      userId: player.userId,
      matchId,
      venueId,
      round,
      position,
      rewardText,
      code,
      expiresAt,
    });

    const displayName = (player as unknown as { user: { displayName: string } }).user?.displayName || "Player";
    winners.push({
      position,
      displayName,
      points: (player as unknown as Record<string, number>)[orderField] || 0,
      reward: rewardText,
    });
  }

  io.to(`venue:${venueId}:${matchId}`).emit("roundWinner", {
    round,
    winners,
    isGrandPrize: round === 0,
  });
}
