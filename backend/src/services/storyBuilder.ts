// Post-match recap builder — turns the user's time-ordered pick log into a
// 3–5 beat narrative. Deterministic, rule-based, no LLM.
//
// Design:
//   - Rules are ordered by priority; highest-priority ones get picked first.
//   - Always cap at 5 beats so the recap page stays skimmable.
//   - Always end on a positive beat when one exists (felt order, not literal).
//   - Tone line derived purely from accuracy; copy stays encouraging.

import type { Prediction, UserPrediction, MatchParticipant, PredictionAggregate } from "../models";

export type BeatType =
  | "signature_call"
  | "hot_streak"
  | "clutch"
  | "bold_badge"
  | "slow_start"
  | "quiet_ending"
  | "all_in_burn";

export interface StoryBeat {
  type: BeatType;
  title: string;
  detail: string;
  // Extra structured data for the frontend (icon selection, etc.)
  data?: Record<string, unknown>;
}

export interface StorySummary {
  right: number;
  wrong: number;
  totalPredictions: number;
  accuracy: number; // 0–100 integer
  totalPoints: number;
  rank?: number;
}

export interface StoryResult {
  summary: StorySummary;
  toneLine: string;
  beats: StoryBeat[];
}

type ResolvedPick = UserPrediction & { prediction?: Prediction };

// Priority order — higher index = higher priority when culling to 5.
const BEAT_PRIORITY: Record<BeatType, number> = {
  signature_call: 100,
  clutch: 90,
  hot_streak: 80,
  bold_badge: 70,
  all_in_burn: 40,
  quiet_ending: 30,
  slow_start: 20,
};

function toneFor(accuracy: number): string {
  if (accuracy >= 70) return "Sharp read on the game.";
  if (accuracy >= 50) return "Solid match — calls landed more than they didn't.";
  if (accuracy >= 30) return "Close, but the game read was hard to nail tonight.";
  return "Rough one. Next match, back yourself.";
}

function pickOrderKey(pick: ResolvedPick): number {
  // Order by when the user answered, tie-break by creation time.
  return new Date(pick.answeredAt || pick.createdAt || 0).getTime();
}

function longestCorrectStreak(picks: ResolvedPick[]): { length: number; start: number; end: number } {
  let bestLen = 0;
  let bestStart = -1;
  let bestEnd = -1;
  let curLen = 0;
  let curStart = -1;
  for (let i = 0; i < picks.length; i++) {
    if (picks[i].isCorrect === true) {
      if (curLen === 0) curStart = i;
      curLen += 1;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
        bestEnd = i;
      }
    } else {
      curLen = 0;
      curStart = -1;
    }
  }
  return { length: bestLen, start: bestStart, end: bestEnd };
}

function overLabel(p: Prediction | undefined): string | null {
  if (!p) return null;
  if (p.overNumber && p.overNumber > 0) return `over ${p.overNumber}`;
  if (p.round != null) return `round ${p.round}`;
  return null;
}

