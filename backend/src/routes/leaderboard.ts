import { Router, Request, Response } from "express";
import { MatchParticipant, User } from "../models";

const router = Router();

// Get round leaderboard
router.get("/:matchId/:venueId/round/:round", async (req: Request, res: Response): Promise<void> => {
  try {
    const { matchId, venueId, round } = req.params;
    const roundNum = Number(round);

    const pointsField = `round${roundNum}Points` as keyof typeof MatchParticipant.prototype;

    const participants = await MatchParticipant.findAll({
      where: { matchId, venueId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName"] }],
      order: [[pointsField as string, "DESC"]],
      limit: 50,
    });

    const leaderboard = participants.map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      displayName: (p as unknown as { user: { displayName: string } }).user?.displayName || "Unknown",
      points: (p as unknown as Record<string, number>)[pointsField as string] || 0,
      currentStreak: p.currentStreak,
      bestStreak: p.bestStreak,
      totalPoints: p.totalPoints,
    }));

    res.json({ round: roundNum, leaderboard });
  } catch (error) {
    console.error("Get round leaderboard error:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Get match (overall) leaderboard
router.get("/:matchId/:venueId/match", async (req: Request, res: Response): Promise<void> => {
  try {
    const { matchId, venueId } = req.params;

    const participants = await MatchParticipant.findAll({
      where: { matchId, venueId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName"] }],
      order: [["totalPoints", "DESC"]],
      limit: 50,
    });

    const leaderboard = participants.map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      displayName: (p as unknown as { user: { displayName: string } }).user?.displayName || "Unknown",
      totalPoints: p.totalPoints,
      currentStreak: p.currentStreak,
      bestStreak: p.bestStreak,
      correctPredictions: p.correctPredictions,
      totalPredictions: p.totalPredictions,
      accuracy: p.totalPredictions > 0
        ? Math.round((p.correctPredictions / p.totalPredictions) * 100)
        : 0,
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error("Get match leaderboard error:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Get player count for a venue/match
router.get("/:matchId/:venueId/count", async (req: Request, res: Response): Promise<void> => {
  try {
    const { matchId, venueId } = req.params;
    const count = await MatchParticipant.count({ where: { matchId, venueId } });
    res.json({ count });
  } catch (error) {
    console.error("Get player count error:", error);
    res.status(500).json({ error: "Failed to get count" });
  }
});

export default router;
