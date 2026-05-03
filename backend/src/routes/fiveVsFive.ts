import { Router, Response } from "express";
import { Op } from "sequelize";
import {
  Match,
  Prediction,
  UserPrediction,
  User,
  FiveVsFiveRoom,
  FiveVsFiveSlot,
} from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import {
  ensure5v5Card,
  generateRoomCode,
  TOTAL_SLOTS,
  ROLE_DEFS,
  FIVE_V_FIVE_CATEGORY,
} from "../services/fiveVsFive";
import { ROOM_VENUE_ID } from "../services/roomVenue";

const router = Router();

// Build the room state shape returned by every "give me this room" endpoint.
// One central shaper so the frontend can rely on a stable contract.
async function buildRoomPayload(roomId: string) {
  const room = await FiveVsFiveRoom.findByPk(roomId, {
    include: [{ model: Match, as: "match" }],
  });
  if (!room) return null;
  const slots = await FiveVsFiveSlot.findAll({
    where: { roomId },
    include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
    order: [["teamSide", "ASC"], ["role", "ASC"]],
  });
  const match: any = (room as any).match;

  return {
    id: room.id,
    code: room.code,
    matchId: room.matchId,
    hostUserId: room.hostUserId,
    status: room.status,
    startedAt: room.startedAt,
    settledAt: room.settledAt,
    match: match ? {
      id: match.id,
      team1: match.team1,
      team2: match.team2,
      team1Short: match.team1Short,
      team2Short: match.team2Short,
      startTime: match.startTime,
      status: match.status,
    } : null,
    slots: slots.map((s) => ({
      id: s.id,
      teamSide: s.teamSide,
      role: s.role,
      userId: s.userId,
      claimedAt: s.claimedAt,
      user: (s as any).user
        ? { id: (s as any).user.id, displayName: (s as any).user.displayName, avatarConfig: (s as any).user.avatarConfig }
        : null,
    })),
    slotsFilled: slots.length,
    slotsTotal: TOTAL_SLOTS,
    resultSummary: room.resultSummary,
  };
}

// ── Active rooms for the current user ────────────────────────────────
//
// Returns the user's open / active 5v5 rooms so the landing page can offer a
// "Resume" CTA instead of asking them to recreate / re-join. Filters out
// completed + voided.
router.get("/active", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const userSlots = await FiveVsFiveSlot.findAll({
      where: { userId },
      include: [
        {
          model: FiveVsFiveRoom,
          as: "room",
          where: { status: ["waiting", "active"] },
          required: true,
          include: [{ model: Match, as: "match" }],
        },
      ],
    });
    const payloads = await Promise.all(
      userSlots.map((s) => buildRoomPayload(s.roomId)),
    );
    res.json({ rooms: payloads.filter(Boolean) });
  } catch (error) {
    console.error("[5v5] active error:", error);
    res.status(500).json({ error: "Failed to list active rooms" });
  }
});

// ── Create a room ────────────────────────────────────────────────────
router.post("/rooms", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { matchId } = req.body as { matchId?: string };
    const userId = req.userId!;
    if (!matchId) {
      res.status(400).json({ error: "matchId is required" });
      return;
    }
    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    if (match.status === "completed") {
      res.status(400).json({ error: "Match is over" });
      return;
    }
    if (match.startTime && new Date(match.startTime).getTime() <= Date.now()) {
      res.status(400).json({ error: "Match has already started" });
      return;
    }

    // 1-room-per-match enforcement: if the user is already in a 5v5 room
    // for this match (any status besides voided/completed), 409 with the
    // existing room id so the client can route them back.
    const existingSlot = await FiveVsFiveSlot.findOne({
      where: { userId },
      include: [{
        model: FiveVsFiveRoom,
        as: "room",
        where: { matchId, status: ["waiting", "active"] },
        required: true,
      }],
    });
    if (existingSlot) {
      res.status(409).json({ error: "Already in a 5v5 room for this match", roomId: existingSlot.roomId });
      return;
    }

    // Make sure the question pool exists (idempotent — safe to call repeatedly).
    await ensure5v5Card(match);

    // Allocate a unique 6-char code; retry on collision (rare).
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateRoomCode();
      const taken = await FiveVsFiveRoom.findOne({ where: { code: candidate } });
      if (!taken) { code = candidate; break; }
    }
    if (!code) { res.status(500).json({ error: "Could not allocate a room code" }); return; }

    const room = await FiveVsFiveRoom.create({
      matchId,
      code,
      hostUserId: userId,
      status: "waiting",
      startedAt: null,
      settledAt: null,
      resultSummary: null,
    });

    const payload = await buildRoomPayload(room.id);
    res.status(201).json(payload);
  } catch (error) {
    console.error("[5v5] create error:", error);
    res.status(500).json({ error: "Failed to create 5v5 room" });
  }
});

