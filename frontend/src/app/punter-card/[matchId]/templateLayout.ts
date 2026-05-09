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

  // [2] Header circles — pass 8b: bubble bounds measured by manually
  //     placing the source logo PNGs in the template. Bubbles are
  //     ~96×109 PNG (was 55×55 in pass 7), located at PNG 73,342.
  leftCircle:   { top: "20.45%", left: "7.76%",  width: "10.20%", height: "6.52%" } as Rect,
  rightCircle:  { top: "20.45%", right: "8.40%", width: "10.20%", height: "6.52%" } as Rect,
  // [2] Pills — px 140,519 → 374,556 (left), 566,511 → 752,562 (right).
  pillLeft:     { top: "31.04%", left: "14.88%",  width: "24.87%", height: "2.21%" } as Rect,
  pillRight:    { top: "30.56%", right: "20.09%", width: "19.77%", height: "3.05%" } as Rect,

  // [3] 9 prediction rows. Pass 9 — points column moved to its own band
  //     (independent y-pitch from the row stripes) since the user's
  //     measurements showed points pitch (74.375 PNG) differs from the
  //     stripe pitch (~77.875 PNG).
  //     Row stripe (label + answer area): user-measured from earlier:
  //       row 1 left stripe = px 88,630 → 710,664
  //       row 9 left stripe = px 88,1253 → 710,1285
  rowsTop:      "37.68%",     // = 630/1672
  rowsHeight:   "39.17%",     // = (1285−630)/1672
  rowCount:     9,
  rowGap:       2.61,         // chosen so row 9 stripe top lands at 74.94%
  rowsLeft:     "9.35%",      // = 88/941
  rowsRight:    "23.49%",     // pass 9: stripe ends ~10px before points column
                              //   starts (was 11.05% — extended into points area)
  //     Points column (independent band, pass 9 measurements):
  //       row 1 points = px 730,604 → 811,632
  //       row 9 points = px 730,1199 → 811,1227
  pointsRowsTop:    "36.12%", // = 604/1672
  pointsRowsHeight: "37.26%", // = (1227−604)/1672
  pointsRowGap:     2.78,     // gives pitch 4.45% (= 74.375 PNG)
  pointsLeft:       "77.58%", // = 730/941
  pointsWidth:      "8.61%",  // = 81/941
  pointsHeight:     "1.67%",  // = 28/1672
  // Legacy fields kept for back-compat (no longer consumed by the row map).
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
  padX: 13,             // px — label/answer left+right padding inside stripe
  padY: 12,             // px — kept for future use
  labelFontPx: 13,      // small uppercase question label
  answerFontPx: 20,     // bold pick text
  pointsFontPx: 18,     // pass 8b: readable at normal zoom
  // Pass 7: labels sit AT THE TOP of the stripe.
  labelTopPx: 0,        // label at stripe top
  answerTopPx: 18,      // answer just below label, mostly inside stripe
  // Removed in pass 9: gap, pointsRightPx, pointsWidthPx, pointsHeightPx.
  // The points column is now a separate per-row Slot (see SLOTS.points*),
  // so its position/size lives there, not here.
} as const;

export const HEADER = {
  logoFitPct: 100,      // pass 8b: dropped back to 100 — the slot now matches
                        //   the actual bubble (96×109 PNG), so 100% fills it.
                        //   Logos render with their full content (no crop) and
                        //   transparent padding for non-square sources.
  pillFontPx: 48,       // team-short text inside each pill
  badgeFontPx: 18,      // pass 6: shrunk so "4 MAY" fits the 73px content area
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
