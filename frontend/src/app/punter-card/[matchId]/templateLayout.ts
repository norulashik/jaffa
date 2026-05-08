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

  // [2] Header circles — pass 7: shifted to user's specified corner
  //     (PNG 99,383) with logoFitPct bumped (see HEADER.logoFitPct).
  leftCircle:   { top: "22.91%", left: "10.52%",  width: "5.84%", height: "3.29%" } as Rect,
  rightCircle:  { top: "22.91%", right: "10.52%", width: "5.84%", height: "3.29%" } as Rect,
  // [2] Pills — px 140,519 → 374,556 (left), 566,511 → 752,562 (right).
  pillLeft:     { top: "31.04%", left: "14.88%",  width: "24.87%", height: "2.21%" } as Rect,
  pillRight:    { top: "30.56%", right: "20.09%", width: "19.77%", height: "3.05%" } as Rect,

  // [3] 9 prediction rows. Pass 6 — re-measured with finer precision:
  //     row 1 left stripe = px 88,630 → 710,664; row 9 left stripe = px
  //     88,1253 → 710,1285; per-row points box = px 770,638 → 837,655
  //     (vertically centred inside its row stripe). The row SLOT covers
  //     both the left stripe AND the points box (PNG x=88 → 837), so
  //     internal positioning constrains label/answer to the left stripe
  //     area and points to the right box area.
  rowsTop:      "37.68%",     // = 630/1672
  rowsHeight:   "39.17%",     // = (1285−630)/1672
  rowCount:     9,
  rowGap:       2.61,         // chosen so row 9 stripe top lands at 74.94%
  rowsLeft:     "9.35%",      // = 88/941 (left edge of row span)
  rowsRight:    "11.05%",     // = (941−837)/941 (right edge of row span)
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
  padX: 13,             // pass 7: shrunk so label starts at PNG x=101 (user's
                        //   measured "Player of the match" left edge =
                        //   slot.left(88) + 13 = 101).
  padY: 12,             // px — kept for future use
  gap: 60,              // px — actual PNG distance between left stripe right edge
                        //   (PNG x=710) and points box left edge (PNG x=770)
  labelFontPx: 13,      // small uppercase question label
  answerFontPx: 20,     // bold pick text
  pointsFontPx: 12,     // points badge — shrunk to fit a 17px-tall box
  // Pass 7: labels were rendering ABOVE the stripe outline (out of the box).
  // Now sit AT THE TOP of the stripe (matches user's "y=945 JPEG = y=630 PNG").
  labelTopPx: 0,        // label at stripe top
  answerTopPx: 18,      // answer just below label, mostly inside stripe
  pointsRightPx: 0,     // points sits flush with the slot's right edge (PNG x=837)
  pointsWidthPx: 67,    // matches user's measured points box width
  pointsHeightPx: 17,   // matches user's measured points box height
} as const;

export const HEADER = {
  logoFitPct: 400,      // pass 7: bumped further — at 280 the visible crest was
                        //   still ~50% of the bubble. 400% renders the IMG at
                        //   220px on a 55px slot, with the visible content
                        //   (after SVG padding) filling more of the bubble.
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
