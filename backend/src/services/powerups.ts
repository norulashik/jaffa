// Bananergy powerups — catalog, purchase, activate, scoring helpers.
//
// Banana economy chokepoint: every mutation to User.bananas funnels through
// `awardBananas()` here so a `BananaLedger` row gets written for every
// delta. The unique index on (userId, reason, refId) makes it safe to
// re-run scoring (idempotent — a duplicate write is rejected by the DB).
//
// Powerup lifecycle: `purchasePowerup` → status="owned" → `activatePowerup`
// → status="active" + matchId set → consumed (for charge-based ones) once
// charges hit 0 OR (for whole-match ones) when the match ends.
//
// Scoring integrations:
//   - `applyStreakProtection` is called by pointsEngine on a wrong answer.
//   - `pointsMultiplierForPrediction` is applied on top of boost/all-in
//     in calculatePoints.
//   - `consumeChimpTankCharge` is the only charge-decrementer the route
//     layer calls (the others self-decrement during scoring).

import { Op, Transaction } from "sequelize";
import { User, BananaLedger, UserPowerup, UserPrediction, Prediction } from "../models";
import sequelize from "../config/database";
import { getYearWeekNumber } from "../utils/weekHelper";
import type { PowerupKey, PowerupStatus } from "../models/UserPowerup";
import type { BananaReason } from "../models/BananaLedger";

// ── Catalog ─────────────────────────────────────────────────────────

export interface PowerupCatalogEntry {
  key: PowerupKey;
  name: string;       // user-facing label (with emoji)
  shortName: string;  // for tray/inline use
  description: string;
  price: number;      // bananas
  weeklyCap: number | null;     // null = unlimited; for Silverback there's a one-lifetime cap below
  oneLifetime?: boolean;        // Silverback: once owned, no repurchase
  charges: number | null;       // initial chargesRemaining on activate
  scope: "match" | "next_over" | "permanent" | "day"; // controls cleanup semantics
}

export const POWERUP_CATALOG: Record<PowerupKey, PowerupCatalogEntry> = {
  gorilla_guard: {
    key: "gorilla_guard",
    name: "🛡️ Gorilla Guard",
    shortName: "Gorilla Guard",
    description: "Absorbs your next 2 wrong answers without breaking the streak.",
    price: 25,
    weeklyCap: 20,
    charges: 2,
    scope: "match",
  },
  chimp_tank: {
    key: "chimp_tank",
    name: "🔭 Chimp-Tank",
    shortName: "Chimp-Tank",
    description: "Reveals live %-pick distribution on a question. 3 reveals per buy, valid for the day.",
    price: 15,
    weeklyCap: 5,
    charges: 3,
    scope: "day",
  },
  banana_berserk: {
    key: "banana_berserk",
    name: "🐒 Banana Berserk",
    shortName: "Banana Berserk",
    description: "Activate before an over → that over's per-over questions earn a random 1x-5x multiplier.",
    price: 30,
    weeklyCap: null,        // capped per-match instead (1 active at a time)
    charges: 1,
    scope: "next_over",
  },
  silverback_clutch: {
    key: "silverback_clutch",
    name: "🦍 Clutch of the Silverback",
    shortName: "Silverback",
    description: "Permanent: last 2 overs of every match award 2x points. One-time purchase.",
    price: 200,
    weeklyCap: null,
    oneLifetime: true,
    charges: null,
    scope: "permanent",
  },
  monke_mayhem: {
    key: "monke_mayhem",
    name: "🎲 Monke Mayhem",
    shortName: "Monke Mayhem",
    description: "On player questions, pick 2 outcomes; correct if either lands. Lasts the whole match.",
    price: 40,
    weeklyCap: 2,
    charges: null,
    scope: "match",
  },
};

// ── Banana mutation chokepoint ──────────────────────────────────────

