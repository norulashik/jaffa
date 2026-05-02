import { Router, Response } from "express";
import { Op } from "sequelize";
import { Room, RoomMember, Match, User, MatchParticipant } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { ROOM_VENUE_ID } from "../services/roomVenue";
import { getCurrentRound } from "../services/predictionEngine";
import sequelize from "../config/database";

const router = Router();

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return code;
}

// Create a room
router.post("/", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { matchId, name, isPublic, maxPlayers } = req.body;
    const userId = req.userId!;

    if (!matchId || !name) {
      res.status(400).json({ error: "matchId and name are required" });
      return;
    }

    if (name.length > 50) {
      res.status(400).json({ error: "Room name must be 50 characters or less" });
      return;
    }

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    if (match.status === "completed") {
      res.status(400).json({ error: "Cannot create room for a completed match" });
      return;
    }

    // Only allow rooms for today's matches
    if (match.startTime) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const matchDate = new Date(match.startTime);
      if (matchDate < today || matchDate >= tomorrow) {
        res.status(400).json({ error: "Can only create rooms for today's matches" });
        return;
      }
    }

    // Generate unique code (retry up to 5 times)
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateRoomCode();
      const existing = await Room.findOne({ where: { code: candidate } });
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      res.status(500).json({ error: "Failed to generate unique room code" });
      return;
    }

    const room = await sequelize.transaction(async (t) => {
      const newRoom = await Room.create(
        {
          name,
          hostUserId: userId,
          matchId,
          code,
          isPublic: isPublic || false,
          maxPlayers: maxPlayers || 10,
          status: match.status === "live" ? "active" : "waiting",
        },
        { transaction: t }
      );

      // Add host as first member
      await RoomMember.create(
        { roomId: newRoom.id, userId },
        { transaction: t }
      );

      // Create MatchParticipant for the host with ROOM_VENUE_ID
      const currentRound = match.status === "live"
        ? getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers)
        : 0;
      await MatchParticipant.findOrCreate({
        where: { userId, matchId, venueId: ROOM_VENUE_ID },
        defaults: { userId, matchId, venueId: ROOM_VENUE_ID, currentRound },
        transaction: t,
      });

      return newRoom;
    });

    const host = await User.findByPk(userId, { attributes: ["id", "displayName", "avatarConfig"] });

    res.status(201).json({
      room: {
        ...room.toJSON(),
        members: [{ userId, displayName: host?.displayName, avatarConfig: host?.avatarConfig, joinedAt: new Date() }],
        memberCount: 1,
      },
      shareLink: `/room/join?code=${room.code}`,
      venueId: ROOM_VENUE_ID,
    });
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// Get user's rooms
router.get("/my", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const memberships = await RoomMember.findAll({
      where: { userId },
      include: [
        {
          model: Room,
          as: "room",
          where: { status: { [Op.ne]: "closed" } },
          include: [
            { model: Match, as: "match", attributes: ["id", "team1", "team2", "team1Short", "team2Short", "status", "startTime"] },
            { model: User, as: "host", attributes: ["id", "displayName"] },
          ],
        },
      ],
      order: [["joinedAt", "DESC"]],
    });

    const rooms = await Promise.all(
      memberships.map(async (m) => {
        const room = (m as any).room;
        const memberCount = await RoomMember.count({ where: { roomId: room.id } });
        return { ...room.toJSON(), memberCount };
      })
    );

    res.json({ rooms });
  } catch (error) {
    console.error("Get my rooms error:", error);
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

// List public rooms
router.get("/public", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const publicRooms = await Room.findAll({
      where: {
        isPublic: true,
        status: { [Op.in]: ["waiting", "active"] },
      },
      include: [
        { model: Match, as: "match", attributes: ["id", "team1", "team2", "team1Short", "team2Short", "status", "startTime"] },
        { model: User, as: "host", attributes: ["id", "displayName"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const rooms = await Promise.all(
      publicRooms.map(async (room) => {
        const memberCount = await RoomMember.count({ where: { roomId: room.id } });
        return { ...room.toJSON(), memberCount };
      })
    );

    res.json({ rooms });
  } catch (error) {
    console.error("Get public rooms error:", error);
    res.status(500).json({ error: "Failed to get public rooms" });
  }
});

// Get room details
router.get("/:roomId", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;

    const room = await Room.findByPk(roomId, {
      include: [
        { model: Match, as: "match", attributes: ["id", "team1", "team2", "team1Short", "team2Short", "status", "startTime", "currentPhase", "currentOver", "currentInnings", "scoreData"] },
        { model: User, as: "host", attributes: ["id", "displayName", "avatarConfig"] },
      ],
    });

    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const members = await RoomMember.findAll({
      where: { roomId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [["joinedAt", "ASC"]],
    });

    res.json({
      room: {
        ...room.toJSON(),
        members: members.map((m) => ({
          userId: m.userId,
          displayName: (m as any).user?.displayName,
          avatarConfig: (m as any).user?.avatarConfig,
          joinedAt: m.joinedAt,
        })),
        memberCount: members.length,
      },
      venueId: ROOM_VENUE_ID,
    });
  } catch (error) {
    console.error("Get room error:", error);
    res.status(500).json({ error: "Failed to get room" });
  }
});

// Join room by code
router.post("/join", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    const userId = req.userId!;

    if (!code) {
      res.status(400).json({ error: "Room code is required" });
      return;
    }

    const room = await Room.findOne({
      where: { code: code.toUpperCase() },
      include: [
        { model: Match, as: "match", attributes: ["id", "team1", "team2", "team1Short", "team2Short", "status", "startTime"] },
      ],
    });

    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    if (room.status === "closed") {
      res.status(400).json({ error: "This room is closed" });
      return;
    }

    // Check if already a member (idempotent)
    const existingMember = await RoomMember.findOne({
      where: { roomId: room.id, userId },
    });

    if (existingMember) {
      res.json({
        room: room.toJSON(),
        venueId: ROOM_VENUE_ID,
        message: "Already a member of this room",
      });
      return;
    }

    const memberCount = await RoomMember.count({ where: { roomId: room.id } });
    if (memberCount >= room.maxPlayers) {
      res.status(400).json({ error: "Room is full" });
      return;
    }

    await sequelize.transaction(async (t) => {
      await RoomMember.create(
        { roomId: room.id, userId },
        { transaction: t }
      );

      const match = await Match.findByPk(room.matchId, { transaction: t });
      const currentRound = match && match.status === "live"
        ? getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers)
        : 0;
      await MatchParticipant.findOrCreate({
        where: { userId, matchId: room.matchId, venueId: ROOM_VENUE_ID },
        defaults: { userId, matchId: room.matchId, venueId: ROOM_VENUE_ID, currentRound },
        transaction: t,
      });
    });

    // Emit member joined via socket
    const io = req.app.get("io");
    const user = await User.findByPk(userId, { attributes: ["id", "displayName", "avatarConfig"] });
    const newMemberCount = memberCount + 1;

    io.to(`room:${room.id}`).emit("memberJoined", {
      userId,
      displayName: user?.displayName,
      avatarConfig: user?.avatarConfig,
      memberCount: newMemberCount,
    });

    res.json({
      room: { ...room.toJSON(), memberCount: newMemberCount },
      venueId: ROOM_VENUE_ID,
    });
  } catch (error) {
    console.error("Join room error:", error);
    res.status(500).json({ error: "Failed to join room" });
  }
});

