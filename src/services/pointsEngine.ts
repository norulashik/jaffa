import { MatchParticipant, UserPrediction, Prediction } from "../models";
import { Server as SocketIOServer } from "socket.io";

const BOOST_MULTIPLIER = 2;
const ALL_IN_MULTIPLIER = 3;
const ALL_IN_PENALTY = -30;

export interface PointsResult {
  basePoints: number;
  multiplier: number;
  totalPoints: number;
  isCorrect: boolean;
  newStreak: number;
}

export function calculatePoints(
  prediction: Prediction,
  selectedOption: string,
  boostType: string,
  currentStreak: number
): PointsResult {
  const isCorrect = prediction.correctOption === selectedOption;
  const option = prediction.options.find((o) => o.key === selectedOption);
  const basePoints = option?.points || 0;

  if (!isCorrect) {
    return {
      basePoints: 0,
      multiplier: 1,
      totalPoints: boostType === "all_in" ? ALL_IN_PENALTY : 0,
      isCorrect: false,
      newStreak: 0,
    };
  }

  const newStreak = currentStreak + 1;

  // Only Boost and All-In affect multiplier — streak is display-only
  let multiplier = 1;
  if (boostType === "boost") {
    multiplier = BOOST_MULTIPLIER;
  } else if (boostType === "all_in") {
    multiplier = ALL_IN_MULTIPLIER;
  }

  const totalPoints = Math.round(basePoints * multiplier);

  return {
    basePoints,
    multiplier,
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
  // Update prediction with correct answer
  await prediction.update({ correctOption, status: "resolved" });

  // Get all user predictions for this question
  const userPredictions = await UserPrediction.findAll({
    where: { predictionId: prediction.id },
  });

  let correctCount = 0;
  let totalCount = userPredictions.length;

  for (const up of userPredictions) {
    // Get participant
    const participant = await MatchParticipant.findOne({
      where: { userId: up.userId, matchId: up.matchId, venueId: up.venueId },
    });

    if (!participant) continue;

    const result = calculatePoints(prediction, up.selectedOption, up.boostType, participant.currentStreak);

    // Update user prediction
    await up.update({
      isCorrect: result.isCorrect,
      pointsEarned: result.totalPoints,
    });

    if (result.isCorrect) {
      correctCount++;

      // Update participant points
      const roundField = `round${prediction.round}Points` as string;
      const updateData: Record<string, unknown> = {
        totalPoints: participant.totalPoints + result.totalPoints,
        [roundField]: ((participant as unknown as Record<string, number>)[roundField] || 0) + result.totalPoints,
        currentStreak: result.newStreak,
        bestStreak: Math.max(participant.bestStreak, result.newStreak),
        correctPredictions: participant.correctPredictions + 1,
      };

      await participant.update(updateData as Partial<MatchParticipant>);

      // Emit streak hype moment
      if (result.newStreak >= 5) {
        const { User } = await import("../models");
        const user = await User.findByPk(up.userId);
        io.to(`venue:${up.venueId}:${up.matchId}`).emit("hypeEvent", {
          type: "streak",
          playerName: user?.displayName || "Someone",
          streak: result.newStreak,
        });
      }
    } else {
      // Reset streak + apply All-In penalty if applicable
      const updateData: Record<string, unknown> = { currentStreak: 0 };

      if (result.totalPoints < 0) {
        // All-In penalty: deduct points but floor at 0
        const roundField = `round${prediction.round}Points` as string;
        const newTotal = Math.max(0, participant.totalPoints + result.totalPoints);
        const currentRoundPts = (participant as unknown as Record<string, number>)[roundField] || 0;
        const newRoundPts = Math.max(0, currentRoundPts + result.totalPoints);

        updateData.totalPoints = newTotal;
        updateData[roundField] = newRoundPts;

        // Emit hype moment for failed All-In
        const { User } = await import("../models");
        const user = await User.findByPk(up.userId);
        io.to(`venue:${up.venueId}:${up.matchId}`).emit("hypeEvent", {
          type: "all_in_failed",
          playerName: user?.displayName || "Someone",
          pointsLost: Math.abs(result.totalPoints),
        });
      }

      await participant.update(updateData as Partial<MatchParticipant>);
    }
  }

  // Emit prediction pulse
  const venues = [...new Set(userPredictions.map((up) => up.venueId))];
  for (const venueId of venues) {
    const venueAnswers = userPredictions.filter((up) => up.venueId === venueId);
    const venueCorrect = venueAnswers.filter((up) => up.selectedOption === correctOption).length;
    const venueTotal = venueAnswers.length;

    io.to(`venue:${venueId}:${prediction.matchId}`).emit("predictionPulse", {
      predictionId: prediction.id,
      question: prediction.question,
      correctOption,
      correctLabel: prediction.options.find((o) => o.key === correctOption)?.label || correctOption,
      totalAnswered: venueTotal,
      correctCount: venueCorrect,
      correctPercentage: venueTotal > 0 ? Math.round((venueCorrect / venueTotal) * 100) : 0,
      pulse: generatePulseMessage(venueCorrect, venueTotal, prediction.question),
    });

    // Emit updated leaderboard
    io.to(`venue:${venueId}:${prediction.matchId}`).emit("leaderboardUpdate", {
      round: prediction.round,
    });
  }
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

  // Grand prize (round 0) orders by totalPoints, regular rounds by roundXPoints
  const orderField = round === 0 ? "totalPoints" : `round${round}Points`;

  const topPlayers = await MatchParticipant.findAll({
    where: { matchId, venueId },
    order: [[orderField, "DESC"]],
    limit: 3,
    include: [{ model: User, as: "user", attributes: ["displayName"] }],
  });

  if (topPlayers.length === 0) return;

  const rewardConfig = round === 0 ? venue.rewardConfig.grandPrize : venue.rewardConfig.roundReward;

  // Calculate expiry: end of next round (~40 mins) or end of match for grand prize
  const expiresAt = new Date(Date.now() + (round === 0 ? 60 : 40) * 60 * 1000);

  const winners = [];

  for (let i = 0; i < Math.min(topPlayers.length, 3); i++) {
    const player = topPlayers[i];
    const position = i + 1;
    const rewardKey = `top${position}` as keyof typeof rewardConfig;
    const rewardText = rewardConfig[rewardKey] || "Reward";

    // Generate unique 4-digit code
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

  // Emit round winner announcement
  io.to(`venue:${venueId}:${matchId}`).emit("roundWinner", {
    round,
    winners,
    isGrandPrize: round === 0,
  });
}
