import { Router, Response } from "express";
import { Match, UserPowerup } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import {
  activatePowerup,
  consumeChimpTankCharge,
} from "../services/powerups";

const router = Router();

// POST /api/powerups/:powerupId/activate
// Body: { matchId, targetOverNumber? }
router.post("/:powerupId/activate", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const powerupId = req.params.powerupId as string;
    const { matchId, targetOverNumber } = req.body as { matchId?: string; targetOverNumber?: number };
    if (!matchId) {
      res.status(400).json({ error: "matchId is required" });
      return;
    }

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    if (match.status === "completed") {
      res.status(400).json({ error: "Match is over" });
      return;
    }

    // For Berserk, infer targetOverNumber from match's currentOver+1 if
    // the client didn't pass one. Caps at totalOvers so an activation in
    // over 19 of a 20-over chase still binds to a real over.
    let targetOver = targetOverNumber;
    if (!targetOver) {
      targetOver = Math.min((match.currentOver || 0) + 1, match.totalOvers || 20);
    }

    const row = await activatePowerup(userId, powerupId, { matchId, targetOverNumber: targetOver });
    res.json({ powerup: row });
  } catch (error: any) {
    console.error("[Powerups] activate error:", error?.message);
    res.status(400).json({ error: error?.message || "Activation failed" });
  }
});

// POST /api/powerups/chimp-tank/use
// Body: { predictionId }
// Consumes 1 Chimp-Tank charge and returns live %-pick distribution.
router.post("/chimp-tank/use", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { predictionId } = req.body as { predictionId?: string };
    if (!predictionId) {
      res.status(400).json({ error: "predictionId is required" });
      return;
    }
    const result = await consumeChimpTankCharge(userId, predictionId);
    res.json(result);
  } catch (error: any) {
    console.error("[Powerups] chimp-tank error:", error?.message);
    res.status(400).json({ error: error?.message || "Chimp-Tank failed" });
  }
});

// GET /api/powerups/active?matchId=...
// Convenience read for the in-match tray — only the powerups currently
// affecting THIS match (Silverback included since it's passive everywhere).
router.get("/active", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const matchId = req.query.matchId as string;
    if (!matchId) {
      res.status(400).json({ error: "matchId query param is required" });
      return;
    }
    const { getActivePowerups } = await import("../services/powerups");
    const rows = await getActivePowerups(userId, matchId);
    res.json({
      powerups: rows.map((p) => ({
        id: p.id,
        powerupKey: p.powerupKey,
        status: p.status,
        matchId: p.matchId,
        chargesRemaining: p.chargesRemaining,
        metadata: p.metadata,
        activatedAt: p.activatedAt,
      })),
    });
  } catch (error: any) {
    console.error("[Powerups] active error:", error?.message);
    res.status(500).json({ error: "Failed to load active powerups" });
  }
});

void UserPowerup;
export default router;
