// Avatar asset definitions — IPL teams, style labels, skin presets
// Used by AvatarPreview to look up team-specific configs and render hints.

export const IPL_TEAM_CONFIGS: Record<
  string,
  { jerseyColor: string; accentColor: string; helmetColor: string }
> = {
  MI:   { jerseyColor: "#1e3a8a", accentColor: "#ffd700", helmetColor: "#1e3a8a" },
  CSK:  { jerseyColor: "#ca8a04", accentColor: "#ffffff", helmetColor: "#7c3aed" },
  RCB:  { jerseyColor: "#dc2626", accentColor: "#000000", helmetColor: "#111111" },
  KKR:  { jerseyColor: "#7e22ce", accentColor: "#ffd700", helmetColor: "#7e22ce" },
  GT:   { jerseyColor: "#1e293b", accentColor: "#eab308", helmetColor: "#1e293b" },
  LSG:  { jerseyColor: "#06b6d4", accentColor: "#dc2626", helmetColor: "#06b6d4" },
  SRH:  { jerseyColor: "#ea580c", accentColor: "#000000", helmetColor: "#ea580c" },
  DC:   { jerseyColor: "#1d4ed8", accentColor: "#dc2626", helmetColor: "#1d4ed8" },
  RR:   { jerseyColor: "#db2777", accentColor: "#f8fafc", helmetColor: "#db2777" },
  PBKS: { jerseyColor: "#ef4444", accentColor: "#f8fafc", helmetColor: "#6b7280" },
};

export const SKIN_TONE_PRESETS = [
  { id: "tone1", color: "#FDDCBD", label: "Fair"   },
  { id: "tone2", color: "#F5C5A3", label: "Light"  },
  { id: "tone3", color: "#E8A87C", label: "Medium" },
  { id: "tone4", color: "#C68642", label: "Tan"    },
  { id: "tone5", color: "#8D5524", label: "Brown"  },
  { id: "tone6", color: "#4A2912", label: "Dark"   },
];

// Maps helmetStyle index → headgear type
// 0 = Classic batting helmet (with grille)
// 1 = Cricket cap (with brim)
// 2 = Short spiky hair (no headgear)
// 3 = Long flowing hair (no headgear)
export const HEADGEAR_LABELS = [
  { id: 0, label: "Classic",  emoji: "🪖", isHelmet: true  },
  { id: 1, label: "Cap",      emoji: "🧢", isHelmet: true  },
  { id: 2, label: "Spiky",    emoji: "✨", isHelmet: false },
  { id: 3, label: "Long",     emoji: "💇", isHelmet: false },
];

// Maps expression index → face mood
export const EXPRESSION_LABELS = [
  { id: 0, label: "Happy",   emoji: "😊" },
  { id: 1, label: "Fierce",  emoji: "😤" },
  { id: 2, label: "Cheeky",  emoji: "😜" },
  { id: 3, label: "Excited", emoji: "🤩" },
  { id: 4, label: "Cool",    emoji: "😎" },
];

// Maps batStyle index → equipment variant
export const BAT_STYLE_LABELS = [
  { id: 0, label: "Willow",    emoji: "🏏" },
  { id: 1, label: "Power",     emoji: "⚡" },
  { id: 2, label: "Pro",       emoji: "🌟" },
];

// Body-type half-widths (used in AvatarPreview)
export const BODY_HALF_WIDTHS = [18, 22, 15] as const; // slim, broad, lean
