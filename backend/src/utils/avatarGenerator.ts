// Deterministic avatar generator — userId → AvatarConfig v2.
// No randomness — same userId always produces the same avatar.
// Frontend's lib/avatarMigrate.ts mirrors this shape; legacy v1 configs are
// migrated lazily on first read post-deploy.

export interface AvatarConfig {
  version: 2;
  skinTone: string;
  expression: number;      // 0–4
  hairStyle: number;       // 0–3
  sunglasses: number;      // 0–2
  jerseyTeam: string;      // "CSK"|"MI"|"KKR"|"RCB"|"RR"|"DC"|"PBKS"|"SRH"|"LSG"|"GT"|"NONE"
  sneakerColor: number;    // 0–4
  goldChain: boolean;
  goldBracelet: boolean;
  goldEarring: boolean;
}

const SKIN_TONES = ["#FDDCBD", "#F5C5A3", "#E8A87C", "#C68642", "#8D5524", "#4A2912"];
const TEAM_POOL = ["CSK", "MI", "KKR", "RCB", "RR", "DC", "PBKS", "SRH", "LSG", "GT"];

function hashUUID(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function hashPick(userId: string, salt: string, modulo: number): number {
  return hashUUID(userId + ":" + salt) % modulo;
}

function hashBool(userId: string, salt: string): boolean {
  return hashUUID(userId + ":" + salt) % 2 === 0;
}

export function generateAvatarConfig(userId: string): AvatarConfig {
  return {
    version: 2,
    skinTone: SKIN_TONES[hashPick(userId, "skin", SKIN_TONES.length)],
    expression: hashPick(userId, "expr", 5),
    hairStyle: hashPick(userId, "hair", 4),
    sunglasses: hashPick(userId, "shades", 3),
    jerseyTeam: TEAM_POOL[hashPick(userId, "team", TEAM_POOL.length)],
    sneakerColor: hashPick(userId, "sneak", 5),
    goldChain: hashBool(userId, "chain"),
    goldBracelet: hashBool(userId, "brace"),
    goldEarring: hashBool(userId, "ear"),
  };
}