// ── Join an existing room by 6-char code ─────────────────────────────
router.post("/rooms/join", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body as { code?: string };
    const userId = req.userId!;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "code is required" });
      return;
    }
    const room = await FiveVsFiveRoom.findOne({ where: { code: code.toUpperCase() } });
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.status !== "waiting") {
      res.status(400).json({ error: "Room is no longer accepting joins" });
      return;
    }
    const match = await Match.findByPk(room.matchId);
    if (!match || (match.startTime && new Date(match.startTime).getTime() <= Date.now())) {
      res.status(400).json({ error: "Match has already started" });
      return;
    }
    // Per-match 1-room cap — if user is already in another room for the
    // same match, redirect them back instead of letting them stack rooms.
    const existingSlot = await FiveVsFiveSlot.findOne({
      where: { userId },
      include: [{
        model: FiveVsFiveRoom,
        as: "room",
        where: { matchId: room.matchId, status: ["waiting", "active"] },
        required: true,
      }],
    });
    if (existingSlot && existingSlot.roomId !== room.id) {
      res.status(409).json({ error: "Already in another 5v5 room for this match", roomId: existingSlot.roomId });
      return;
    }
    const payload = await buildRoomPayload(room.id);
    res.json(payload);
  } catch (error) {
    console.error("[5v5] join error:", error);
    res.status(500).json({ error: "Failed to join 5v5 room" });
  }
});

// ── Read room state ──────────────────────────────────────────────────
router.get("/rooms/:roomId", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = await buildRoomPayload(req.params.roomId as string);
    if (!payload) { res.status(404).json({ error: "Room not found" }); return; }
    res.json(payload);
  } catch (error) {
    console.error("[5v5] read error:", error);
    res.status(500).json({ error: "Failed to read room" });
  }
});

// ── Claim a (teamSide, role) slot ────────────────────────────────────
router.post("/rooms/:roomId/claim", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const { teamSide, role } = req.body as { teamSide?: "team1" | "team2"; role?: number };
    const userId = req.userId!;

    if (teamSide !== "team1" && teamSide !== "team2") {
      res.status(400).json({ error: "teamSide must be team1 or team2" });
      return;
    }
    if (typeof role !== "number" || role < 1 || role > 5) {
      res.status(400).json({ error: "role must be 1-5" });
      return;
    }

    const room = await FiveVsFiveRoom.findByPk(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.status !== "waiting") {
      res.status(400).json({ error: "Room is not open for joining" });
      return;
    }
    const match = await Match.findByPk(room.matchId);
    if (match?.startTime && new Date(match.startTime).getTime() <= Date.now()) {
      res.status(400).json({ error: "Match has already started" });
      return;
    }

    // Reject if user already has a slot in this room (one slot per user).
    const existingForUser = await FiveVsFiveSlot.findOne({ where: { roomId, userId } });
    if (existingForUser) {
      res.status(400).json({ error: "You already have a slot in this room" });
      return;
    }
    // Auto-balance: if the user picked a side that's already full, reject
    // and let the client retry against the other side. The frontend
    // pre-checks this but the server enforces it as the source of truth.
    const sideCount = await FiveVsFiveSlot.count({ where: { roomId, teamSide } });
    if (sideCount >= 5) {
      res.status(400).json({ error: "That team is full — pick the other side" });
      return;
    }
    // Reject if the (teamSide, role) tuple is already claimed.
    const taken = await FiveVsFiveSlot.findOne({ where: { roomId, teamSide, role } });
    if (taken) {
      res.status(400).json({ error: "That role is already claimed" });
      return;
    }

    await FiveVsFiveSlot.create({ roomId, teamSide, role, userId });

    const payload = await buildRoomPayload(roomId);
    const io = req.app.get("io");
    io.to(`5v5:${roomId}`).emit("5v5.slotClaimed", payload);
    res.json(payload);
  } catch (error) {
    console.error("[5v5] claim error:", error);
    res.status(500).json({ error: "Failed to claim slot" });
  }
});

