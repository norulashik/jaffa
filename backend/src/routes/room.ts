import { Router, Response } from "express";
import { Op } from "sequelize";
import { Room, RoomMember, Match, User, MatchParticipant } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { ROOM_VENUE_ID } from "../services/roomVenue";
import { getCurrentRound } from "../services/predictionEngine";
import sequelize from "../config/database";

const router = Router();

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const IPL_TEAM_SHORTS = new Set(["RCB", "GT", "MI", "CSK", "LSG", "RR", "SRH", "DC", "PBKS", "KKR"]);

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return code;
}

function isTodayMatch(startTime?: Date | null): boolean {
  if (!startTime) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const matchDate = new Date(startTime);
  return matchDate >= today && matchDate < tomorrow;
}

function isIplMatch(match: Match): boolean {
  const t1 = (match.team1Short || "").toUpperCase();
  const t2 = (match.team2Short || "").toUpperCase();
  return IPL_TEAM_SHORTS.has(t1) && IPL_TEAM_SHORTS.has(t2);
}

async function createRoomParticipant(userId: string, roomId: string, match: Match, transaction?: any): Promise<void> {
  const currentRound = match.status === "live"
    ? getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers)
    : 0;

  const existing = await MatchParticipant.findOne({
    where: { userId, matchId: match.id, venueId: ROOM_VENUE_ID, roomId },
    transaction,
  });
  if (existing) return;

  await MatchParticipant.create(
    { userId, matchId: match.id, venueId: ROOM_VENUE_ID, roomId, currentRound },
    { transaction }
  );
}

async function buildRoomPayload(roomId: string) {
  const room = await Room.findByPk(roomId, {
    include: [
      { model: Match, as: "match", attributes: ["id", "team1", "team2", "team1Short", "team2Short", "status", "startTime", "currentPhase", "currentOver", "currentInnings", "scoreData"] },
      { model: User, as: "host", attributes: ["id", "displayName", "avatarConfig"] },
    ],
  });
  if (!room) return null;

  const members = await RoomMember.findAll({
    where: { roomId },
    include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
    order: [["joinedAt", "ASC"]],
  });

  return {
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
  };
}

async function findBestSeasonMatch(): Promise<Match | null> {
  const matches = await Match.findAll({
    where: { status: { [Op.in]: ["live", "upcoming"] } },
    order: [["startTime", "ASC"]],
  });
  const ipl = matches.filter(isIplMatch);
  if (ipl.length === 0) return null;
  const live = ipl.find((m) => m.status === "live");
  return live || ipl[0];
}

async function findSeasonAnchorMatch(): Promise<Match | null> {
  const active = await findBestSeasonMatch();
  if (active) return active;

  const historicalMatches = await Match.findAll({
    order: [["startTime", "DESC"]],
  });
  const ipl = historicalMatches.filter(isIplMatch);
  return ipl[0] || null;
}

async function buildSeasonLeaderboard(roomId: string) {
  const members = await RoomMember.findAll({
    where: { roomId },
    include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
    order: [["joinedAt", "ASC"]],
  });

  const memberMap = new Map(members.map((m) => [m.userId, m]));
  const userIds = members.map((m) => m.userId);

  const participants = userIds.length === 0
    ? []
    : await MatchParticipant.findAll({
        where: { roomId, venueId: ROOM_VENUE_ID, userId: { [Op.in]: userIds } },
        order: [["createdAt", "ASC"]],
      });

  const totals = new Map<string, {
    userId: string;
    displayName: string;
    avatarConfig: any;
    totalPoints: number;
    currentStreak: number;
    bestStreak: number;
    correctPredictions: number;
    totalPredictions: number;
    matchCount: number;
  }>();

  for (const member of members) {
    totals.set(member.userId, {
      userId: member.userId,
      displayName: (member as any).user?.displayName || "Unknown",
      avatarConfig: (member as any).user?.avatarConfig || null,
      totalPoints: 0,
      currentStreak: 0,
      bestStreak: 0,
      correctPredictions: 0,
      totalPredictions: 0,
      matchCount: 0,
    });
  }

  for (const participant of participants) {
    const member = memberMap.get(participant.userId);
    const total = totals.get(participant.userId);
    if (!member || !total) continue;
    if (new Date(participant.joinedAt) < new Date(member.joinedAt)) continue;
    total.totalPoints += participant.totalPoints;
    total.currentStreak = Math.max(total.currentStreak, participant.currentStreak);
    total.bestStreak = Math.max(total.bestStreak, participant.bestStreak);
    total.correctPredictions += participant.correctPredictions;
    total.totalPredictions += participant.totalPredictions;
    total.matchCount += 1;
  }

  return Array.from(totals.values())
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctPredictions !== a.correctPredictions) return b.correctPredictions - a.correctPredictions;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((row, idx) => ({
      rank: idx + 1,
      userId: row.userId,
      displayName: row.displayName,
      avatarConfig: row.avatarConfig,
      totalPoints: row.totalPoints,
      currentStreak: row.currentStreak,
      bestStreak: row.bestStreak,
      correctPredictions: row.correctPredictions,
      totalPredictions: row.totalPredictions,
      accuracy: row.totalPredictions > 0 ? Math.round((row.correctPredictions / row.totalPredictions) * 100) : 0,
      matchCount: row.matchCount,
      capStatus: idx === 0 ? "orange" : idx === 1 ? "violet" : null,
    }));
}

