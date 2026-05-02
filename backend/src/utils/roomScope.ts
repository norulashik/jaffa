export function parseRoomId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function scopedRoomId(value: unknown): string | null {
  return parseRoomId(value) ?? null;
}

