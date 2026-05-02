import { Op, Transaction } from "sequelize";
import { Match, MatchParticipant, Room, RoomMember } from "../models";
import { ROOM_VENUE_ID } from "./roomVenue";
import { getCurrentRound } from "./predictionEngine";

const IPL_TEAM_SHORTS = new Set(["RCB", "GT", "MI", "CSK", "LSG", "RR", "SRH", "DC", "PBKS", "KKR"]);

function isIplMatch(match: Match | null | undefined): boolean {
  if (!match) return false;
  const t1 = (match.team1Short || "").toUpperCase();
  const t2 = (match.team2Short || "").toUpperCase();
  return IPL_TEAM_SHORTS.has(t1) && IPL_TEAM_SHORTS.has(t2);
}

export async function ensureRoomMatchParticipant(
  userId: string,
  roomId: string,
  matchId: string,
  transaction?: any
): Promise<MatchParticipant | null> {
  const member = await RoomMember.findOne({
    where: { roomId, userId },
    transaction,
  });
  if (!member) return null;

  const room = await Room.findByPk(roomId, { transaction });
  const match = await Match.findByPk(matchId, { transaction });
  if (!room || !match) return null;

  const existing = await MatchParticipant.findOne({
    where: { userId, matchId, venueId: ROOM_VENUE_ID, roomId },
    transaction,
  });
  if (existing) return existing;

  const currentRound = match.status === "live"
    ? getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers)
    : 0;

  return MatchParticipant.create(
    {
      userId,
      matchId,
      venueId: ROOM_VENUE_ID,
      roomId,
      currentRound,
    },
    { transaction }
  );
}

function copyParticipantFields(source: MatchParticipant, joinedAt: Date) {
  return {
    totalPoints: source.totalPoints,
    round1Points: source.round1Points,
    round2Points: source.round2Points,
    round3Points: source.round3Points,
    round4Points: source.round4Points,
    round5Points: source.round5Points,
    round6Points: source.round6Points,
    currentStreak: source.currentStreak,
    bestStreak: source.bestStreak,
    boostsUsedRound: source.boostsUsedRound,
    currentRound: source.currentRound,
    allInUsed: source.allInUsed,
    allInUsedInnings1: source.allInUsedInnings1,
    allInUsedInnings2: source.allInUsedInnings2,
    totalPredictions: source.totalPredictions,
    correctPredictions: source.correctPredictions,
    joinedAt,
  };
}

function compareCanonicalParticipants(a: MatchParticipant, b: MatchParticipant): number {
  const aIsNonRoom = a.venueId !== ROOM_VENUE_ID || !a.roomId;
  const bIsNonRoom = b.venueId !== ROOM_VENUE_ID || !b.roomId;
  if (aIsNonRoom !== bIsNonRoom) return aIsNonRoom ? -1 : 1;
  if (a.totalPredictions !== b.totalPredictions) return b.totalPredictions - a.totalPredictions;
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
}

export async function backfillSeasonRoomParticipants(
  userId: string,
  roomId: string,
  joinedAt: Date,
  transaction?: Transaction,
): Promise<number> {
  const room = await Room.findByPk(roomId, { transaction });
  if (!room?.isSeasonRoom) return 0;

  const sourceParticipants = await MatchParticipant.findAll({
    where: {
      userId,
      [Op.or]: [
        { venueId: { [Op.ne]: ROOM_VENUE_ID } },
        {
          venueId: ROOM_VENUE_ID,
          roomId: { [Op.ne]: roomId },
        },
      ],
    },
    include: [
      {
        model: Match,
        as: "match",
        required: true,
      },
    ],
    transaction,
  });

  const canonicalByMatchId = new Map<string, MatchParticipant>();
  for (const participant of sourceParticipants) {
    const match = (participant as any).match as Match | undefined;
    if (!isIplMatch(match)) continue;
    if (!match?.startTime || new Date(match.startTime) < joinedAt) continue;
    const existing = canonicalByMatchId.get(participant.matchId);
    if (!existing || compareCanonicalParticipants(participant, existing) < 0) {
      canonicalByMatchId.set(participant.matchId, participant);
    }
  }

  let created = 0;
  for (const [matchId, source] of canonicalByMatchId.entries()) {
    const existing = await MatchParticipant.findOne({
      where: { userId, matchId, venueId: ROOM_VENUE_ID, roomId },
      transaction,
    });
    if (existing) continue;

    await MatchParticipant.create(
      {
        userId,
        matchId,
        venueId: ROOM_VENUE_ID,
        roomId,
        ...copyParticipantFields(source, joinedAt),
      },
      { transaction },
    );
    created += 1;
  }

  return created;
}
