// eslint-disable-next-line @typescript-eslint/no-unused-vars
type OverStatsLike = {
  runs?: number;
  extras?: number;
  wickets?: number;
  sixes?: number;
  boundaries?: number;
  dots?: number;
  wides?: number;
  noballs?: number;
  lastBallRuns?: number;
  lastBallWicket?: boolean;
  firstBallBoundary?: boolean;
};

/**
 * Shape adapter: turn OverStats (from sportsmonkApi) into FeedbackContext fields.
 * Exported so call sites can pass `{ ...overStatsToContext(stats) }`.
 */
export function overStatsToContext(stats: OverStatsLike): Omit<FeedbackContext, "correctOption"> {
  return {
    overRuns: stats.runs,
    overExtras: stats.extras,
    overWickets: stats.wickets,
    overSixes: stats.sixes,
    overBoundaries: stats.boundaries,
    overDots: stats.dots,
    overWides: stats.wides,
    overNoballs: stats.noballs,
    lastBallRuns: stats.lastBallRuns,
    lastBallWicket: stats.lastBallWicket,
    firstBallBoundary: stats.firstBallBoundary,
  };
}

// Builds the short "why you missed" sub-line rendered under WRONG on My Picks.
// Called from resolvePrediction with whatever context the caller has on hand:
//   - livePlayerTracker knows the batsman/bowler's total runs before resolving,
//   - over-level resolvers have the full OverStats,
//   - pre-match resolvers may have neither and that's fine — we fall back to null.
//
// Design rules:
//  - Never shame. Factual + one light flourish at most.
//  - Length-bounded to ~60 chars so the UI never wraps awkwardly.
//  - No-ops on correct picks (return null) — the correct path has its own UI.

import type { Prediction } from "../models";

export interface FeedbackContext {
  correctOption: string;
  // Runs totals, for batsman/bowler-innings subjects.
  actualBatsmanRuns?: number;
  actualBowlerRuns?: number;
  actualBowlerWickets?: number;
  actualBatsmanSixes?: number;
  // For over-level templates.
  overRuns?: number;
  overWickets?: number;
  overSixes?: number;
  overBoundaries?: number;
  overDots?: number;
  overExtras?: number;
  overWides?: number;
  overNoballs?: number;
  firstBallBoundary?: boolean;
  lastBallRuns?: number;
  lastBallWicket?: boolean;
}

type Band = { key: string; min: number; max: number };

const BATSMAN_BANDS: Band[] = [
  { key: "0_15", min: 0, max: 15 },
  { key: "16_35", min: 16, max: 35 },
  { key: "36_60", min: 36, max: 60 },
  { key: "60_plus", min: 61, max: Infinity },
];

const BOWLER_BANDS: Band[] = [
  { key: "0_24", min: 0, max: 24 },
  { key: "25_35", min: 25, max: 35 },
  { key: "36_45", min: 36, max: 45 },
  { key: "45_plus", min: 46, max: Infinity },
];

// Distance from value to the nearest edge of the picked band. Positive = over the band,
// negative = under the band, 0 = inside (so shouldn't be called — caller already knows).
function bandGap(value: number, band: Band | undefined): number {
  if (!band) return 0;
  if (value < band.min) return value - band.min; // negative
  if (value > band.max) return value - band.max; // positive
  return 0;
}

function runsWord(n: number): string {
  return Math.abs(n) === 1 ? "run" : "runs";
}

function bandFor(option: string, bands: Band[]): Band | undefined {
  return bands.find((b) => b.key === option);
}

function describeBandMiss(gap: number): string {
  const abs = Math.abs(gap);
  if (abs === 0) return ""; // shouldn't happen
  if (abs <= 3) return `Missed by ${abs} ${runsWord(abs)} — razor close`;
  if (abs <= 8) return `${abs} ${runsWord(abs)} off — you were ${gap > 0 ? "under" : "over"}`;
  return `${gap > 0 ? "Came in under" : "Overshot"} by ${abs} ${runsWord(abs)}`;
}

