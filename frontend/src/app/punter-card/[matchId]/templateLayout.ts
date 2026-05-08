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
  // [1] Top-right rounded badge — match date. Pass-2 calibration: bumped
  //     down ~1.4% so "8 MAY" centers inside the bubble outline.
  dateBadge:    { top: "5.0%",  right: "6.0%", width: "22.5%", height: "4.0%" } as Rect,

  // [2] Header — circles (logos) + pills (team shorts), sitting under the
  //     "jaffa" wordmark baked into the PNG. Pass-2: dropped ~1% so the
  //     elements land inside their drawn outlines.
  leftCircle:   { top: "21.0%", left: "10.0%",  width: "13.5%", height: "8.0%" } as Rect,
  rightCircle:  { top: "21.0%", right: "10.0%", width: "13.5%", height: "8.0%" } as Rect,
  pillLeft:     { top: "31.5%", left: "10.0%",  width: "37.0%", height: "5.6%" } as Rect,
  pillRight:    { top: "31.5%", right: "10.0%", width: "37.0%", height: "5.6%" } as Rect,

  // [3] 10 prediction rows. The PNG draws 10 horizontal stripes between
  //     ~43.5% and ~84% of the canvas height. We compute each stripe's
  //     vertical position via rowsTop / rowsHeight / rowGap below.
  //     Pass-2: rowsTop pushed +2.5% so rows land in the PNG's drawn
  //     stripes rather than above them.
  rowsTop:      "43.5%",
  rowsHeight:   "40.5%",     // total vertical span for all 10 rows + gaps
  rowCount:     10,
  rowGap:       0.7,         // % between adjacent rows
  // Within each row, content layout — left column for question + answer,
  // right column for the glow points box.
  rowQuestion:  { left: "5.5%",  width: "62%" } as Rect,   // small label (top of row)
  rowAnswer:    { left: "5.5%",  width: "62%" } as Rect,   // large user-pick text (bottom of row)
  rowPoints:    { right: "5.0%", width: "21%", height: "62%" } as Rect, // glow box

  // [4] Bottom-left — MAX POTENTIAL. Pass-2: bumped down 2% so label +
  //     total render INSIDE the box (was sitting above it).
  maxPotential: { bottom: "3.5%", left: "6.5%",  width: "30%", height: "9.5%" } as Rect,

  // [5] Bottom-right — CTA stack (around the ape character which lives in
  //     the bottom-center of the PNG). Pass-2: bumped down 2% likewise.
  cta:          { bottom: "3.5%", right: "5.0%", width: "38%", height: "9.5%" } as Rect,
} as const;

// Inner-content layout constants — consumed by ShareCard's flex containers.
// Change one number here and every container re-flows. NOT to be confused
// with SLOTS, which positions the bounding boxes on the canvas.
//
// Padding values are in px because the canvas is rendered at fixed
// 941×1672 dimensions, so px units are deterministic. Font sizes are also
// in px for the same reason.
export const ROW = {
  padX: 28,           // px — left + right padding inside each row stripe
  padY: 12,           // px — top + bottom padding inside each row stripe
  gap: 16,            // px between left text column and right points badge
  labelFontPx: 13,    // small uppercase question label
  answerFontPx: 20,   // bold pick text
  pointsFontPx: 18,   // points badge ("40 PTS" / "VOID")
  pointsWidthPct: 22, // % of card width for the right points badge
} as const;

export const HEADER = {
  logoFitPct: 65,     // logo image fills 65% of its circle slot diameter
  pillFontPx: 48,     // team-short text inside each pill
  badgeFontPx: 26,    // date badge text
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
// across cards. Anything not in this array slots in at the end.
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
  "punter_balls_per_boundary",
];

export function shortLabelFor(templateKey: string | undefined, fallback: string): string {
  if (templateKey && LABEL_BY_TEMPLATE_KEY[templateKey]) {
    return LABEL_BY_TEMPLATE_KEY[templateKey];
  }
  // Fallback: take the raw question, uppercase it, and truncate to 28 chars.
  const t = (fallback || "").toUpperCase();
  return t.length > 28 ? t.slice(0, 27) + "…" : t;
}