// One mutation = one ledger row + one User.bananas update.
// Returns the new bananas balance, OR null if the ledger insert was a no-op
// because the (userId, reason, refId) uniqueness rejected a duplicate write
// (re-run safe).
export async function awardBananas(
  userId: string,
  delta: number,
  reason: BananaReason,
  refId: string | null,
  refType: string | null,
  t?: Transaction,
): Promise<number | null> {
  if (delta === 0) return null;

  const inner = async (tx: Transaction): Promise<number | null> => {
    // Try-insert the ledger row first; the unique-index dedup catches retries.
    try {
      await BananaLedger.create(
        { userId, delta, reason, refType, refId },
        { transaction: tx },
      );
    } catch (err: any) {
      // SequelizeUniqueConstraintError → already credited, skip silently.
      if (err?.name === "SequelizeUniqueConstraintError") return null;
      throw err;
    }
    const user = await User.findByPk(userId, { transaction: tx, lock: tx.LOCK.UPDATE });
    if (!user) throw new Error(`awardBananas: user ${userId} not found`);
    const next = Math.max(0, (user.bananas || 0) + delta);
    await user.update({ bananas: next }, { transaction: tx });
    return next;
  };

  // Use the caller's transaction if provided so the ledger write joins their
  // atomic group; otherwise spin up a local one.
  if (t) return inner(t);
  return sequelize.transaction(inner);
}

// ── Purchase ────────────────────────────────────────────────────────

export async function purchasePowerup(
  userId: string,
  powerupKey: PowerupKey,
): Promise<UserPowerup> {
  const entry = POWERUP_CATALOG[powerupKey];
  if (!entry) throw new Error(`Unknown powerup: ${powerupKey}`);

  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) throw new Error("User not found");
    if ((user.bananas || 0) < entry.price) {
      throw new Error(`Not enough bananas (need ${entry.price}, have ${user.bananas || 0})`);
    }

    // Lifetime gate (Silverback). Block any duplicate purchase.
    if (entry.oneLifetime) {
      const owned = await UserPowerup.findOne({
        where: { userId, powerupKey, status: { [Op.in]: ["owned", "active"] } },
        transaction: t,
      });
      if (owned) throw new Error("Already owned");
    }

    // Weekly cap gate.
    const currentWeek = getYearWeekNumber();
    if (entry.weeklyCap !== null) {
      const weekCount = await UserPowerup.count({
        where: { userId, powerupKey, purchaseWeekNumber: currentWeek },
        transaction: t,
      });
      if (weekCount >= entry.weeklyCap) {
        throw new Error(`Weekly cap reached (${weekCount}/${entry.weeklyCap})`);
      }
    }

    // Debit (negative ledger).
    await user.update({ bananas: (user.bananas || 0) - entry.price }, { transaction: t });
    // Ledger row uses the soon-to-be-created powerup id as refId — but we
    // need the row first. Two-step: create the row, then write the ledger
    // pointing at it. Both inside the txn so a failure rolls everything back.
    const row = await UserPowerup.create(
      {
        userId,
        powerupKey,
        status: "owned",
        matchId: null,
        chargesRemaining: null,
        metadata: null,
        purchasedAt: new Date(),
        activatedAt: null,
        consumedAt: null,
        purchaseWeekNumber: currentWeek,
      },
      { transaction: t },
    );
    await BananaLedger.create(
      {
        userId,
        delta: -entry.price,
        reason: "powerup_purchase",
        refType: "powerup",
        refId: row.id,
      },
      { transaction: t },
    );
    return row;
  });
}

// ── Activate ────────────────────────────────────────────────────────

export interface ActivateOptions {
  matchId: string;
  // For Banana Berserk: the over number to bind the multiplier to.
  // Server computes it from match.currentOver+1; client sends it for
  // double-check / display.
  targetOverNumber?: number;
}

export async function activatePowerup(
  userId: string,
  powerupId: string,
  opts: ActivateOptions,
): Promise<UserPowerup> {
  return sequelize.transaction(async (t) => {
    const row = await UserPowerup.findByPk(powerupId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row || row.userId !== userId) throw new Error("Powerup not found");
    if (row.status !== "owned") throw new Error(`Powerup is ${row.status}, not owned`);

    const entry = POWERUP_CATALOG[row.powerupKey];
    if (!entry) throw new Error("Unknown powerup");
    if (entry.scope === "permanent") {
      // Silverback should never need explicit activation — it's "owned" forever.
      // If someone calls activate on it, just no-op gracefully.
      return row;
    }

    const update: Partial<UserPowerup> = {
      status: "active",
      matchId: opts.matchId,
      activatedAt: new Date(),
    };
    update.chargesRemaining = entry.charges;

    if (row.powerupKey === "banana_berserk") {
      // Roll 1-5x. Server is authoritative — client can't fake the dice.
      const mult = 1 + Math.floor(Math.random() * 5);
      update.metadata = {
        berserkMultiplier: mult,
        overNumber: opts.targetOverNumber ?? null,
      };
    }

    await row.update(update as any, { transaction: t });
    return row;
  });
}