// Join random public room
router.post("/join-random", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { matchId } = req.body;
    const userId = req.userId!;

    if (!matchId) {
      res.status(400).json({ error: "matchId is required" });
      return;
    }

    const publicRooms = await Room.findAll({
      where: {
        matchId,
        isPublic: true,
        status: { [Op.in]: ["waiting", "active"] },
      },
    });

    if (publicRooms.length === 0) {
      res.status(404).json({ error: "No open rooms available for this match" });
      return;
    }

    // Find rooms with available slots, pick the fullest one
    let bestRoom: typeof publicRooms[0] | null = null;
    let bestCount = -1;

    for (const room of publicRooms) {
      // Skip rooms user is already in
      const alreadyIn = await RoomMember.findOne({ where: { roomId: room.id, userId } });
      if (alreadyIn) continue;

      const count = await RoomMember.count({ where: { roomId: room.id } });
      if (count < room.maxPlayers && count > bestCount) {
        bestRoom = room;
        bestCount = count;
      }
    }

    if (!bestRoom) {
      res.status(404).json({ error: "No open rooms available for this match" });
      return;
    }

    await sequelize.transaction(async (t) => {
      await RoomMember.create(
        { roomId: bestRoom!.id, userId },
        { transaction: t }
      );

      const match = await Match.findByPk(bestRoom!.matchId, { transaction: t });
      const currentRound = match && match.status === "live"
        ? getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers)
        : 0;
      await MatchParticipant.findOrCreate({
        where: { userId, matchId: bestRoom!.matchId, venueId: ROOM_VENUE_ID },
        defaults: { userId, matchId: bestRoom!.matchId, venueId: ROOM_VENUE_ID, currentRound },
        transaction: t,
      });
    });

    const io = req.app.get("io");
    const user = await User.findByPk(userId, { attributes: ["id", "displayName", "avatarConfig"] });
    const newCount = bestCount + 1;

    io.to(`room:${bestRoom.id}`).emit("memberJoined", {
      userId,
      displayName: user?.displayName,
      avatarConfig: user?.avatarConfig,
      memberCount: newCount,
    });

    const roomWithMatch = await Room.findByPk(bestRoom.id, {
      include: [
        { model: Match, as: "match", attributes: ["id", "team1", "team2", "team1Short", "team2Short", "status", "startTime"] },
      ],
    });

    res.json({
      room: { ...roomWithMatch!.toJSON(), memberCount: newCount },
      venueId: ROOM_VENUE_ID,
    });
  } catch (error) {
    console.error("Join random room error:", error);
    res.status(500).json({ error: "Failed to join random room" });
  }
});

