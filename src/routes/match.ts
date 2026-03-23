import { Router, Request, Response } from "express";
import { Match, MatchParticipant, Prediction, UserPrediction } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";

const router = Router();

// Get current/upcoming matches
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const matches = await Match.findAll({
      where: { status: ["upcoming", "live"] },
      order: [["startTime", "ASC"]],
    });
    res.json(matches);
  } catch (error) {
    console.error("Get matches error:", error);
    res.status(500).json({ error: "Failed to get matches" });
  }
});

// Get match details
router.get("/:matchId", async (req: Request, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    res.json(match);
  } catch (error) {
    console.error("Get match error:", error);
    res.status(500).json({ error: "Failed to get match" });
  }
});

// Join a match at a venue
router.post("/:matchId/join", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const { venueId } = req.body;
    const userId = req.userId!;

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const existing = await MatchParticipant.findOne({
      where: { userId, matchId, venueId },
    });

    if (existing) {
      res.json({ participant: existing, message: "Already joined" });
      return;
    }

    const participant = await MatchParticipant.create({
      userId,
      matchId,
      venueId,
    });

    const io = req.app.get("io");
    const playerCount = await MatchParticipant.count({ where: { matchId, venueId } });
    io.to(`venue:${venueId}:${matchId}`).emit("playerCount", { count: playerCount });

    res.status(201).json({ participant });
  } catch (error: any) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      const existing = await MatchParticipant.findOne({ where: { userId: req.userId!, matchId: req.params.matchId as string, venueId: req.body.venueId } });
      res.json({ participant: existing, message: "Already joined" });
      return;
    }
    console.error("Join match error:", error);
    res.status(500).json({ error: "Failed to join match" });
  }
});

// Get match state for a user
router.get("/:matchId/state", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = req.query.venueId as string;
    const userId = req.userId!;

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const participant = await MatchParticipant.findOne({
      where: { userId, matchId, venueId },
    });

    const openPredictions = await Prediction.findAll({
      where: { matchId, status: "open" },
      order: [["createdAt", "ASC"]],
    });

    // Include user's answers so frontend knows which predictions are already answered
    const userAnswers = await UserPrediction.findAll({
      where: { userId, matchId },
      attributes: ["predictionId"],
    });
    const answeredIds = new Set(userAnswers.map((a) => a.predictionId));
    const openWithAnswerStatus = openPredictions.map((p) => ({
      ...p.toJSON(),
      userAnswered: answeredIds.has(p.id),
    }));

    const playerCount = await MatchParticipant.count({
      where: { matchId, venueId },
    });

    res.json({ match, participant, openPredictions: openWithAnswerStatus, playerCount });
  } catch (error) {
    console.error("Get match state error:", error);
    res.status(500).json({ error: "Failed to get match state" });
  }
});

export default router;
