// Lazy v1 → v2 avatar migration. Runs at every render boundary that reads an
// avatarConfig from localStorage / the API. Preserves `skinTone` and
// `expression` (both still valid in v2) and regenerates the new fields
// deterministically from the user's id, so the same user always gets the
// same v2 default look on first migration.

import { AvatarConfig, TEAM_KEYS } from "@/types/avatar";

const SKIN_TONES = ["#FDDCBD", "#F5C5A3", "#E8A87C", "#C68642", "#8D5524", "#4A2912"];

// Same djb2-ish hash the backend uses (avatarGenerator.ts). Salt with the
// field name so each axis pulls from a different segment of the hash space —
// otherwise hairStyle, sunglasses, etc. would all correlate.
function hashUUID(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function hashPick(userId: string, salt: string, modulo: number): number {
  return hashUUID(userId + ":" + salt) % modulo;
}

export function hashBool(userId: string, salt: string): boolean {
  return hashUUID(userId + ":" + salt) % 2 === 0;
}

export function pickSkinTone(userId: string): string {
  return SKIN_TONES[hashPick(userId, "skin", SKIN_TONES.length)];
}

export function isV2(raw: unknown): raw is AvatarConfig {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Record<string, unknown>;
  return c.version === 2 && typeof c.jerseyTeam === "string";
}

// Returns a fully-valid v2 config. If the input is already v2, returns it
// unchanged (same object reference, so callers can `===`-compare to detect
// "did we migrate?"). Otherwise builds a v2 config preserving skinTone +
// expression where present and regenerating everything else from the userId.
export function ensureV2(raw: unknown, userId: string): AvatarConfig {
  if (isV2(raw)) return raw;

  const c = (raw && typeof raw === "object")
    ? (raw as Record<string, unknown>)
    : {};

  // Bound expression to [0,4] in case a v1 row stored something weird.
  const rawExpr = typeof c.expression === "number" ? c.expression : NaN;
  const expression = Number.isFinite(rawExpr) && rawExpr >= 0 && rawExpr <= 4
    ? Math.floor(rawExpr)
    : hashPick(userId, "expr", 5);

  const skinTone = typeof c.skinTone === "string" && c.skinTone.startsWith("#")
    ? c.skinTone
    : pickSkinTone(userId);

  // Exclude "NONE" from the random-default pool — first-time users land on a
  // team jersey, not the blank tee. They can switch to NONE in the customizer.
  const teamPool = TEAM_KEYS.filter((t) => t !== "NONE");

  return {
    version: 2,
    skinTone,
    expression,
    hairStyle: hashPick(userId, "hair", 4),
    sunglasses: hashPick(userId, "shades", 3),
    jerseyTeam: teamPool[hashPick(userId, "team", teamPool.length)],
    sneakerColor: hashPick(userId, "sneak", 5),
    goldChain: hashBool(userId, "chain"),
    goldBracelet: hashBool(userId, "brace"),
    goldEarring: hashBool(userId, "ear"),
  };
}
