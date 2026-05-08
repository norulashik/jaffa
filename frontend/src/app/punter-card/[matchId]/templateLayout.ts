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
  // [1] Date badge — pass 4: shift LEFT 12px (right += 0.85%) and DOWN
  //     6px (top += 0.36%) per Position Correction Rules.
  dateBadge:    { top: "4.86%", right: "5.85%", width: "19.0%", height: "3.8%" } as Rect,

  // [2] Header — pass 4: circles shifted UP 18px (top -= 1.08%); logo
  //     scale itself bumps via HEADER.logoFitPct below. Pills shifted
  //     DOWN 8px (top += 0.48%).
  leftCircle:   { top: "19.92%", left: "11.0%",  width: "12.0%", height: "7.2%" } as Rect,
  rightCircle:  { top: "19.92%", right: "11.0%", width: "12.0%", height: "7.2%" } as Rect,
  pillLeft:     { top: "31.98%", left: "10.0%",  width: "37.0%", height: "5.6%" } as Rect,
  pillRight:    { top: "31.98%", right: "10.0%", width: "37.0%", height: "5.6%" } as Rect,

  // [3] 10 prediction rows. Pass 3 band-position kept; pass 4 changes
  //     happen INSIDE each row container (see ROW.* below + page.tsx row
  //     JSX, switched from flex-centre to absolute pixel anchors).
  rowsTop:      "43.0%",
  rowsHeight:   "37.0%",
  rowCount:     10,
  rowGap:       0.6,
  rowQuestion:  { left: "5.5%",  width: "62%" } as Rect,
  rowAnswer:    { left: "5.5%",  width: "62%" } as Rect,
  rowPoints:    { right: "5.0%", width: "21%", height: "62%" } as Rect,

  // [4] Max-potential — pass 4: shifted DOWN 14px (bottom -= 0.84%) per
  //     Position Correction Rules.
  maxPotential: { bottom: "6.16%", left: "6.5%",  width: "30%", height: "9.5%" } as Rect,

  // [5] CTA — pass 4: shifted DOWN 10px (bottom -= 0.6%) likewise.
  cta:          { bottom: "6.4%", right: "5.0%", width: "38%", height: "9.5%" } as Rect,
} as const;

// Inner-content layout constants — consumed by ShareCard's flex containers.
// Change one number here and every container re-flows. NOT to be confused
// with SLOTS, which positions the bounding boxes on the canvas.
//
// Padding values are in px because the canvas is rendered at fixed
// 941×1672 dimensions, so px units are deterministic. Font sizes are also
// in px for the same reason.
export const ROW = {
  padX: 32,             // px — was 28; matches Position Correction Rules
  padY: 12,             // px — top + bottom padding inside each row stripe
  gap: 16,              // px reserved between left content area and points badge
  labelFontPx: 13,      // small uppercase question label
  answerFontPx: 20,     // bold pick text
  pointsFontPx: 18,     // points badge ("40 PTS" / "VOID")
  // Pass 4 — fixed-px anchors inside each row container.
  labelTopPx: 14,       // top offset of the question label from row top
  answerTopPx: 34,      // top offset of the answer from row top
  pointsRightPx: 22,    // right offset of the points badge from row right
  pointsWidthPx: 140,   // fixed-px width of the points badge
  pointsHeightPx: 40,   // fixed-px height of the points badge
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