router.post("/", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { matchId, name, isPublic, maxPlayers, isSeasonRoom } = req.body;
    const userId = req.userId!;

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    if (name.length > 50) {
      res.status(400).json({ error: "Room name must be 50 characters or less" });
      return;
    }

    let match: Match | null = null;
    if (matchId) {
      match = await Match.findByPk(matchId);
    } else if (isSeasonRoom) {
      match = await findSeasonAnchorMatch();
    }

    if (!match) {
      res.status(404).json({ error: isSeasonRoom ? "No IPL match history found to anchor this season room" : "Match not found" });
      return;
    }

    if (!isSeasonRoom && match.status === "completed") {
      res.status(400).json({ error: "Cannot create room for a completed match" });
      return;
    }

    if (!isSeasonRoom && !isTodayMatch(match.startTime)) {
      res.status(400).json({ error: "Can only create rooms for today's matches" });
      return;
    }

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
          matchId: match.id,
          code,
          isSeasonRoom: Boolean(isSeasonRoom),
          seasonKey: isSeasonRoom ? "ipl_2026" : null,
          isPublic: Boolean(isPublic),
          maxPlayers: maxPlayers || 10,
          status: match.status === "live" ? "active" : "waiting",
        },
        { transaction: t }
      );

      await RoomMember.create({ roomId: newRoom.id, userId }, { transaction: t });

      if (!newRoom.isSeasonRoom) {
        await createRoomParticipant(userId, newRoom.id, match, t);
      }

      return newRoom;
    });

    const payload = await buildRoomPayload(room.id);
    res.status(201).json({
      ...payload,
      shareLink: `/room/join?code=${room.code}`,
    });
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

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
        return { ...room.toJSON(), memberCount, joinedAt: m.joinedAt };
      })
    );

    res.json({ rooms });
  } catch (error) {
    console.error("Get my rooms error:", error);
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

router.get("/public", authenticateUser, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const publicRooms = await Room.findAll({
      where: {
        isPublic: true,
        isSeasonRoom: false,
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

router.get("/:roomId", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const payload = await buildRoomPayload(roomId);

    if (!payload) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const room = payload.room as any;
    if (room.isSeasonRoom) {
      const currentSeasonMatch = await findBestSeasonMatch();
      res.json({ ...payload, currentSeasonMatch });
      return;
    }

    res.json(payload);
  } catch (error) {
    console.error("Get room error:", error);
    res.status(500).json({ error: "Failed to get room" });
  }
});

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
      include: [{ model: Match, as: "match", attributes: ["id", "team1", "team2", "team1Short", "team2Short", "status", "startTime"] }],
    });

    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    if (room.status === "closed") {
      res.status(400).json({ error: "This room is closed" });
      return;
    }

    const existingMember = await RoomMember.findOne({ where: { roomId: room.id, userId } });
    if (existingMember) {
      const payload = await buildRoomPayload(room.id);
      res.json({ ...payload, message: "Already a member of this room" });
      return;
    }

    const memberCount = await RoomMember.count({ where: { roomId: room.id } });
    if (memberCount >= room.maxPlayers) {
      res.status(400).json({ error: "Room is full" });
      return;
    }

    await sequelize.transaction(async (t) => {
      await RoomMember.create({ roomId: room.id, userId }, { transaction: t });
      if (!room.isSeasonRoom) {
        const match = await Match.findByPk(room.matchId, { transaction: t });
        if (match) {
          await createRoomParticipant(userId, room.id, match, t);
        }
      }
    });

    const io = req.app.get("io");
    const user = await User.findByPk(userId, { attributes: ["id", "displayName", "avatarConfig"] });
    io.to(`room:${room.id}`).emit("memberJoined", {
      userId,
      displayName: user?.displayName,
      avatarConfig: user?.avatarConfig,
      memberCount: memberCount + 1,
    });

    const payload = await buildRoomPayload(room.id);
    res.json(payload);
  } catch (error) {
    console.error("Join room error:", error);
    res.status(500).json({ error: "Failed to join room" });
  }
});

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
        isSeasonRoom: false,
        status: { [Op.in]: ["waiting", "active"] },
      },
    });

    if (publicRooms.length === 0) {
      res.status(404).json({ error: "No open rooms available for this match" });
      return;
    }

    let bestRoom: typeof publicRooms[0] | null = null;
    let bestCount = -1;

    for (const room of publicRooms) {
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
      await RoomMember.create({ roomId: bestRoom!.id, userId }, { transaction: t });
      const match = await Match.findByPk(bestRoom!.matchId, { transaction: t });
      if (match) {
        await createRoomParticipant(userId, bestRoom!.id, match, t);
      }
    });

    const io = req.app.get("io");
    const user = await User.findByPk(userId, { attributes: ["id", "displayName", "avatarConfig"] });
    io.to(`room:${bestRoom.id}`).emit("memberJoined", {
      userId,
      displayName: user?.displayName,
      avatarConfig: user?.avatarConfig,
      memberCount: bestCount + 1,
    });

    const payload = await buildRoomPayload(bestRoom.id);
    res.json(payload);
  } catch (error) {
    console.error("Join random room error:", error);
    res.status(500).json({ error: "Failed to join random room" });
  }
});

