import { Router, Request, Response } from "express";
import { MatchParticipant, User } from "../models";
import { parsePagination, paginationMeta } from "../utils/pagination";

const router = Router();

// Get round leaderboard — paginated. Default 25/page, max 100.
// Query: ?page=1&pageSize=25
router.get("/:matchId/:venueId/round/:round", async (req: Request, res: Response): Promise<void> => {
  try {
    const { matchId, venueId, round } = req.params;
    const roundNum = Number(round);

    if (!Number.isInteger(roundNum) || roundNum < 1 || roundNum > 6) {
      res.status(400).json({ error: "Round must be between 1 and 6" });
      return;
    }

    const pointsField = `round${roundNum}Points` as keyof typeof MatchParticipant.prototype;
    const p = parsePagination(req);

    const { count, rows: participants } = await MatchParticipant.findAndCountAll({
      where: { matchId, venueId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [[pointsField as string, "DESC"]],
      limit: p.limit,
      offset: p.offset,
    });

    const leaderboard = participants.map((row, index) => {
      const userData = (row as unknown as { user: { displayName: string; avatarConfig: string | null } }).user;
      return {
        // Rank must account for offset so page 2 ranks start at pageSize+1.
        rank: p.offset + index + 1,
        userId: row.userId,
        displayName: userData?.displayName || "Unknown",
        avatarConfig: userData?.avatarConfig ? (() => { try { return JSON.parse(userData.avatarConfig!); } catch { return null; } })() : null,
        points: (row as unknown as Record<string, number>)[pointsField as string] || 0,
        currentStreak: row.currentStreak,
        bestStreak: row.bestStreak,
        totalPoints: row.totalPoints,
      };
    });

    res.json({ round: roundNum, leaderboard, ...paginationMeta(p, count) });
  } catch (error) {
    console.error("Get round leaderboard error:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Get match (overall) leaderboard — paginated.
router.get("/:matchId/:venueId/match", async (req: Request, res: Response): Promise<void> => {
  try {
    const { matchId, venueId } = req.params;
    const p = parsePagination(req);

    const { count, rows: participants } = await MatchParticipant.findAndCountAll({
      where: { matchId, venueId },
      include: [{ model: User, as: "user", attributes: ["id", "displayName", "avatarConfig"] }],
      order: [["totalPoints", "DESC"]],
      limit: p.limit,
      offset: p.offset,
    });

    const leaderboard = participants.map((row, index) => {
      const userData = (row as unknown as { user: { displayName: string; avatarConfig: string | null } }).user;
      return {
        rank: p.offset + index + 1,
        userId: row.userId,
        displayName: userData?.displayName || "Unknown",
        avatarConfig: userData?.avatarConfig ? (() => { try { return JSON.parse(userData.avatarConfig!); } catch { return null; } })() : null,
        totalPoints: row.totalPoints,
        currentStreak: row.currentStreak,
        bestStreak: row.bestStreak,
        correctPredictions: row.correctPredictions,
        totalPredictions: row.totalPredictions,
        accuracy: row.totalPredictions > 0
          ? Math.round((row.correctPredictions / row.totalPredictions) * 100)
          : 0,
      };
    });

    res.json({ leaderboard, ...paginationMeta(p, count) });
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
