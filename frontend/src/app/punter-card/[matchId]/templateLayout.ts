// Punter Card share-image layout constants.
//
// The downloadable card is a strict overlay on the JAFFA template PNG
// (frontend/public/punter-card/template.png — native 941×1672). Every slot
// below is a percentage rectangle sitting over a box that is already
// drawn IN the PNG. Do NOT redesign or reposition — just nudge values
// here when calibration drifts after the source PNG is regenerated.
//
// Coordinates are calibrated by-eye against the template's own outlines:
//   • the rounded badge in the top-right
//   • the two header circles (team logos)
//   • the two header pills (team shorts)
//   • the 10 horizontal row stripes
//   • the bottom-left "MAX POTENTIAL" rectangle
//   • the bottom-right CTA rectangle (carved around the ape character)

export const TEMPLATE = { width: 941, height: 1672 } as const;

export type Rect = {
  top?: string; left?: string; right?: string; bottom?: string;
  width?: string; height?: string; size?: string;
};

export const SLOTS = {
  // Pass 5: every rectangle below is derived directly from user-measured
  // pixel coords on the source PNG (941×1672). Source-of-truth for every
  // placeholder. If the PNG is ever regenerated these need re-measuring.

  // [1] Date badge — px 777,53 → 866,76.
  dateBadge:    { top: "3.17%", right: "7.97%", width: "9.46%", height: "1.38%" } as Rect,

  // [2] Header circles — px 85,371 → 140,426 (left), 787,375 → 840,424 (right).
  leftCircle:   { top: "22.19%", left: "9.03%",   width: "5.84%", height: "3.29%" } as Rect,
  rightCircle:  { top: "22.43%", right: "10.73%", width: "5.63%", height: "2.93%" } as Rect,
  // [2] Pills — px 140,519 → 374,556 (left), 566,511 → 752,562 (right).
  pillLeft:     { top: "31.04%", left: "14.88%",  width: "24.87%", height: "2.21%" } as Rect,
  pillRight:    { top: "30.56%", right: "20.09%", width: "19.77%", height: "3.05%" } as Rect,

  // [3] 9 prediction rows (was 10 — user dropped one for breathing room).
  //     Band derived from row1 (80,624→835,653) and row9 (80,1245→835,1277):
  //     top = row1.top%, height = row9.bottom% − row1.top%.
  //     rowGap is tuned so the formula's i-th row top lands exactly on
  //     the stripe coords for i = 0 and i = 8.
  rowsTop:      "37.32%",
  rowsHeight:   "39.06%",
  rowCount:     9,
  rowGap:       2.72,
  rowQuestion:  { left: "8.5%",  width: "65%" } as Rect,
  rowAnswer:    { left: "8.5%",  width: "65%" } as Rect,
  rowPoints:    { right: "5.0%", width: "20%", height: "100%" } as Rect,

  // [4] MAX POTENTIAL — px 80,1360 → 282,1440.
  maxPotential: { bottom: "13.88%", left: "8.5%",  width: "21.47%", height: "4.78%" } as Rect,

  // [5] CTA — px 640,1360 → 850,1440.
  cta:          { bottom: "13.88%", right: "9.67%", width: "22.32%", height: "4.78%" } as Rect,
} as const;

// Inner-content layout constants — consumed by ShareCard's flex containers.
// Change one number here and every container re-flows. NOT to be confused
// with SLOTS, which positions the bounding boxes on the canvas.
//
// Padding values are in px because the canvas is rendered at fixed
// 941×1672 dimensions, so px units are deterministic. Font sizes are also
// in px for the same reason.
export const ROW = {
  padX: 32,             // px — left/right padding inside each row stripe
  padY: 12,             // px — kept for future use (currently slot ≡ stripe)
  gap: 16,              // px reserved between left content area and points badge
  labelFontPx: 13,      // small uppercase question label
  answerFontPx: 20,     // bold pick text
  pointsFontPx: 16,     // points badge ("40 PTS" / "VOID") — shrunk to fit thin stripe
  // Pass 5 — slot ≡ stripe (~32px tall). Stripe is too thin to fit a
  // stacked label+answer inside, so label/answer use NEGATIVE top
  // offsets to render above the stripe (the stripe acts as a visual
  // underline). Points badge stays inside the stripe, vertically centred.
  labelTopPx: -42,      // label sits ~42px above stripe top
  answerTopPx: -18,     // answer sits ~18px above stripe top (just above its top edge)
  pointsRightPx: 22,    // right offset of the points badge from row right
  pointsWidthPx: 130,   // fixed-px width of the points badge
  pointsHeightPx: 24,   // shrunk from 40 → fits inside ~32px stripe
} as const;

export const HEADER = {
  logoFitPct: 77,       // pass 4: +18% scale per Position Correction Rules
  pillFontPx: 48,       // team-short text inside each pill
  badgeFontPx: 26,      // date badge text
} as const;

export const FOOTER = {
  maxPotLabelPx: 14,
  maxPotValuePx: 42,
  ctaLine1Px: 17,
  ctaLine2Px: 13,
  ctaLine3Px: 19,     // PLAYJAFFA.COM
  padX: 18,
} as const;

// Map of templateKey → short uppercase label for the row's small text.
// The raw `prediction.question` string is too long for the row strip
// (e.g. "Who scores less today: V Kohli or R Sharma?"), so we surface a
// concise label keyed off the stable `templateKey`.
export const LABEL_BY_TEMPLATE_KEY: Record<string, string> = {
  // Active v2 templates
  punter_motm: "PLAYER OF THE MATCH",
  punter_top_batter: "TOP BATTER",
  punter_top_bowler: "TOP BOWLER",
  punter_star_batter_lower: "LOWER SCORER",
  punter_wk_better_sr: "WK STRIKE RATE",
  punter_openers_more_boundaries: "OPENER BOUNDARIES",
  punter_allrounder_impact: "ALL-ROUNDER IMPACT",
  punter_first_event: "FIRST: SIX OR WICKET",
  punter_overs_16_20_runs: "DEATH OVERS RUNS",
  punter_balls_per_boundary: "BALLS PER BOUNDARY",
  // Legacy / archived
  punter_top_vs_death: "TOP ORDER VS DEATH",
  punter_match_winner: "MATCH WINNER",
  punter_toss_winner: "TOSS WINNER",
  punter_inn1_50: "INN1 → 50",
  punter_inn1_100: "INN1 → 100",
  punter_inn2_50: "INN2 → 50",
  punter_inn2_100: "INN2 → 100",
  punter_highest_at_1st_dismissal: "HIGHEST @ 1st OUT",
};

// Stable row-order so the same question always lands in the same row
// across cards. Pass 5: 9 rows (was 10) — `punter_balls_per_boundary`
// dropped to give the share card breathing room. The backend still
// generates it; we just don't render it on the share card.
export const ROW_ORDER: ReadonlyArray<string> = [
  "punter_motm",
  "punter_top_batter",
  "punter_top_bowler",
  "punter_star_batter_lower",
  "punter_wk_better_sr",
  "punter_openers_more_boundaries",
  "punter_allrounder_impact",
  "punter_first_event",
  "punter_overs_16_20_runs",
];

export function shortLabelFor(templateKey: string | undefined, fallback: string): string {
  if (templateKey && LABEL_BY_TEMPLATE_KEY[templateKey]) {
    return LABEL_BY_TEMPLATE_KEY[templateKey];
  }
  // Fallback: take the raw question, uppercase it, and truncate to 28 chars.
  const t = (fallback || "").toUpperCase();
  return t.length > 28 ? t.slice(0, 27) + "…" : t;
}