router.post("/:roomId/enter-match", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const { matchId } = req.body;
    const userId = req.userId!;

    const member = await RoomMember.findOne({ where: { roomId, userId } });
    if (!member) {
      res.status(403).json({ error: "Not a member of this room" });
      return;
    }

    const room = await Room.findByPk(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const targetMatchId = matchId || room.matchId;
    const match = await Match.findByPk(targetMatchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    if (match.status === "completed") {
      res.status(400).json({ error: "Cannot enter a completed match" });
      return;
    }

    if (room.isSeasonRoom && !isIplMatch(match)) {
      res.status(400).json({ error: "Season rooms only support IPL matches" });
      return;
    }

    await sequelize.transaction(async (t) => {
      await createRoomParticipant(userId, roomId, match, t);
      if (room.matchId !== match.id) {
        await room.update({ matchId: match.id, status: match.status === "live" ? "active" : "waiting" }, { transaction: t });
      }
    });

    res.json({ roomId, matchId: match.id, venueId: ROOM_VENUE_ID });
  } catch (error) {
    console.error("Enter room match error:", error);
    res.status(500).json({ error: "Failed to enter match" });
  }
});

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

router.get("/:roomId/leaderboard", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const room = await Room.findByPk(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const participants = await MatchParticipant.findAll({
      where: { matchId: room.matchId, venueId: ROOM_VENUE_ID, roomId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [["totalPoints", "DESC"]],
    });

    res.json({
      leaderboard: participants.map((p, idx) => ({
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
      })),
    });
  } catch (error) {
    console.error("Room leaderboard error:", error);
    res.status(500).json({ error: "Failed to get room leaderboard" });
  }
});

router.get("/:roomId/leaderboard/season", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const room = await Room.findByPk(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (!room.isSeasonRoom) {
      res.status(400).json({ error: "Season leaderboard is only available for season rooms" });
      return;
    }

    const leaderboard = await buildSeasonLeaderboard(roomId);
    res.json({ leaderboard });
  } catch (error) {
    console.error("Season room leaderboard error:", error);
    res.status(500).json({ error: "Failed to get season leaderboard" });
  }
});

router.get("/:roomId/leaderboard/round/:round", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const roundNum = parseInt(req.params.round as string, 10);

    if (isNaN(roundNum) || roundNum < 0 || roundNum > 6) {
      res.status(400).json({ error: "Invalid round number" });
      return;
    }

    const room = await Room.findByPk(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const roundPointsField = `round${roundNum}Points`;
    const participants = await MatchParticipant.findAll({
      where: { matchId: room.matchId, venueId: ROOM_VENUE_ID, roomId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [[roundPointsField, "DESC"]],
    });

    res.json({
      round: roundNum,
      leaderboard: participants.map((p, idx) => ({
        rank: idx + 1,
        userId: p.userId,
        displayName: (p as any).user?.displayName,
        avatarConfig: (p as any).user?.avatarConfig,
        roundPoints: (p as any)[roundPointsField] || 0,
        totalPoints: p.totalPoints,
      })),
    });
  } catch (error) {
    console.error("Room round leaderboard error:", error);
    res.status(500).json({ error: "Failed to get room round leaderboard" });
  }
});

export default router;
