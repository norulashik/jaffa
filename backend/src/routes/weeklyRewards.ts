import { Router, Response } from "express";
import { User, WeeklyRedemption } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { WEEKLY_REWARDS } from "../config/weeklyRewards";
import { getYearWeekNumber } from "../utils/weekHelper";
import sequelize from "../config/database";

const router = Router();

// Get user's weekly points
router.get("/points", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentWeek = getYearWeekNumber();
    let weeklyPoints = user.weeklyPoints;

    if (user.weekNumber !== currentWeek) {
      weeklyPoints = 0;
      await user.update({ weeklyPoints: 0, weekNumber: currentWeek });
    }

    res.json({ weeklyPoints, weekNumber: currentWeek });
  } catch (error) {
    console.error("Get weekly points error:", error);
    res.status(500).json({ error: "Failed to get weekly points" });
  }
});

// Get rewards catalog + user state
router.get("/catalog", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentWeek = getYearWeekNumber();
    let weeklyPoints = user.weeklyPoints;

    if (user.weekNumber !== currentWeek) {
      weeklyPoints = 0;
      await user.update({ weeklyPoints: 0, weekNumber: currentWeek });
    }

    const redemptions = await WeeklyRedemption.findAll({
      where: { userId: req.userId!, weekNumber: currentWeek },
      order: [["redeemedAt", "DESC"]],
    });

    const redeemedKeys = redemptions.map((r) => r.rewardKey);

    const catalog = WEEKLY_REWARDS.map((reward) => ({
      ...reward,
      canRedeem: weeklyPoints >= reward.pointsCost && !redeemedKeys.includes(reward.key),
      alreadyRedeemed: redeemedKeys.includes(reward.key),
    }));

    res.json({ weeklyPoints, catalog, redemptions });
  } catch (error) {
    console.error("Get catalog error:", error);
    res.status(500).json({ error: "Failed to get rewards catalog" });
  }
});

// Redeem a reward
router.post("/redeem", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rewardKey } = req.body;
    const reward = WEEKLY_REWARDS.find((r) => r.key === rewardKey);

    if (!reward) {
      res.status(400).json({ error: "Invalid reward" });
      return;
    }

    const currentWeek = getYearWeekNumber();

    await sequelize.transaction(async (t) => {
      const user = await User.findByPk(req.userId!, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error("USER_NOT_FOUND");

      let weeklyPoints = user.weeklyPoints;
      if (user.weekNumber !== currentWeek) {
        weeklyPoints = 0;
      }

      if (weeklyPoints < reward.pointsCost) {
        throw new Error("INSUFFICIENT_POINTS");
      }

      const existing = await WeeklyRedemption.findOne({
        where: { userId: req.userId!, rewardKey, weekNumber: currentWeek },
        transaction: t,
      });
      if (existing) throw new Error("ALREADY_REDEEMED");

      await user.update(
        { weeklyPoints: weeklyPoints - reward.pointsCost, weekNumber: currentWeek },
        { transaction: t }
      );

      await WeeklyRedemption.create(
        {
          userId: req.userId!,
          rewardKey: reward.key,
          rewardName: reward.name,
          pointsSpent: reward.pointsCost,
          weekNumber: currentWeek,
          redeemedAt: new Date(),
        },
        { transaction: t }
      );
    });

    const updatedUser = await User.findByPk(req.userId!);
    res.json({ success: true, weeklyPoints: updatedUser!.weeklyPoints });
  } catch (error: any) {
    if (error.message === "INSUFFICIENT_POINTS") {
      res.status(400).json({ error: "Not enough points" });
      return;
    }
    if (error.message === "ALREADY_REDEEMED") {
      res.status(409).json({ error: "Already redeemed this reward this week" });
      return;
    }
    console.error("Redeem error:", error);
    res.status(500).json({ error: "Failed to redeem reward" });
  }
});

export default router;
