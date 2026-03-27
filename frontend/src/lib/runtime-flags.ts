export const SAFE_BOOT = process.env.NEXT_PUBLIC_SAFE_BOOT === "true";
export const DISABLE_MOTION =
  SAFE_BOOT || process.env.NEXT_PUBLIC_DISABLE_MOTION === "true";
