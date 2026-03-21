// Deterministic avatar generator: UUID → AvatarConfig
// No randomness — same UUID always produces the same avatar

export interface AvatarConfig {
  skinTone: string;
  jerseyColor: string;
  helmetColor: string;
  helmetStyle: number;   // 0-3
  accessory: number;     // 0-5
  expression: number;    // 0-4
  bodyType: number;      // 0-2
  jerseyPattern: number; // 0-3
  batStyle: number;      // 0-2
}

const SKIN_TONES = ["#F5D0A9", "#D4A574", "#C68642", "#8D5524", "#6B3A1F", "#3B1F0B"];

const JERSEY_COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#a855f7", // purple
  "#eab308", // yellow
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f43f5e", // rose
  "#6366f1", // indigo
];

const HELMET_COLORS = [
  "#1e3a5f", // navy
  "#2d1b4e", // dark purple
  "#1a1a2e", // midnight
  "#4a1c1c", // maroon
  "#1b4332", // forest
  "#3d3d3d", // charcoal
  "#5c2d0e", // brown
  "#0f4c75", // steel blue
];

// Hash a UUID string to a number
function hashUUID(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

// Get different hash segments for each attribute
function getSegment(uuid: string, salt: number): number {
  return hashUUID(uuid + String(salt));
}

export function generateAvatarConfig(userId: string): AvatarConfig {
  return {
    skinTone: SKIN_TONES[getSegment(userId, 1) % SKIN_TONES.length],
    jerseyColor: JERSEY_COLORS[getSegment(userId, 2) % JERSEY_COLORS.length],
    helmetColor: HELMET_COLORS[getSegment(userId, 3) % HELMET_COLORS.length],
    helmetStyle: getSegment(userId, 4) % 4,
    accessory: getSegment(userId, 5) % 6,
    expression: getSegment(userId, 6) % 5,
    bodyType: getSegment(userId, 7) % 3,
    jerseyPattern: getSegment(userId, 8) % 4,
    batStyle: getSegment(userId, 9) % 3,
  };
}
