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

export type AvatarSize = "sm" | "md" | "lg";
export type AvatarMood = "idle" | "celebrate" | "disappointed" | "excited";
