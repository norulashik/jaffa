// Avatar v2 — chibi / streetwear redesign.
// Replaces the v1 cricket-doll schema (helmetStyle / jerseyPattern / bodyType
// / accessory / batStyle, etc.). Migration from v1 → v2 happens lazily in the
// loader at each render boundary; see frontend/src/lib/avatarMigrate.ts.

export interface AvatarConfig {
  version: 2;
  skinTone: string;        // hex — preserved from v1, same 6-option palette
  expression: number;      // 0–4 — preserved from v1, range unchanged
  hairStyle: number;       // 0–3: braids / buzz / curls / locs
  sunglasses: number;      // 0–2: round / visor / none
  jerseyTeam: string;      // "CSK" | "MI" | "KKR" | "RCB" | "RR" | "DC" | "PBKS" | "SRH" | "LSG" | "GT" | "NONE"
  sneakerColor: number;    // 0–4: red-white / all-black / all-white / blue-white / gold
  goldChain: boolean;
  goldBracelet: boolean;
  goldEarring: boolean;
}

export type AvatarSize = "sm" | "md" | "lg";
export type AvatarMood = "idle" | "celebrate" | "disappointed" | "excited";

export const TEAM_KEYS = [
  "CSK", "MI", "KKR", "RCB", "RR", "DC", "PBKS", "SRH", "LSG", "GT", "NONE",
] as const;
