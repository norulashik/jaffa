import { Router, Response, Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Reward, User } from "../models";
import sequelize from "../config/database";
import { authenticateUser, authenticateVenue, AuthRequest } from "../middleware/auth";

const router = Router();

// Per-venue limiter on the 4-digit code redemption endpoint.
// 4-digit space is 10,000 possibilities; even with a venue token, a rogue
// insider could brute-force in minutes. 20 attempts/min/venue makes brute-force
// take ~8 hours and is loud enough to notice in logs.
const redeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Key on the venue id (from the already-verified JWT). Fall back to IPv6-safe IP.
  keyGenerator: (req: Request, res: Response) => {
    const v = (req as AuthRequest).venueId;
    if (v) return `venue:${v}`;
    return `ip:${ipKeyGenerator(req.ip || "", res as unknown as never)}`;
  },
  message: { error: "Too many redemption attempts. Slow down." },
});

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

// Verify and redeem a reward (venue staff action).
// authenticateVenue runs FIRST so the limiter can key on the verified venueId.
router.post("/redeem", authenticateVenue, redeemLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.venueId!;
    const { code } = req.body;

    // Reject anything that isn't exactly 4 digits — prevents wildcard lookups
    // and strips surprise characters before we hit the DB.
    if (!code || typeof code !== "string" || !/^[0-9]{4}$/.test(code)) {
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
