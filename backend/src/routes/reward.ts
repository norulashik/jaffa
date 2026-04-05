import { Router, Response } from "express";
import { Reward, User } from "../models";
import sequelize from "../config/database";
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

    let rewardResult: any = null;

    await sequelize.transaction(async (t) => {
      const reward = await Reward.findOne({
        where: { code, venueId, status: "active" },
        include: [{ model: User, as: "user", attributes: ["displayName", "phone"] }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!reward) {
        rewardResult = { notFound: true };
        return;
      }

      if (new Date() > reward.expiresAt) {
        await reward.update({ status: "expired" }, { transaction: t });
        rewardResult = { expired: true };
        return;
      }

      await reward.update({ status: "redeemed", redeemedAt: new Date() }, { transaction: t });

      rewardResult = {
        id: reward.id,
        rewardText: reward.rewardText,
        position: reward.position,
        round: reward.round,
        user: (reward as unknown as { user: { displayName: string; phone: string } }).user,
      };
    });

    if (!rewardResult || rewardResult.notFound) {
      res.status(404).json({ error: "Invalid code or already redeemed" });
      return;
    }
    if (rewardResult.expired) {
      res.status(400).json({ error: "Reward has expired" });
      return;
    }

    res.json({ message: "Reward redeemed!", reward: rewardResult });
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
