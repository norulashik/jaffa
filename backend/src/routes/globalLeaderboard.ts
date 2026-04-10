import { Router, Response } from "express";
import { Op } from "sequelize";
import { User } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/global-leaderboard?scope=city|state|all
router.get("/", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const scope = (req.query.scope as string) || "all";

    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Build where clause based on scope
    let whereClause: any = {
      lifetimePoints: { [Op.gt]: 0 },
    };

    if (scope === "city" && currentUser.city) {
      whereClause.city = currentUser.city;
    } else if (scope === "state" && currentUser.state) {
      whereClause.state = currentUser.state;
    }
    // scope === "all" → no location filter

    // Get top 50 (secondary sort by createdAt for tie-breaking)
    const leaderboard = await User.findAll({
      where: whereClause,
      order: [["lifetimePoints", "DESC"], ["createdAt", "ASC"]],
      limit: 50,
      attributes: ["id", "displayName", "avatarConfig", "lifetimePoints", "city", "state"],
    });

    // Assign ranks with ties (same points = same rank)
    let currentRank = 1;
    const formatted = leaderboard.map((u, index) => {
      if (index > 0) {
        const prevPoints = leaderboard[index - 1].lifetimePoints || 0;
        const currPoints = u.lifetimePoints || 0;
        if (currPoints < prevPoints) {
          currentRank = index + 1;
        }
      }
      return {
        rank: currentRank,
        userId: u.id,
        displayName: u.displayName,
        avatarConfig: u.avatarConfig ? JSON.parse(u.avatarConfig) : null,
        lifetimePoints: u.lifetimePoints || 0,
        city: u.city,
        state: u.state,
      };
    });

    // Calculate current user's rank
    const myRank = await User.count({
      where: {
        ...whereClause,
        lifetimePoints: { [Op.gt]: currentUser.lifetimePoints || 0 },
      },
    }) + 1;

    res.json({
      leaderboard: formatted,
      myRank,
      scope,
      myCity: currentUser.city,
      myState: currentUser.state,
    });
  } catch (error) {
    console.error("Global leaderboard error:", error);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

export default router;