// ── Inventory query ─────────────────────────────────────────────────

export async function getOwnedPowerups(userId: string): Promise<UserPowerup[]> {
  return UserPowerup.findAll({
    where: { userId, status: { [Op.in]: ["owned", "active"] } },
    order: [["purchasedAt", "DESC"]],
  });
}

// All powerups currently affecting THIS match for THIS user. Includes
// Silverback if owned (passive, not bound to matchId). Used by the scoring
// hooks + the in-match tray.
export async function getActivePowerups(userId: string, matchId: string): Promise<UserPowerup[]> {
  const matchScoped = await UserPowerup.findAll({
    where: { userId, matchId, status: "active" },
  });
  const silverback = await UserPowerup.findOne({
    where: { userId, powerupKey: "silverback_clutch", status: { [Op.in]: ["owned", "active"] } },
  });
  return silverback ? [...matchScoped, silverback] : matchScoped;
}

export async function weeklyCapsRemaining(userId: string): Promise<Record<PowerupKey, number | null>> {
  const currentWeek = getYearWeekNumber();
  const out: Record<string, number | null> = {};
  for (const key of Object.keys(POWERUP_CATALOG) as PowerupKey[]) {
    const entry = POWERUP_CATALOG[key];
    if (entry.weeklyCap == null) {
      out[key] = null;
      continue;
    }
    const used = await UserPowerup.count({
      where: { userId, powerupKey: key, purchaseWeekNumber: currentWeek },
    });
    out[key] = Math.max(0, entry.weeklyCap - used);
  }
  return out as Record<PowerupKey, number | null>;
}

// ── Streak protection (Gorilla Guard) ───────────────────────────────

// Returns true if a Guard charge absorbed the wrong-answer hit. Caller
// should SKIP the streak reset in that case. Decrements chargesRemaining;
// flips to "consumed" on the last absorb.
export async function applyStreakProtection(
  userId: string,
  matchId: string,
  refId: string,        // the predictionId or userPredictionId — for ledger refs / dedup
  t?: Transaction,
): Promise<boolean> {
  const inner = async (tx: Transaction): Promise<boolean> => {
    const guard = await UserPowerup.findOne({
      where: {
        userId,
        matchId,
        powerupKey: "gorilla_guard",
        status: "active",
        chargesRemaining: { [Op.gt]: 0 },
      },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
      order: [["activatedAt", "ASC"]],
    });
    if (!guard) return false;
    const next = (guard.chargesRemaining || 0) - 1;
    await guard.update(
      next <= 0
        ? { chargesRemaining: 0, status: "consumed", consumedAt: new Date() }
        : { chargesRemaining: next },
      { transaction: tx },
    );
    void refId; // refId reserved for future audit ledger entry on absorbs
    return true;
  };
  if (t) return inner(t);
  return sequelize.transaction(inner);
}

// ── Per-prediction scoring multiplier (Berserk + Silverback) ────────

export interface PowerupMultiplierResult {
  multiplier: number;
  applied: { key: PowerupKey; mult: number }[];
}

// Returns the product of all stacking multipliers for this prediction.
// Stacks ON TOP of the existing boost / all-in multiplier in calculatePoints.
export async function pointsMultiplierForPrediction(
  userId: string,
  prediction: Prediction,
  totalOvers: number,
): Promise<PowerupMultiplierResult> {
  const applied: { key: PowerupKey; mult: number }[] = [];
  let mult = 1;

  // Silverback: passive, last 2 overs. Cheap "do I own one?" lookup.
  if (prediction.overNumber && totalOvers && prediction.overNumber >= totalOvers - 1) {
    const silverback = await UserPowerup.findOne({
      where: { userId, powerupKey: "silverback_clutch", status: { [Op.in]: ["owned", "active"] } },
    });
    if (silverback) { mult *= 2; applied.push({ key: "silverback_clutch", mult: 2 }); }
  }

  // Berserk: bound to a specific over via metadata.overNumber.
  if (prediction.overNumber) {
    const berserk = await UserPowerup.findOne({
      where: {
        userId,
        matchId: prediction.matchId,
        powerupKey: "banana_berserk",
        status: "active",
      },
    });
    const m = berserk?.metadata as { berserkMultiplier?: number; overNumber?: number } | null;
    if (berserk && m?.overNumber === prediction.overNumber && m?.berserkMultiplier) {
      mult *= m.berserkMultiplier;
      applied.push({ key: "banana_berserk", mult: m.berserkMultiplier });
      // Mark Berserk consumed once the bound over has been scored.
      await berserk.update({ status: "consumed", consumedAt: new Date() });
    }
  }

  return { multiplier: mult, applied };
}