// Build feedback for the "was this six/boundary/wicket/... ?" Yes/No family,
// and the few multi-option templates that aren't bands.
function overLevelFeedback(prediction: Prediction, selected: string, ctx: FeedbackContext): string | null {
  const q = prediction.question.toLowerCase();

  // Runs this over — low/medium/high bucket (0-5 / 6-10 / 11+)
  if (q.includes("how many runs") && ctx.overRuns != null) {
    const actual = ctx.overRuns;
    const BUCKETS = [
      { key: "low", min: 0, max: 5 },
      { key: "medium", min: 6, max: 10 },
      { key: "high", min: 11, max: Infinity },
    ];
    const picked = BUCKETS.find((b) => b.key === selected);
    const gap = picked ? bandGap(actual, picked) : 0;
    if (gap === 0) return null;
    return describeBandMiss(gap);
  }

  // Wicket in over? Yes/No
  if (q.includes("wicket in over") && ctx.overWickets != null) {
    if (selected === "yes" && ctx.overWickets === 0) return "No wicket — bowlers kept looking";
    if (selected === "no" && ctx.overWickets > 0)
      return ctx.overWickets === 1 ? "One wicket snuck through" : `${ctx.overWickets} wickets this over`;
    return null;
  }

  // Sixes in over — 0/1/2/3+
  if (q.includes("sixes in over") && ctx.overSixes != null) {
    const buckets = [
      { key: "zero", min: 0, max: 0 },
      { key: "one", min: 1, max: 1 },
      { key: "two", min: 2, max: 2 },
      { key: "three_plus", min: 3, max: Infinity },
    ];
    const picked = buckets.find((b) => b.key === selected);
    const gap = picked ? bandGap(ctx.overSixes, picked) : 0;
    if (gap === 0) return null;
    const abs = Math.abs(gap);
    return gap > 0 ? `${abs} more six${abs === 1 ? "" : "es"} than you thought` : `${abs} fewer six${abs === 1 ? "" : "es"} than you thought`;
  }

  // Boundary off the first ball? Yes/No
  if (q.includes("boundary off the first ball") && ctx.firstBallBoundary != null) {
    if (selected === "yes" && !ctx.firstBallBoundary) return "First ball didn't go";
    if (selected === "no" && ctx.firstBallBoundary) return "First ball found the fence";
    return null;
  }

  // Dot balls — few/some/lots
  if (q.includes("dot balls") && ctx.overDots != null) {
    const buckets = [
      { key: "few", min: 0, max: 2 },
      { key: "some", min: 3, max: 4 },
      { key: "lots", min: 5, max: Infinity },
    ];
    const picked = buckets.find((b) => b.key === selected);
    const gap = picked ? bandGap(ctx.overDots, picked) : 0;
    if (gap === 0) return null;
    const abs = Math.abs(gap);
    return gap > 0 ? `${abs} more dot${abs === 1 ? "" : "s"} than expected` : `${abs} fewer dot${abs === 1 ? "" : "s"} than expected`;
  }

  // Last ball outcome — dot/single/boundary/wicket
  if (q.includes("last ball") && ctx.lastBallRuns != null && ctx.lastBallWicket != null) {
    let actualKey: string;
    if (ctx.lastBallWicket) actualKey = "wicket";
    else if (ctx.lastBallRuns >= 4) actualKey = "boundary";
    else if (ctx.lastBallRuns >= 1) actualKey = "single";
    else actualKey = "dot";
    if (actualKey === selected) return null;
    const nicer: Record<string, string> = {
      dot: "a dot", single: "a single", boundary: "a boundary", wicket: "a wicket",
    };
    return `Finish was ${nicer[actualKey] || actualKey}`;
  }

  // More than 2 boundaries? Yes/No
  if (q.includes("more than 2 boundaries") && ctx.overBoundaries != null) {
    if (selected === "yes" && ctx.overBoundaries <= 2)
      return ctx.overBoundaries === 2 ? "Stuck on 2 — one short" : `Only ${ctx.overBoundaries} boundar${ctx.overBoundaries === 1 ? "y" : "ies"}`;
    if (selected === "no" && ctx.overBoundaries > 2) return `${ctx.overBoundaries} boundaries — a fest`;
    return null;
  }

  // Maiden over? Yes/No
  if (q.includes("maiden") && ctx.overRuns != null) {
    if (selected === "yes" && ctx.overRuns > 0)
      return ctx.overRuns === 1 ? "One run away from a maiden" : `${ctx.overRuns} runs — no maiden tonight`;
    if (selected === "no" && ctx.overRuns === 0 && (ctx.overWides ?? 0) === 0 && (ctx.overNoballs ?? 0) === 0)
      return "Maiden bowled — you missed the respect";
    return null;
  }

  // Extras this over — none / 1-2 / 3+
  if (q.includes("how many extras") && ctx.overExtras != null) {
    const buckets = [
      { key: "none", min: 0, max: 0 },
      { key: "one_two", min: 1, max: 2 },
      { key: "three_plus", min: 3, max: Infinity },
    ];
    const picked = buckets.find((b) => b.key === selected);
    const gap = picked ? bandGap(ctx.overExtras, picked) : 0;
    if (gap === 0) return null;
    const abs = Math.abs(gap);
    return gap > 0 ? `${abs} more extra${abs === 1 ? "" : "s"} than you called` : `${abs} fewer extra${abs === 1 ? "" : "s"} than you called`;
  }

  return null;
}

/**
 * Entry point. Returns null when no useful signal is available — caller should
 * leave feedbackText as null on the user's row.
 */
export function buildFeedback(
  prediction: Prediction,
  selectedOption: string,
  context: FeedbackContext
): string | null {
  // Correct picks don't need a miss line.
  if (selectedOption === context.correctOption) return null;

  // --- Batsman total (live player) ---
  if (prediction.subjectType === "batsman_innings" && context.actualBatsmanRuns != null) {
    const band = bandFor(selectedOption, BATSMAN_BANDS);
    const gap = bandGap(context.actualBatsmanRuns, band);
    if (gap === 0) return null;
    return describeBandMiss(gap);
  }

  // --- Bowler total (live player) ---
  if (prediction.subjectType === "bowler_innings" && context.actualBowlerRuns != null) {
    const band = bandFor(selectedOption, BOWLER_BANDS);
    const gap = bandGap(context.actualBowlerRuns, band);
    if (gap === 0) return null;
    return describeBandMiss(gap);
  }

  // --- Team-level per-over templates ---
  return overLevelFeedback(prediction, selectedOption, context);
}
