import { Router, Response } from "express";
import { Op } from "sequelize";
import { Prediction, UserPrediction, MatchParticipant, User, PredictionAggregate } from "../models";
import { GLOBAL_SCOPE_ID } from "../models/PredictionAggregate";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import sequelize from "../config/database";

type AggregatePayload = {
  totalAnswered: number;
  correctCount: number;
  correctPct: number;
};

async function buildAggregatesMap(
  predictionIds: string[],
  venueId: string | undefined
): Promise<Map<string, { global?: AggregatePayload; venue?: AggregatePayload }>> {
  const out = new Map<string, { global?: AggregatePayload; venue?: AggregatePayload }>();
  if (predictionIds.length === 0) return out;

  const scopeOr: any[] = [{ scope: "global", scopeId: GLOBAL_SCOPE_ID }];
  if (venueId) scopeOr.push({ scope: "venue", scopeId: venueId });

  const rows = await PredictionAggregate.findAll({
    where: {
      predictionId: { [Op.in]: predictionIds },
      [Op.or]: scopeOr,
    },
  });

  for (const row of rows) {
    const entry = out.get(row.predictionId) || {};
    const payload: AggregatePayload = {
      totalAnswered: row.totalAnswered,
      correctCount: row.correctCount,
      correctPct: row.correctPct,
    };
    if (row.scope === "global") entry.global = payload;
    else if (row.scope === "venue") entry.venue = payload;
    out.set(row.predictionId, entry);
  }

  return out;
}

const router = Router();

// Get predictions for a match
router.get("/:matchId", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = req.query.venueId as string;
    const round = req.query.round as string | undefined;
    const status = req.query.status as string | undefined;
    const userId = req.userId!;

    const where: any = { matchId };
    if (round) where.round = Number(round);
    if (status) where.status = status;

    const predictions = await Prediction.findAll({
      where,
      order: [["createdAt", "ASC"]],
    });

    // Hide predictions that haven't opened yet
    const now = new Date();
    const visible = predictions.filter(
      (p) => !p.opensAt || new Date(p.opensAt) <= now
    );

    const userAnswers = await UserPrediction.findAll({
      where: { userId, matchId, venueId },
    });

    const answeredMap = new Map(userAnswers.map((a) => [a.predictionId, a]));

    const aggregatesMap = await buildAggregatesMap(
      visible.map((p) => p.id),
      venueId
    );

    const result = visible.map((p) => ({
      ...p.toJSON(),
      userAnswer: answeredMap.get(p.id)?.toJSON() || null,
      aggregates: aggregatesMap.get(p.id) || null,
    }));

    res.json(result);
  } catch (error) {
    console.error("Get predictions error:", error);
    res.status(500).json({ error: "Failed to get predictions" });
  }
});

// Submit a prediction answer
router.post("/:predictionId/answer", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const predictionId = req.params.predictionId as string;
    const { selectedOption, boostType, venueId } = req.body;
    const userId = req.userId!;

    const prediction = await Prediction.findByPk(predictionId);
    if (!prediction) {
      res.status(404).json({ error: "Prediction not found" });
      return;
    }

    if (prediction.status !== "open") {
      res.status(400).json({ error: "Prediction is no longer open" });
      return;
    }

    if (prediction.opensAt && new Date() < new Date(prediction.opensAt)) {
      res.status(400).json({ error: "Prediction is not yet available" });
      return;
    }

    if (prediction.expiresAt && new Date() > new Date(prediction.expiresAt)) {
      res.status(400).json({ error: "Prediction window has expired" });
      return;
    }

    const validOptions = prediction.options.map((o) => o.key);
    if (!validOptions.includes(selectedOption)) {
      res.status(400).json({ error: "Invalid option" });
      return;
    }

    // Use transaction to prevent race conditions (duplicate answers, boost over-use)
    const userPrediction = await sequelize.transaction(async (t) => {
      const existing = await UserPrediction.findOne({
        where: { userId, predictionId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (existing) {
        throw new Error("ALREADY_ANSWERED");
      }

      const participant = await MatchParticipant.findOne({
        where: { userId, matchId: prediction.matchId, venueId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!participant) {
        throw new Error("NOT_PARTICIPANT");
      }

      // Product rule: 1 boost per phase (round), 1 all-in per innings.
      // Innings = 1 for rounds 1-3, 2 for rounds 4-6.
      const predictionInnings = prediction.round >= 4 ? 2 : 1;
      const allInFlagForInnings = predictionInnings === 1 ? "allInUsedInnings1" : "allInUsedInnings2";

      if (boostType === "boost" && participant.boostsUsedRound >= 1) {
        throw new Error("NO_BOOSTS");
      }

      if (
        boostType === "all_in" &&
        (participant as any)[allInFlagForInnings] === true
      ) {
        throw new Error("ALL_IN_USED");
      }

      const up = await UserPrediction.create({
        userId,
        predictionId,
        matchId: prediction.matchId,
        venueId,
        selectedOption,
        boostType: boostType || "none",
      }, { transaction: t });

      const updateData: Record<string, unknown> = {
        totalPredictions: participant.totalPredictions + 1,
      };
      if (boostType === "boost") {
        updateData.boostsUsedRound = participant.boostsUsedRound + 1;
      } else if (boostType === "all_in") {
        updateData[allInFlagForInnings] = true;
        // Keep legacy flag true so any older reader that still looks at `allInUsed`
        // sees "used" instead of an unexpected refresh of the button.
        updateData.allInUsed = true;
      }
      await participant.update(updateData, { transaction: t });

      return up;
    });

    // Emit hype moment if all-in (outside transaction — non-critical)
    if (boostType === "all_in") {
      const io = req.app.get("io");
      const user = await User.findByPk(userId);
      io.to(`venue:${venueId}:${prediction.matchId}`).emit("hypeEvent", {
        type: "all_in",
        playerName: user?.displayName || "Someone",
        prediction: prediction.question,
        selectedOption,
      });
    }

    res.status(201).json({ userPrediction });
  } catch (error: any) {
    if (error.message === "ALREADY_ANSWERED") {
      res.status(400).json({ error: "Already answered this prediction" });
      return;
    }
    if (error.message === "NOT_PARTICIPANT") {
      res.status(400).json({ error: "Not a participant in this match" });
      return;
    }
    if (error.message === "NO_BOOSTS") {
      res.status(400).json({ error: "No boosts remaining for this round" });
      return;
    }
    if (error.message === "ALL_IN_USED") {
      res.status(400).json({ error: "All-In already used this match" });
      return;
    }
    console.error("Submit prediction error:", error);
    res.status(500).json({ error: "Failed to submit prediction" });
  }
});

// Get user's prediction history for a match
router.get("/:matchId/my-predictions", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = req.query.venueId as string;
    const userId = req.userId!;

    const userPredictions = await UserPrediction.findAll({
      where: { userId, matchId, venueId },
      include: [{ model: Prediction, as: "prediction" }],
      order: [["answeredAt", "DESC"]],
    });

    const aggregatesMap = await buildAggregatesMap(
      userPredictions.map((up) => up.predictionId),
      venueId
    );

    const result = userPredictions.map((up) => ({
      ...up.toJSON(),
      aggregates: aggregatesMap.get(up.predictionId) || null,
    }));

    res.json(result);
  } catch (error) {
    console.error("Get my predictions error:", error);
    res.status(500).json({ error: "Failed to get predictions" });
  }
});

export default router;
