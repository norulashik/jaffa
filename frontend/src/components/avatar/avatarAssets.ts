// Avatar v2 asset definitions — palettes, labels, per-team jersey accents.
// Used by AvatarPreview to look up parametric values and render hints.

import { TEAM_COLORS } from "@/lib/teamColors";

export const SKIN_TONE_PRESETS = [
  { id: "tone1", color: "#FDDCBD", label: "Fair"   },
  { id: "tone2", color: "#F5C5A3", label: "Light"  },
  { id: "tone3", color: "#E8A87C", label: "Medium" },
  { id: "tone4", color: "#C68642", label: "Tan"    },
  { id: "tone5", color: "#8D5524", label: "Brown"  },
  { id: "tone6", color: "#4A2912", label: "Dark"   },
];

export const EXPRESSION_LABELS = [
  { id: 0, label: "Happy",   emoji: "😊" },
  { id: 1, label: "Fierce",  emoji: "😤" },
  { id: 2, label: "Cheeky",  emoji: "😜" },
  { id: 3, label: "Excited", emoji: "🤩" },
  { id: 4, label: "Cool",    emoji: "😎" },
];

export const HAIR_LABELS = [
  { id: 0, label: "Braids", emoji: "🪢" },
  { id: 1, label: "Buzz",   emoji: "✂️" },
  { id: 2, label: "Curls",  emoji: "🌀" },
  { id: 3, label: "Locs",   emoji: "🧢" },
];

export const SUNGLASSES_LABELS = [
  { id: 0, label: "Round", emoji: "🕶️" },
  { id: 1, label: "Visor", emoji: "🥽" },
  { id: 2, label: "None",  emoji: "✕"  },
];

// Sneaker palettes — each has body, accent (the 3 stripes), sole, lace.
export interface SneakerPalette {
  body: string;
  accent: string;
  sole: string;
  lace: string;
  label: string;
}
export const SNEAKER_PALETTES: SneakerPalette[] = [
  { label: "Red/White",  body: "#ffffff", accent: "#dc2626", sole: "#ffffff", lace: "#ffffff" },
  { label: "All Black",  body: "#1a1a1a", accent: "#3a3a3a", sole: "#0a0a0a", lace: "#1a1a1a" },
  { label: "All White",  body: "#ffffff", accent: "#e5e7eb", sole: "#ffffff", lace: "#ffffff" },
  { label: "Blue/White", body: "#ffffff", accent: "#1d4ed8", sole: "#ffffff", lace: "#ffffff" },
  { label: "Gold",       body: "#facc15", accent: "#854d0e", sole: "#ffffff", lace: "#ffffff" },
];

// Per-team jersey accent definitions. Each maps to one or two SVG path
// fragments overlaid on the tee body. Coordinates assume the tee occupies
// roughly y=78..120 and is centred on x=50, half-width ≈ 26 (tee body
// extends past the shoulder line on a chibi).
//
// `collar`     — path for a contrasting collar / neckline trim.
// `sidePanel`  — path for a side stripe / panel.
// `sleeveTrim` — path for cuff trim on each sleeve (drawn twice, mirrored).
// `accentColor`— the colour used to fill all three. Falls back to TEAM_COLORS dark.
export interface JerseyAccent {
  accentColor: string;
  collar?: string;
  sidePanelL?: string;
  sidePanelR?: string;
  sleeveTrimL?: string;
  sleeveTrimR?: string;
}

// Helper — pick a contrasting accent. For light primaries, use the dark
// shade; for dark primaries use a brighter accent.
function pickAccent(team: string, override?: string): string {
  if (override) return override;
  const t = TEAM_COLORS[team];
  return t ? t.dark : "#000000";
}