// ── Mayhem multi-pick guard ─────────────────────────────────────────

// True if the user has an active Mayhem on this match, AND the prediction
// is player-related (subjectType non-null) — meaning they can submit a
// 2-key comma-joined selectedOption. Used by the submit endpoint to reject
// or allow multi-key payloads.
export async function userCanMayhemPick(
  userId: string,
  prediction: Prediction,
): Promise<boolean> {
  if (!prediction.subjectType) return false;
  const mayhem = await UserPowerup.findOne({
    where: {
      userId,
      matchId: prediction.matchId,
      powerupKey: "monke_mayhem",
      status: "active",
    },
  });
  return !!mayhem;
}

// ── Chimp-Tank reveal ───────────────────────────────────────────────

export interface ChimpTankResult {
  responses: Record<string, number>;
  totalResponses: number;
  chargesRemaining: number;
}

// Decrements one Tank charge and returns live aggregates. Throws if the
// user has no Tank with charges, or if they're trying to use a Tank
// purchased on a different day (charges expire daily).
export async function consumeChimpTankCharge(
  userId: string,
  predictionId: string,
): Promise<ChimpTankResult> {
  const todayStr = new Date().toISOString().slice(0, 10);
  return sequelize.transaction(async (t) => {
    // Find an active Tank (or a still-owned one whose day is today).
    // Charges valid the day the Tank was purchased.
    const tanks = await UserPowerup.findAll({
      where: {
        userId,
        powerupKey: "chimp_tank",
        status: { [Op.in]: ["owned", "active"] },
        chargesRemaining: { [Op.gt]: 0 },
      },
      order: [["purchasedAt", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const usable = tanks.find((p) => {
      const purchasedDay = p.purchasedAt.toISOString().slice(0, 10);
      return purchasedDay === todayStr;
    });
    if (!usable) throw new Error("No usable Chimp-Tank charges (expired or none owned)");

    // Initialise charges on first use.
    let charges = usable.chargesRemaining;
    if (charges == null) charges = POWERUP_CATALOG.chimp_tank.charges || 3;
    const next = charges - 1;
    await usable.update(
      next <= 0
        ? { chargesRemaining: 0, status: "consumed", consumedAt: new Date() }
        : { chargesRemaining: next, status: "active" },
      { transaction: t },
    );

    // Tally live picks for the prediction.
    const rows = await UserPrediction.findAll({
      where: { predictionId },
      attributes: ["selectedOption"],
      transaction: t,
    });
    const responses: Record<string, number> = {};
    for (const r of rows) {
      // Mayhem multi-pick stores comma-joined; expand each key for the bar
      // chart so percentages reflect every claimed option.
      for (const k of (r.selectedOption || "").split(",").map((s) => s.trim()).filter(Boolean)) {
        responses[k] = (responses[k] || 0) + 1;
      }
    }
    const totalResponses = rows.length;
    return { responses, totalResponses, chargesRemaining: next };
  });
}

// ── Refund on void / cancellation ───────────────────────────────────

// Restores activated-but-unused powerups to "owned" state if the match
// they were bound to gets voided or cancelled. Safe to call multiple times
// (no-ops on already-consumed powerups).
export async function refundPowerupsForMatch(matchId: string): Promise<number> {
  const rows = await UserPowerup.findAll({
    where: { matchId, status: "active" },
  });
  let n = 0;
  for (const r of rows) {
    await r.update({
      status: "owned",
      matchId: null,
      activatedAt: null,
      chargesRemaining: null,
      metadata: null,
    } as any);
    n += 1;
  }
  return n;
}

// Force-consume any active match-bound powerups when the match ends with
// resolution. Permanent powerups (Silverback) are untouched. Should be
// called once per match-end finalize after scoring is done.
export async function expireActivePowerupsForMatch(matchId: string): Promise<number> {
  const rows = await UserPowerup.findAll({
    where: {
      matchId,
      status: "active",
      powerupKey: { [Op.ne]: "silverback_clutch" },
    },
  });
  for (const r of rows) {
    await r.update({ status: "consumed", consumedAt: new Date() });
  }
  return rows.length;
}

// Status helpers exported for routes.
export type { PowerupKey, PowerupStatus };
