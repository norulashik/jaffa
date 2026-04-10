export function getCurrentWeekNumber(): number {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Encodes year+week to avoid collisions across years (e.g. 202615 for week 15 of 2026)
export function getYearWeekNumber(): number {
  const now = new Date();
  const week = getCurrentWeekNumber();
  return now.getFullYear() * 100 + week;
}
