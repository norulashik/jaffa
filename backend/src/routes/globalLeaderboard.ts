import { Router, Response } from "express";
import { Op } from "sequelize";
import { User } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { parsePagination, paginationMeta } from "../utils/pagination";

const router = Router();

// GET /api/global-leaderboard?scope=city|state|all&page=1&pageSize=25
router.get("/", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const scope = (req.query.scope as string) || "all";
    const p = parsePagination(req);

    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Build where clause based on scope
    let whereClause: any = {
      lifetimePoints: { [Op.gt]: 0 },
    };

    if (scope === "city") {
      if (!currentUser.city) {
        res.json({
          leaderboard: [], myRank: 0, scope,
          myCity: null, myState: currentUser.state, locationMissing: true,
          ...paginationMeta(p, 0),
        });
        return;
      }
      whereClause.city = currentUser.city;
    } else if (scope === "state") {
      if (!currentUser.state) {
        res.json({
          leaderboard: [], myRank: 0, scope,
          myCity: currentUser.city, myState: null, locationMissing: true,
          ...paginationMeta(p, 0),
        });
        return;
      }
      whereClause.state = currentUser.state;
    }
    // scope === "all" → no location filter

    // Pull total count + page slice in one call.
    const { count, rows: leaderboard } = await User.findAndCountAll({
      where: whereClause,
      order: [["lifetimePoints", "DESC"], ["createdAt", "ASC"]],
      limit: p.limit,
      offset: p.offset,
      attributes: ["id", "displayName", "avatarConfig", "lifetimePoints", "city", "state"],
    });

    // Tie-aware ranks within the page. On pages > 1 we seed from offset+1, so
    // ranks are approximate across page boundaries — a tie split by a page
    // boundary won't be detected. Fine for the 99% case where users view p1.
    let currentRank = p.offset + 1;
    const formatted = leaderboard.map((u, index) => {
      if (index > 0) {
        const prevPoints = leaderboard[index - 1].lifetimePoints || 0;
        const currPoints = u.lifetimePoints || 0;
        if (currPoints < prevPoints) {
          currentRank = p.offset + index + 1;
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

    // Calculate current user's rank (global, not page-relative).
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
      ...paginationMeta(p, count),
    });
  } catch (error) {
    console.error("Global leaderboard error:", error);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

export default router;
