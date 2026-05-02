import { Match, MatchParticipant, Room, RoomMember } from "../models";
import { ROOM_VENUE_ID } from "./roomVenue";
import { getCurrentRound } from "./predictionEngine";

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