// ── Leave (release) the user's slot — only while waiting ────────────
router.post("/rooms/:roomId/leave", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const userId = req.userId!;
    const room = await FiveVsFiveRoom.findByPk(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.status !== "waiting") {
      res.status(400).json({ error: "Cannot leave once the room has started" });
      return;
    }
    const slot = await FiveVsFiveSlot.findOne({ where: { roomId, userId } });
    if (!slot) {
      res.status(404).json({ error: "You're not in this room" });
      return;
    }
    await slot.destroy();
    // Host hand-off: if the host left, transfer to the earliest remaining slot.
    if (room.hostUserId === userId) {
      const next = await FiveVsFiveSlot.findOne({
        where: { roomId },
        order: [["claimedAt", "ASC"]],
      });
      if (next) await room.update({ hostUserId: next.userId });
    }
    const payload = await buildRoomPayload(roomId);
    const io = req.app.get("io");
    io.to(`5v5:${roomId}`).emit("5v5.slotReleased", payload);
    res.json(payload);
  } catch (error) {
    console.error("[5v5] leave error:", error);
    res.status(500).json({ error: "Failed to leave room" });
  }
});

// ── Host clicks Start ────────────────────────────────────────────────
router.post("/rooms/:roomId/start", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const userId = req.userId!;
    const room = await FiveVsFiveRoom.findByPk(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.hostUserId !== userId) {
      res.status(403).json({ error: "Only the host can start the room" });
      return;
    }
    if (room.status !== "waiting") {
      res.status(400).json({ error: "Room is not in waiting state" });
      return;
    }
    const filled = await FiveVsFiveSlot.count({ where: { roomId } });
    if (filled < TOTAL_SLOTS) {
      res.status(400).json({ error: `Need ${TOTAL_SLOTS} players to start (${filled}/${TOTAL_SLOTS})` });
      return;
    }
    await room.update({ status: "active", startedAt: new Date() });
    const payload = await buildRoomPayload(roomId);
    const io = req.app.get("io");
    io.to(`5v5:${roomId}`).emit("5v5.started", payload);
    res.json(payload);
  } catch (error) {
    console.error("[5v5] start error:", error);
    res.status(500).json({ error: "Failed to start room" });
  }
});

// ── User's 3 role-questions for their slot ───────────────────────────
router.get("/rooms/:roomId/questions", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const userId = req.userId!;
    const slot = await FiveVsFiveSlot.findOne({ where: { roomId, userId } });
    if (!slot) {
      res.status(403).json({ error: "You don't have a slot in this room" });
      return;
    }
    const room = await FiveVsFiveRoom.findByPk(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }

    const roleKey = ROLE_DEFS.find((r) => r.role === slot.role)?.key;
    if (!roleKey) { res.status(500).json({ error: "Bad role" }); return; }

    // The 3 questions for this slot's (role, teamSide).
    const preds = await Prediction.findAll({
      where: {
        matchId: room.matchId,
        category: FIVE_V_FIVE_CATEGORY,
        templateKey: { [Op.like]: `5v5_${roleKey}_%_${slot.teamSide}` },
      },
      order: [["createdAt", "ASC"]],
    });

    const userAnswers = await UserPrediction.findAll({
      where: { userId, roomId, predictionId: { [Op.in]: preds.map((p) => p.id) } },
    });
    const ansMap = new Map(userAnswers.map((u) => [u.predictionId, u]));

    res.json({
      slot: { teamSide: slot.teamSide, role: slot.role, roleKey, roleTitle: ROLE_DEFS.find((r) => r.role === slot.role)?.title },
      questions: preds.map((p) => ({
        id: p.id,
        question: p.question,
        options: p.options,
        templateKey: p.templateKey,
        status: p.status,
        correctOption: p.correctOption,
        userAnswer: ansMap.get(p.id) ? {
          selectedOption: ansMap.get(p.id)!.selectedOption,
          isCorrect: ansMap.get(p.id)!.isCorrect,
          pointsEarned: ansMap.get(p.id)!.pointsEarned,
        } : null,
      })),
    });
  } catch (error) {
    console.error("[5v5] questions error:", error);
    res.status(500).json({ error: "Failed to load questions" });
  }
});

