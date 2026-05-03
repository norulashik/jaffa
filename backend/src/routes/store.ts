import { Router, Response } from "express";
import { Op } from "sequelize";
import { User, UserPowerup, BananaLedger } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import {
  POWERUP_CATALOG,
  purchasePowerup,
  weeklyCapsRemaining,
  type PowerupKey,
} from "../services/powerups";
import { parsePagination, paginationMeta } from "../utils/pagination";

const router = Router();

// GET /api/store/catalog
// Returns all 5 powerups + per-user weekly cap remaining + Silverback owned-flag.
router.get("/catalog", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const user = await User.findByPk(userId);
    const caps = await weeklyCapsRemaining(userId);
    const silverbackOwned = await UserPowerup.findOne({
      where: {
        userId,
        powerupKey: "silverback_clutch",
        status: { [Op.in]: ["owned", "active"] },
      },
    });
    const items = (Object.keys(POWERUP_CATALOG) as PowerupKey[]).map((key) => {
      const e = POWERUP_CATALOG[key];
      return {
        key,
        name: e.name,
        shortName: e.shortName,
        description: e.description,
        price: e.price,
        weeklyCap: e.weeklyCap,
        weeklyRemaining: caps[key],
        oneLifetime: !!e.oneLifetime,
        ownedLifetime: e.oneLifetime ? !!silverbackOwned : false,
      };
    });
    res.json({
      bananas: user?.bananas || 0,
      items,
    });
  } catch (error) {
    console.error("[Store] catalog error:", error);
    res.status(500).json({ error: "Failed to load store" });
  }
});

// POST /api/store/purchase
// Body: { powerupKey }
router.post("/purchase", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { powerupKey } = req.body as { powerupKey?: PowerupKey };
    if (!powerupKey || !POWERUP_CATALOG[powerupKey]) {
      res.status(400).json({ error: "Unknown powerup" });
      return;
    }
    const row = await purchasePowerup(userId, powerupKey);
    const user = await User.findByPk(userId);
    res.status(201).json({
      powerup: row,
      bananas: user?.bananas || 0,
    });
  } catch (error: any) {
    console.error("[Store] purchase error:", error?.message);
    res.status(400).json({ error: error?.message || "Purchase failed" });
  }
});

// GET /api/store/inventory?matchId=...
// Returns user's owned + active powerups. If matchId provided, also flags
// which ones are bound to that match.
router.get("/inventory", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const matchId = (req.query.matchId as string) || null;
    const owned = await UserPowerup.findAll({
      where: { userId, status: { [Op.in]: ["owned", "active"] } },
      order: [["purchasedAt", "DESC"]],
    });
    res.json({
      powerups: owned.map((p) => ({
        id: p.id,
        powerupKey: p.powerupKey,
        status: p.status,
        matchId: p.matchId,
        chargesRemaining: p.chargesRemaining,
        metadata: p.metadata,
        activatedAt: p.activatedAt,
        purchasedAt: p.purchasedAt,
        // Convenience flag for the in-match tray.
        boundToMatch: matchId ? p.matchId === matchId : false,
      })),
    });
  } catch (error) {
    console.error("[Store] inventory error:", error);
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

// GET /api/store/ledger
// Paged banana history. Useful for a future "Banana History" page; the
// endpoint exists today even though no UI consumes it yet.
router.get("/ledger", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const p = parsePagination(req);
    const { count, rows } = await BananaLedger.findAndCountAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit: p.limit,
      offset: p.offset,
    });
    res.json({ ledger: rows, ...paginationMeta(p, count) });
  } catch (error) {
    console.error("[Store] ledger error:", error);
    res.status(500).json({ error: "Failed to load ledger" });
  }
});

export default router;