export const JERSEY_ACCENTS: Record<string, JerseyAccent> = {
  CSK: {
    // Yellow primary — accents are deep blue (the franchise's secondary).
    accentColor: "#1d4ed8",
    collar: "M30 80 Q50 76 70 80 L67 84 Q50 81 33 84 Z",
    sidePanelL: "M22 86 L26 86 L26 118 L22 116 Z",
    sidePanelR: "M74 86 L78 86 L78 116 L74 118 Z",
  },
  MI: {
    // Navy primary — gold collar + sleeve trim, the iconic MI look.
    accentColor: "#facc15",
    collar: "M30 80 Q50 76 70 80 L67 84 Q50 81 33 84 Z",
    sleeveTrimL: "M14 92 L26 92 L26 96 L14 96 Z",
    sleeveTrimR: "M74 92 L86 92 L86 96 L74 96 Z",
  },
  KKR: {
    // Purple primary — gold collar.
    accentColor: "#facc15",
    collar: "M28 80 Q50 75 72 80 L68 85 Q50 81 32 85 Z",
    sleeveTrimL: "M14 92 L26 92 L26 96 L14 96 Z",
    sleeveTrimR: "M74 92 L86 92 L86 96 L74 96 Z",
  },
  RCB: {
    // Red primary — black sleeve cuffs + black side stripe.
    accentColor: "#0a0a0a",
    sleeveTrimL: "M14 90 L26 90 L26 96 L14 96 Z",
    sleeveTrimR: "M74 90 L86 90 L86 96 L74 96 Z",
    sidePanelL: "M22 86 L25 86 L25 118 L22 116 Z",
    sidePanelR: "M75 86 L78 86 L78 116 L75 118 Z",
  },
  RR: {
    // Pink primary — royal-blue sleeve trim.
    accentColor: "#1e3a8a",
    sleeveTrimL: "M14 92 L26 92 L26 96 L14 96 Z",
    sleeveTrimR: "M74 92 L86 92 L86 96 L74 96 Z",
  },
  DC: {
    // Blue primary — red sleeve cuffs.
    accentColor: "#dc2626",
    sleeveTrimL: "M14 90 L26 90 L26 95 L14 95 Z",
    sleeveTrimR: "M74 90 L86 90 L86 95 L74 95 Z",
  },
  PBKS: {
    // Red primary — silver shoulder yoke.
    accentColor: "#cbd5e1",
    collar: "M22 80 Q50 73 78 80 L75 88 Q50 82 25 88 Z",
  },
  SRH: {
    // Orange primary — black side panels.
    accentColor: "#0a0a0a",
    sidePanelL: "M22 84 L26 84 L26 120 L22 118 Z",
    sidePanelR: "M74 84 L78 84 L78 118 L74 120 Z",
  },
  LSG: {
    // Light blue — orange side stripe + collar.
    accentColor: "#ea580c",
    collar: "M30 80 Q50 76 70 80 L67 84 Q50 81 33 84 Z",
    sidePanelL: "M22 86 L25 86 L25 118 L22 116 Z",
    sidePanelR: "M75 86 L78 86 L78 116 L75 118 Z",
  },
  GT: {
    // Dark navy — gold collar.
    accentColor: "#facc15",
    collar: "M28 80 Q50 75 72 80 L68 85 Q50 81 32 85 Z",
  },
  NONE: {
    // Plain white tee — no accents.
    accentColor: "#9ca3af",
  },
};

// Resolve effective fill colours per team. NONE uses neutral white; everyone
// else uses TEAM_COLORS.primary.
export function getTeeFill(team: string): string {
  if (team === "NONE") return "#f5f5f5";
  return TEAM_COLORS[team]?.primary || "#f5f5f5";
}

export function getTeeText(team: string): { color: string; label: string } | null {
  if (team === "NONE") return null;
  const t = TEAM_COLORS[team];
  return t ? { color: t.text, label: team } : null;
}

export function getAccent(team: string): JerseyAccent {
  return JERSEY_ACCENTS[team] || JERSEY_ACCENTS.NONE;
}

// Re-export for the customizer / preview to avoid duplicate hex constants.
export { pickAccent };