// ── Submit one answer ────────────────────────────────────────────────
router.post("/rooms/:roomId/answer", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const { predictionId, selectedOption } = req.body as { predictionId?: string; selectedOption?: string };
    const userId = req.userId!;

    if (!predictionId || !selectedOption) {
      res.status(400).json({ error: "predictionId and selectedOption are required" });
      return;
    }

    const slot = await FiveVsFiveSlot.findOne({ where: { roomId, userId } });
    if (!slot) { res.status(403).json({ error: "Not in this room" }); return; }

    const room = await FiveVsFiveRoom.findByPk(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.status === "completed" || room.status === "voided") {
      res.status(400).json({ error: "Room is closed" });
      return;
    }
    const match = await Match.findByPk(room.matchId);
    if (match?.startTime && new Date(match.startTime).getTime() <= Date.now()) {
      res.status(400).json({ error: "Match has started — answers locked" });
      return;
    }

    const pred = await Prediction.findByPk(predictionId);
    if (!pred || pred.category !== FIVE_V_FIVE_CATEGORY) {
      res.status(404).json({ error: "Prediction not found" });
      return;
    }
    // Question-ownership guard: the prediction's templateKey must match the
    // user's (teamSide, role).
    const roleKey = ROLE_DEFS.find((r) => r.role === slot.role)?.key;
    const expectedSuffix = `_${slot.teamSide}`;
    if (
      !pred.templateKey ||
      !pred.templateKey.startsWith(`5v5_${roleKey}_`) ||
      !pred.templateKey.endsWith(expectedSuffix)
    ) {
      res.status(403).json({ error: "Question doesn't belong to your role" });
      return;
    }
    const validKeys = pred.options.map((o) => o.key);
    if (!validKeys.includes(selectedOption)) {
      res.status(400).json({ error: "Invalid option" });
      return;
    }

    // Upsert keyed by (userId, predictionId, roomId). Allow edit while
    // match hasn't started.
    const existing = await UserPrediction.findOne({
      where: { userId, predictionId, roomId },
    });
    if (existing) {
      await existing.update({ selectedOption });
    } else {
      await UserPrediction.create({
        userId,
        predictionId,
        matchId: room.matchId,
        venueId: ROOM_VENUE_ID,
        roomId,
        selectedOption,
        boostType: "none",
      });
    }

    const io = req.app.get("io");
    io.to(`5v5:${roomId}`).emit("5v5.answerSubmitted", { userId, predictionId });

    res.json({ ok: true });
  } catch (error) {
    console.error("[5v5] answer error:", error);
    res.status(500).json({ error: "Failed to submit answer" });
  }
});

// ── Final results (after settlement) ─────────────────────────────────
router.get("/rooms/:roomId/results", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.roomId as string;
    const room = await FiveVsFiveRoom.findByPk(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }

    const slots = await FiveVsFiveSlot.findAll({
      where: { roomId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [["teamSide", "ASC"], ["role", "ASC"]],
    });
    const match = await Match.findByPk(room.matchId);

    res.json({
      id: room.id,
      status: room.status,
      settledAt: room.settledAt,
      match: match ? {
        team1: match.team1,
        team2: match.team2,
        team1Short: match.team1Short,
        team2Short: match.team2Short,
      } : null,
      slots: slots.map((s) => ({
        teamSide: s.teamSide,
        role: s.role,
        userId: s.userId,
        user: (s as any).user
          ? { id: (s as any).user.id, displayName: (s as any).user.displayName, avatarConfig: (s as any).user.avatarConfig }
          : null,
      })),
      summary: room.resultSummary,
    });
  } catch (error) {
    console.error("[5v5] results error:", error);
    res.status(500).json({ error: "Failed to load results" });
  }
});

export default router;