export function buildStory(
  allUserPicks: ResolvedPick[],
  participant: MatchParticipant | null,
  aggregates: PredictionAggregate[]
): StoryResult {
  // Only resolved picks carry isCorrect. Everything else is noise for the story.
  const picks = allUserPicks
    .filter((p) => p.isCorrect === true || p.isCorrect === false)
    .sort((a, b) => pickOrderKey(a) - pickOrderKey(b));

  const right = picks.filter((p) => p.isCorrect === true).length;
  const wrong = picks.length - right;
  const accuracy = picks.length ? Math.round((right / picks.length) * 100) : 0;

  const summary: StorySummary = {
    right,
    wrong,
    totalPredictions: picks.length,
    accuracy,
    totalPoints: participant?.totalPoints ?? 0,
  };

  if (picks.length === 0) {
    return {
      summary,
      toneLine: "No picks this match — watch and come back sharper.",
      beats: [],
    };
  }

  const beats: StoryBeat[] = [];

  // --- Signature call (contrarian win) ---
  // Any correct pick where the global aggregate says < 15% of the room got it right.
  const aggByPredId = new Map<string, PredictionAggregate>();
  for (const a of aggregates) {
    if (a.scope === "global") aggByPredId.set(a.predictionId, a);
  }
  for (const p of picks) {
    if (p.isCorrect !== true) continue;
    const agg = aggByPredId.get(p.predictionId);
    if (agg && agg.correctPct > 0 && agg.correctPct <= 15) {
      beats.push({
        type: "signature_call",
        title: "Signature call",
        detail: `Only ${Math.round(agg.correctPct)}% of the room nailed this one — you did.`,
        data: { predictionId: p.predictionId, correctPct: agg.correctPct },
      });
      break; // one is enough
    }
  }

  // --- Hot streak ---
  const streak = longestCorrectStreak(picks);
  if (streak.length >= 3) {
    const startPick = picks[streak.start];
    const endPick = picks[streak.end];
    const startLabel = overLabel(startPick.prediction);
    const endLabel = overLabel(endPick.prediction);
    const where = startLabel && endLabel && startLabel !== endLabel
      ? `${startLabel} to ${endLabel}`
      : (startLabel || endLabel || "the middle stretch");
    beats.push({
      type: "hot_streak",
      title: `${streak.length} in a row`,
      detail: `Found your groove — ${streak.length} straight from ${where}.`,
      data: { length: streak.length },
    });
  }

  // --- Clutch (final resolved pick was correct) ---
  const lastPick = picks[picks.length - 1];
  if (lastPick.isCorrect === true) {
    const lastLabel = overLabel(lastPick.prediction);
    beats.push({
      type: "clutch",
      title: "Clutched the finish",
      detail: lastLabel
        ? `You closed it out with a correct call on ${lastLabel}.`
        : `You nailed the last pick of the match.`,
    });
  }

  // --- Bold badge (all-in on a correct pick) ---
  const boldPick = picks.find((p) => p.boostType === "all_in" && p.isCorrect === true);
  if (boldPick) {
    beats.push({
      type: "bold_badge",
      title: "Bold move, paid off",
      detail: `All-in on "${boldPick.prediction?.question || "a pick"}" — and you got it.`,
    });
  }

  // --- All-in burn (all-in on a wrong pick — gentle) ---
  const burnPick = picks.find((p) => p.boostType === "all_in" && p.isCorrect === false);
  if (burnPick && !boldPick) {
    beats.push({
      type: "all_in_burn",
      title: "All-in didn't land",
      detail: "The big swing missed — but you kept playing. Respect.",
    });
  }

  // --- Slow start (first 5 picks had ≤ 40% accuracy) ---
  if (picks.length >= 5) {
    const first5 = picks.slice(0, 5);
    const firstRight = first5.filter((p) => p.isCorrect === true).length;
    const firstAcc = firstRight / first5.length;
    if (firstAcc <= 0.4 && accuracy > firstAcc * 100) {
      beats.push({
        type: "slow_start",
        title: "Slow start",
        detail: `Early reads went ${firstRight}/5 — but you pulled it back.`,
      });
    }
  }

  // --- Quiet ending (last 3 picks all wrong) ---
  if (picks.length >= 3) {
    const last3 = picks.slice(-3);
    if (last3.every((p) => p.isCorrect === false)) {
      beats.push({
        type: "quiet_ending",
        title: "Quiet finish",
        detail: "Last three didn't go your way. Easy mistakes to fix next match.",
      });
    }
  }

  // Sort by priority descending, cap at 5.
  const capped = beats
    .sort((a, b) => (BEAT_PRIORITY[b.type] ?? 0) - (BEAT_PRIORITY[a.type] ?? 0))
    .slice(0, 5);

  return {
    summary,
    toneLine: toneFor(accuracy),
    beats: capped,
  };
}
