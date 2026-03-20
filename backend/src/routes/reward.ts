import { Router, Response } from "express";
import { Reward, User } from "../models";
import { authenticateUser, authenticateVenue, AuthRequest } from "../middleware/auth";

const router = Router();

// Get my rewards
router.get("/my", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { matchId } = req.query;

    const where: Record<string, unknown> = { userId };
    if (matchId) where.matchId = matchId;

    const rewards = await Reward.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    res.json(rewards);
  } catch (error) {
    console.error("Get rewards error:", error);
    res.status(500).json({ error: "Failed to get rewards" });
  }
});

// Verify and redeem a reward (venue staff action)
router.post("/redeem", authenticateVenue, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.venueId!;
    const { code } = req.body;

    if (!code || code.length !== 4) {
      res.status(400).json({ error: "Invalid code" });
      return;
    }

    const reward = await Reward.findOne({
      where: { code, venueId, status: "active" },
      include: [{ model: User, as: "user", attributes: ["displayName", "phone"] }],
    });

    if (!reward) {
      res.status(404).json({ error: "Invalid code or already redeemed" });
      return;
    }

    if (new Date() > reward.expiresAt) {
      await reward.update({ status: "expired" });
      res.status(400).json({ error: "Reward has expired" });
      return;
    }

    await reward.update({
      status: "redeemed",
      redeemedAt: new Date(),
    });

    res.json({
      message: "Reward redeemed!",
      reward: {
        id: reward.id,
        rewardText: reward.rewardText,
        position: reward.position,
        round: reward.round,
        user: (reward as unknown as { user: { displayName: string; phone: string } }).user,
      },
    });
  } catch (error) {
    console.error("Redeem reward error:", error);
    res.status(500).json({ error: "Failed to redeem reward" });
  }
});

// Get venue's active rewards (venue dashboard)
router.get("/venue", authenticateVenue, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.venueId!;
    const { matchId } = req.query;

    const where: Record<string, unknown> = { venueId };
    if (matchId) where.matchId = matchId;

    const rewards = await Reward.findAll({
      where,
      include: [{ model: User, as: "user", attributes: ["displayName", "phone"] }],
      order: [["createdAt", "DESC"]],
    });

    res.json(rewards);
  } catch (error) {
    console.error("Get venue rewards error:", error);
    res.status(500).json({ error: "Failed to get rewards" });
  }
});

export default router;
