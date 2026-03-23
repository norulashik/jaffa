import { Router, Response } from "express";
import { Prediction, UserPrediction, MatchParticipant, User } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";

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
    if (round !== undefined && round !== '') where.round = Number(round);
    if (status) where.status = status;

    const predictions = await Prediction.findAll({
      where,
      order: [["createdAt", "ASC"]],
    });

    const userAnswers = await UserPrediction.findAll({
      where: { userId, matchId, venueId },
    });

    const answeredMap = new Map(userAnswers.map((a) => [a.predictionId, a]));

    const result = predictions.map((p) => ({
      ...p.toJSON(),
      userAnswer: answeredMap.get(p.id)?.toJSON() || null,
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

    const existing = await UserPrediction.findOne({
      where: { userId, predictionId },
    });

    if (existing) {
      res.status(400).json({ error: "Already answered this prediction" });
      return;
    }

    const validOptions = prediction.options.map((o) => o.key);
    if (!validOptions.includes(selectedOption)) {
      res.status(400).json({ error: "Invalid option" });
      return;
    }

    const participant = await MatchParticipant.findOne({
      where: { userId, matchId: prediction.matchId, venueId },
    });

    if (!participant) {
      res.status(400).json({ error: "Not a participant in this match" });
      return;
    }

    if (boostType === "boost" && participant.boostsUsedRound >= 2) {
      res.status(400).json({ error: "No boosts remaining for this round" });
      return;
    }

    if (boostType === "all_in" && participant.allInUsed) {
      res.status(400).json({ error: "All-In already used this match" });
      return;
    }

    const userPrediction = await UserPrediction.create({
      userId,
      predictionId,
      matchId: prediction.matchId,
      venueId,
      selectedOption,
      boostType: boostType || "none",
    });

    if (boostType === "boost") {
      await participant.update({ boostsUsedRound: participant.boostsUsedRound + 1 });
    } else if (boostType === "all_in") {
      await participant.update({ allInUsed: true });
    }

    await participant.update({
      totalPredictions: participant.totalPredictions + 1,
    });

    // Emit hype moment if all-in
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
    // Handle duplicate submission (unique constraint on userId+predictionId)
    if (error?.name === "SequelizeUniqueConstraintError") {
      res.status(400).json({ error: "Already answered this prediction" });
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

    res.json(userPredictions);
  } catch (error) {
    console.error("Get my predictions error:", error);
    res.status(500).json({ error: "Failed to get predictions" });
  }
});

export default router;