// Leave room
router.post("/:roomId/leave", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const userId = req.userId!;

    const member = await RoomMember.findOne({ where: { roomId, userId } });
    if (!member) {
      res.status(404).json({ error: "Not a member of this room" });
      return;
    }

    const room = await Room.findByPk(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    await member.destroy();

    const remainingMembers = await RoomMember.findAll({
      where: { roomId },
      order: [["joinedAt", "ASC"]],
    });

    if (remainingMembers.length === 0) {
      await room.update({ status: "closed" });
    } else if (room.hostUserId === userId) {
      // Transfer host to earliest member
      await room.update({ hostUserId: remainingMembers[0].userId });
    }

    const io = req.app.get("io");
    const user = await User.findByPk(userId, { attributes: ["displayName"] });

    io.to(`room:${roomId}`).emit("memberLeft", {
      userId,
      displayName: user?.displayName,
      memberCount: remainingMembers.length,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Leave room error:", error);
    res.status(500).json({ error: "Failed to leave room" });
  }
});

// Room match leaderboard
router.get("/:roomId/leaderboard", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;

    const room = await Room.findByPk(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const memberUserIds = (
      await RoomMember.findAll({ where: { roomId }, attributes: ["userId"] })
    ).map((m) => m.userId);

    const participants = await MatchParticipant.findAll({
      where: {
        matchId: room.matchId,
        venueId: ROOM_VENUE_ID,
        userId: { [Op.in]: memberUserIds },
      },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [["totalPoints", "DESC"]],
    });

    const leaderboard = participants.map((p, idx) => ({
      rank: idx + 1,
      userId: p.userId,
      displayName: (p as any).user?.displayName,
      avatarConfig: (p as any).user?.avatarConfig,
      totalPoints: p.totalPoints,
      currentStreak: p.currentStreak,
      bestStreak: p.bestStreak,
      correctPredictions: p.correctPredictions,
      totalPredictions: p.totalPredictions,
      accuracy: p.totalPredictions > 0 ? Math.round((p.correctPredictions / p.totalPredictions) * 100) : 0,
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error("Room leaderboard error:", error);
    res.status(500).json({ error: "Failed to get room leaderboard" });
  }
});

// Room round leaderboard
router.get("/:roomId/leaderboard/round/:round", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const round = req.params.round as string;
    const roundNum = parseInt(round, 10);

    if (isNaN(roundNum) || roundNum < 0 || roundNum > 6) {
      res.status(400).json({ error: "Invalid round number" });
      return;
    }

    const room = await Room.findByPk(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const memberUserIds = (
      await RoomMember.findAll({ where: { roomId }, attributes: ["userId"] })
    ).map((m) => m.userId);

    const roundPointsField = `round${roundNum}Points`;

    const participants = await MatchParticipant.findAll({
      where: {
        matchId: room.matchId,
        venueId: ROOM_VENUE_ID,
        userId: { [Op.in]: memberUserIds },
      },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [[roundPointsField, "DESC"]],
    });

    const leaderboard = participants.map((p, idx) => ({
      rank: idx + 1,
      userId: p.userId,
      displayName: (p as any).user?.displayName,
      avatarConfig: (p as any).user?.avatarConfig,
      roundPoints: (p as any)[roundPointsField] || 0,
      totalPoints: p.totalPoints,
    }));

    res.json({ round: roundNum, leaderboard });
  } catch (error) {
    console.error("Room round leaderboard error:", error);
    res.status(500).json({ error: "Failed to get room round leaderboard" });
  }
});

export default router;
