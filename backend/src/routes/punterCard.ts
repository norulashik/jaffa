import { Router, Response } from "express";
import { Op } from "sequelize";
import { Prediction, UserPrediction, Match, Venue } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { ensurePunterCard } from "../services/punterCard";

const router = Router();

// GET /api/punter-card/:matchId?venueId=...
// Returns the 10 punter-card questions for a match + the user's answers (if any).
// Also triggers generation if we're past opensAt and card doesn't exist yet.
router.get("/:matchId", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = req.query.venueId as string | undefined;
    const userId = req.userId!;

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    // Opportunistic generation — if the user opens the card page and it's past
    // midnight on match day but the poll hasn't run yet, build it now.
    try {
      await ensurePunterCard(match);
    } catch (err) {
      console.error("[PunterCard route] ensure error:", err);
    }

    const cards = await Prediction.findAll({
      where: { matchId, category: "punter_card" },
      order: [["createdAt", "ASC"]],
    });

    const userAnswers = venueId
      ? await UserPrediction.findAll({
          where: { userId, matchId, venueId, predictionId: { [Op.in]: cards.map((c) => c.id) } },
        })
      : await UserPrediction.findAll({
          where: { userId, matchId, predictionId: { [Op.in]: cards.map((c) => c.id) } },
        });

    const answeredMap = new Map(userAnswers.map((a) => [a.predictionId, a]));

    const now = new Date();
    const questions = cards
      .filter((c) => !c.opensAt || new Date(c.opensAt) <= now)
      .map((c) => ({
        ...c.toJSON(),
        userAnswer: answeredMap.get(c.id)?.toJSON() || null,
      }));

    res.json({
      matchId,
      match: {
        team1: match.team1,
        team2: match.team2,
        team1Short: match.team1Short,
        team2Short: match.team2Short,
        startTime: match.startTime,
        status: match.status,
      },
      questions,
      // A late joiner who arrived after toss can't answer the toss question
      // (status === "resolved" with their userAnswer null). Treating those —
      // and any other already-locked / already-resolved Qs — as "skipped"
      // lets them share once they've done everything that's still
      // answerable. Without this the Share button would never appear.
      allAnswered: questions.length > 0 && questions.every(
        (q) => q.userAnswer || q.status === "resolved" || q.status === "locked"
      ),
    });
  } catch (error) {
    console.error("Get punter card error:", error);
    res.status(500).json({ error: "Failed to get punter card" });
  }
});

// POST /api/punter-card/:matchId/answer
// Body: { venueId, answers: [{ predictionId, selectedOption }] }
// Batch-submit all 10 answers in one call. Matches the product flow: user fills
// out the card, then locks it.
router.post("/:matchId/answer", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const { venueId, answers } = req.body as {
      venueId: string;
      answers: { predictionId: string; selectedOption: string }[];
    };
    const userId = req.userId!;

    if (!venueId || !Array.isArray(answers) || answers.length === 0) {
      res.status(400).json({ error: "venueId and non-empty answers[] required" });
      return;
    }

    const match = await Match.findByPk(matchId);
    if (!match || !match.startTime) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    if (new Date() >= new Date(match.startTime)) {
      res.status(400).json({ error: "Match has started — punter card is locked" });
      return;
    }

    const venue = await Venue.findByPk(venueId);
    if (!venue) {
      res.status(404).json({ error: "Venue not found" });
      return;
    }

    const predIds = answers.map((a) => a.predictionId);
    const preds = await Prediction.findAll({
      where: { matchId, category: "punter_card", id: { [Op.in]: predIds } },
    });
    const predMap = new Map(preds.map((p) => [p.id, p]));

    let saved = 0;
    for (const ans of answers) {
      const pred = predMap.get(ans.predictionId);
      if (!pred) continue;
      const validKeys = pred.options.map((o) => o.key);
      if (!validKeys.includes(ans.selectedOption)) continue;

      // Upsert — updating is allowed until the match starts
      const existing = await UserPrediction.findOne({
        where: { userId, predictionId: pred.id },
      });
      if (existing) {
        await existing.update({ selectedOption: ans.selectedOption, venueId });
      } else {
        await UserPrediction.create({
          userId,
          predictionId: pred.id,
          matchId,
          venueId,
          selectedOption: ans.selectedOption,
          boostType: "none",
        });
      }
      saved += 1;
    }

    res.json({ saved });
  } catch (error) {
    console.error("Submit punter card error:", error);
    res.status(500).json({ error: "Failed to submit punter card" });
  }
});

// GET /api/punter-card/my/cards
// List all punter cards the user has answered, newest first. For the profile tab.
router.get("/my/cards", authenticateUser, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = _req.userId!;
    const ups = await UserPrediction.findAll({
      where: { userId },
      include: [
        {
          model: Prediction,
          as: "prediction",
          where: { category: "punter_card" },
          required: true,
        },
      ],
      order: [["answeredAt", "DESC"]],
    });

    // Group by matchId
    const byMatch = new Map<string, any[]>();
    for (const up of ups) {
      const list = byMatch.get(up.matchId) || [];
      list.push(up.toJSON());
      byMatch.set(up.matchId, list);
    }

    const matchIds = Array.from(byMatch.keys());
    const matches = await Match.findAll({ where: { id: { [Op.in]: matchIds } } });
    const matchMap = new Map(matches.map((m) => [m.id, m]));

    const cards = matchIds.map((mid) => {
      const m = matchMap.get(mid);
      const answers = byMatch.get(mid) || [];
      const correct = answers.filter((a) => a.isCorrect === true).length;
      const resolved = answers.filter((a) => a.isCorrect !== null && a.isCorrect !== undefined).length;
      const totalPoints = answers.reduce((s, a) => s + (a.pointsEarned || 0), 0);
      return {
        matchId: mid,
        team1: m?.team1 || null,
        team2: m?.team2 || null,
        team1Short: m?.team1Short || null,
        team2Short: m?.team2Short || null,
        startTime: m?.startTime || null,
        status: m?.status || null,
        answers,
        correctCount: correct,
        resolvedCount: resolved,
        totalCount: answers.length,
        totalPoints,
      };
    });

    cards.sort((a, b) => {
      const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
      return tb - ta;
    });

    res.json({ cards });
  } catch (error) {
    console.error("Get my punter cards error:", error);
    res.status(500).json({ error: "Failed to get punter cards" });
  }
});

export default router;
