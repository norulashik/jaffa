import { Server as SocketIOServer } from "socket.io";
import { Op } from "sequelize";
import { Match, Prediction } from "../models";
import { resolvePrediction, voidPrediction } from "./pointsEngine";

// Imported dynamically in pollLivePlayers to avoid circular deps
// (sportsmonkApi <-> livePlayerTracker can reference each other's helpers).
type LoadFixtureFn = (fixtureId: number, includeBalls: boolean) => Promise<any>;

/**
 * Live player question tracker.
 *
 * Replaces the old name-string per-over player pool. For every new batsman
 * who appears on a ball we create one prediction ("How many runs will <name>
 * score?"); for every new bowler in an innings we create one ("How many runs
 * will <name> concede this innings?"). Keys are Sportsmonk player IDs so the
 * resolver never has to fuzzy-match on text.
 *
 * Invoked once per Sportsmonk poll tick (every 5 s) from index.ts. Idempotent:
 * repeated calls with the same fixture data are safe, because generation uses
 * findOrCreate and resolution is guarded by prediction status.
 */

// Terminal statuses where the match is over without a complete result.
// Unresolved player questions get voided + boosts refunded in these cases.
const NO_RESULT_STATUSES = new Set([
  "Abandoned",
  "Cancelled",
  "No result",
  "Postp.",
]);

// Batsman-question lock window: 30 s from question creation.
// Time-based lock avoids the create+lock race we'd get with a ball-based rule
// at the 5 s poll cadence. Override with SIM_BATSMAN_LOCK_MS for testing.
const LOCK_BATSMAN_AFTER_MS = Number(process.env.SIM_BATSMAN_LOCK_MS || 30_000);

// Sportsmonk BallData shape (narrow subset we need).
interface Ball {
  ball: number;              // 0.1–0.6 = over 1, 1.1–1.6 = over 2, etc.
  scoreboard: string;        // "S1" or "S2"
  batsman_id: number;
  bowler_id: number;
  batsmanout_id: number | null;
  score: {
    name: string;            // dismissal type string ("catch out", "retired hurt", ...)
    runs: number;
    four: boolean;
    six: boolean;
    bye: number;
    leg_bye: number;
    noball: number;
    noball_runs: number;
    is_wicket: boolean;
    ball: boolean;           // true = legal delivery (counts as ball faced)
    out: boolean;
  };
  batsman: { fullname: string } | null;
  bowler: { fullname: string } | null;
}

interface BatsmanBand {
  key: string;
  label: string;
  max: number; // inclusive upper bound; last band is Infinity
}
interface BowlerBand extends BatsmanBand {}

const BATSMAN_BANDS: BatsmanBand[] = [
  { key: "0_15", label: "0-15", max: 15 },
  { key: "16_35", label: "16-35", max: 35 },
  { key: "36_60", label: "36-60", max: 60 },
  { key: "60_plus", label: "60+", max: Infinity },
];

// Tighter bands for batsmen who walk in late and can't realistically reach the
// FULL bands (e.g. Jofra Archer arrives at 19.3 with at most ~9 balls left).
// Picked at creation time based on remaining-overs ceiling. The band-set is
// fingerprinted by its key list so the resolver can pick the right one back.
const BATSMAN_BANDS_MID: BatsmanBand[] = [
  { key: "0_10", label: "0-10", max: 10 },
  { key: "11_25", label: "11-25", max: 25 },
  { key: "26_45", label: "26-45", max: 45 },
  { key: "45_plus", label: "45+", max: Infinity },
];
const BATSMAN_BANDS_LATE: BatsmanBand[] = [
  { key: "0_5", label: "0-5", max: 5 },
  { key: "6_15", label: "6-15", max: 15 },
  { key: "16_25", label: "16-25", max: 25 },
  { key: "25_plus", label: "25+", max: Infinity },
];

// Death-overs binary. At over 16+ a fresh batsman realistically maxes out
// around the high-teens — offering 0-15/16-35/36-60 as choices is dishonest
// odds and the user complained about it. Two-option set with 50 pts each
// matches the "depending on the overs" spec from product.
const BATSMAN_BANDS_DEATH: BatsmanBand[] = [
  { key: "death_under_15", label: "Under 15", max: 14 },
  { key: "death_15_plus", label: "15+",      max: Infinity },
];

// Maps the prediction's saved option keys back to the original BatsmanBand[]
// so the resolver buckets against the right set, regardless of which variant
// was used at creation time.
function batsmanBandsForPred(pred: { options: { key: string }[] }): BatsmanBand[] {
  const keys = new Set(pred.options.map((o) => o.key));
  for (const set of [BATSMAN_BANDS, BATSMAN_BANDS_MID, BATSMAN_BANDS_LATE, BATSMAN_BANDS_DEATH]) {
    if (set.every((b) => keys.has(b.key))) return set;
  }
  return BATSMAN_BANDS;
}

// Pick a band-set based on what the batsman could realistically achieve from
// this point onward. Two signals:
//   - currentOver: anyone arriving at over 16+ (death) gets the binary
//     under-15/15+ set — even if they technically have 4-5 overs left, no
//     one in IPL 2026 is shaping a 60+ inning from a death-overs arrival.
//   - remainingMaxRuns: legacy ceiling-based fallback for non-death cases,
//     so a Jadeja at over 14 with ~36 max runs gets MID (11-25-45) instead
//     of standard.
function pickBatsmanBands(currentOver: number, totalOvers: number, remainingMaxRuns: number): BatsmanBand[] {
  // Death window = last 5 overs of the innings (16-20 for a T20). Adapts
  // proportionally for shorter / DLS-trimmed games.
  const deathStart = Math.max(2, (totalOvers || 20) - 4);
  if (currentOver >= deathStart) return BATSMAN_BANDS_DEATH;
  if (remainingMaxRuns >= 60) return BATSMAN_BANDS;
  if (remainingMaxRuns >= 30) return BATSMAN_BANDS_MID;
  return BATSMAN_BANDS_LATE;
}

// Compute remaining legal balls in this innings from the in-progress over.
// The current-over decimal counts balls bowled; full overs left contribute 6.
function remainingBallsInInnings(
  ballsThisInnings: Ball[],
  totalOvers: number
): number {
  if (ballsThisInnings.length === 0) return totalOvers * 6;
  // Highest "ball" string we've seen — Sportsmonk uses "<over-1>.<ball>".
  let maxBall = 0;
  for (const b of ballsThisInnings) {
    const n = parseFloat(String((b as any).ball || "0"));
    if (Number.isFinite(n) && n > maxBall) maxBall = n;
  }
  const overIdx = Math.floor(maxBall);                     // 0-indexed
  const ballsBowledInCurrentOver = Math.round((maxBall - overIdx) * 10);
  const ballsLeftInCurrentOver = Math.max(0, 6 - ballsBowledInCurrentOver);
  const fullOversLeft = Math.max(0, totalOvers - (overIdx + 1));
  return ballsLeftInCurrentOver + fullOversLeft * 6;
}

const BOWLER_BANDS: BowlerBand[] = [
  { key: "0_24", label: "0-24", max: 24 },
  { key: "25_35", label: "25-35", max: 35 },
  { key: "36_45", label: "36-45", max: 45 },
  { key: "45_plus", label: "45+", max: Infinity },
];

// Death-overs binary for bowlers — runs variant. A bowler introduced at
// over 16+ realistically bowls ~1-2 overs at most, so the standard 4-band
// "0-24 / 25-35 / …" set has false ceiling values. 12 runs is the IPL par
// for a single death over.
const BOWLER_BANDS_DEATH: BowlerBand[] = [
  { key: "death_runs_under_12", label: "Under 12 runs", max: 11 },
  { key: "death_runs_12_plus",  label: "12+ runs",      max: Infinity },
];

// Rotating phrasings — commentator-voice, in-the-moment. Picked at generation
// time via Math.random and frozen on the prediction row so the question text
// stays stable for the life of that question.
const BATSMAN_PHRASINGS: Array<(name: string) => string> = [
  (n) => `${n} walks out — how does he finish?`,
  (n) => `Big moment for ${n}. Where does he land?`,
  (n) => `${n} at the crease. Runs on the board?`,
  (n) => `${n}'s first look — where does this innings land?`,
  (n) => `Read ${n}'s form. What's the final number?`,
  (n) => `Crowd's on its feet for ${n}. Where does he stop?`,
  (n) => `${n}'s innings tonight — put a figure on it.`,
  (n) => `How big does ${n} go? Your call.`,
  (n) => `${n} steps up. What's his scoreboard story?`,
  (n) => `Pick the peak of ${n}'s innings.`,
];

const BOWLER_PHRASINGS: Array<(name: string) => string> = [
  (n) => `${n} rolls in. How much does he give up?`,
  (n) => `${n} marks his run-up — expensive night?`,
  (n) => `Eyes on ${n}'s spell. Where does it land?`,
  (n) => `${n}'s ball — read him. Final damage?`,
  (n) => `${n} into the attack. How many leak off this end?`,
  (n) => `Fielders set for ${n}. How many does he concede?`,
  (n) => `Captain trusts ${n}. Was he right? Runs given.`,
  (n) => `${n}'s radar tonight — pick his damage.`,
  (n) => `${n} rolls the dice. Size up the damage.`,
  (n) => `Figures check — where does ${n} finish?`,
];

// Wicket-flavour bowler phrasings used when we roll the "wickets" variant.
// Pool sized to match BOWLER_PHRASINGS (10 each) for parity.
const BOWLER_WICKETS_PHRASINGS: Array<(name: string) => string> = [
  (n) => `${n} on the hunt — how many scalps tonight?`,
  (n) => `${n}'s wicket count — call it.`,
  (n) => `Will ${n} strike? How many times?`,
  (n) => `${n} prowling at the top — wickets this innings?`,
  (n) => `How many wickets drop into ${n}'s column?`,
  (n) => `${n}'s figures — pick the wicket tally.`,
  (n) => `${n} has the new ball — wickets tonight?`,
  (n) => `${n} into the attack. Strikes coming?`,
  (n) => `Bet on ${n} — how many down?`,
  (n) => `${n}'s bounce tonight — scalps?`,
];

// Death-overs phrasings — short, binary-feel, match the binary band sets.
// Used when a player walks in / is introduced at over 16+.
const BATSMAN_PHRASINGS_DEATH: Array<(name: string) => string> = [
  (n) => `${n} in at the death — does he get to 15+?`,
  (n) => `Late entry for ${n}. Cracks 15 or falls short?`,
  (n) => `${n}'s cameo — under 15 or beyond?`,
  (n) => `${n} walks in deep — runs on the board?`,
];
const BOWLER_PHRASINGS_DEATH: Array<(name: string) => string> = [
  (n) => `${n} in the death — does he leak 12+?`,
  (n) => `Pressure on ${n} — under 12 or expensive?`,
  (n) => `${n} into the attack at the death — runs?`,
  (n) => `Death-over check on ${n} — how many off the spell?`,
];
const BOWLER_WICKETS_PHRASINGS_DEATH: Array<(name: string) => string> = [
  (n) => `${n} at the death — wicketless, or does he strike?`,
  (n) => `Will ${n} get a scalp at the death?`,
  (n) => `${n} finds the breakthrough or stays empty-handed?`,
  (n) => `${n}'s death over — wicket on the cards?`,
];

// Bowler-wickets bands — user-specified.
const BOWLER_WICKETS_BANDS = [
  { key: "0", label: "0", max: 0 },
  { key: "1", label: "1", max: 1 },
  { key: "2", label: "2", max: 2 },
  { key: "2_plus", label: "2+", max: Infinity },
];

// Death-overs binary for bowler wickets. Same rationale as the runs
// variant: a death-only spell rarely produces 2+ scalps, so binary
// "wicketless or strike" reads honestly.
const BOWLER_WICKETS_BANDS_DEATH = [
  { key: "death_wkts_0",      label: "Wicketless", max: 0 },
  { key: "death_wkts_1_plus", label: "1+ wicket",  max: Infinity },
];

// Resolver-side band lookup — mirrors batsmanBandsForPred. Without this,
// a death-overs prediction would resolve against the standard BOWLER_BANDS
// (or BOWLER_WICKETS_BANDS) and mis-bucket the answer entirely.
function bowlerBandsForPred(pred: { options: { key: string }[] }): BowlerBand[] {
  const keys = new Set(pred.options.map((o) => o.key));
  for (const set of [BOWLER_BANDS, BOWLER_BANDS_DEATH]) {
    if (set.every((b) => keys.has(b.key))) return set;
  }
  return BOWLER_BANDS;
}

function bowlerWicketsBandsForPred(pred: { options: { key: string }[] }) {
  const keys = new Set(pred.options.map((o) => o.key));
  for (const set of [BOWLER_WICKETS_BANDS, BOWLER_WICKETS_BANDS_DEATH]) {
    if (set.every((b) => keys.has(b.key))) return set;
  }
  return BOWLER_WICKETS_BANDS;
}

// Pick the bowler band-set based on currentOver. A bowler whose first ball
// is at over 16 or later gets the binary death set (either runs or wickets,
// caller decides which variant). Bowlers introduced earlier get the
// standard wide bands.
function pickBowlerBands(currentOver: number, totalOvers: number, isWicketsVariant: boolean) {
  const deathStart = Math.max(2, (totalOvers || 20) - 4);
  if (currentOver >= deathStart) {
    return isWicketsVariant ? BOWLER_WICKETS_BANDS_DEATH : BOWLER_BANDS_DEATH;
  }
  return isWicketsVariant ? BOWLER_WICKETS_BANDS : BOWLER_BANDS;
}

// Batsman-sixes bands — used for the first-six bonus question.
const BATSMAN_SIXES_BANDS = [
  { key: "1_2", label: "1-2", max: 2 },
  { key: "2_4", label: "2-4", max: 4 },
  { key: "4_plus", label: "4+", max: Infinity },
];

// Tighter sixes bands for a batsman who arrived late — "4+" is unrealistic
// when only a handful of balls remain.
const BATSMAN_SIXES_BANDS_LATE = [
  { key: "1", label: "1", max: 1 },
  { key: "2", label: "2", max: 2 },
  { key: "3_plus", label: "3+", max: Infinity },
];

function pickBatsmanSixesBands(remainingBalls: number): typeof BATSMAN_SIXES_BANDS {
  if (remainingBalls >= 30) return BATSMAN_SIXES_BANDS;
  return BATSMAN_SIXES_BANDS_LATE;
}

function batsmanSixesBandsForPred(pred: { options: { key: string }[] }): typeof BATSMAN_SIXES_BANDS {
  const keys = new Set(pred.options.map((o) => o.key));
  for (const set of [BATSMAN_SIXES_BANDS, BATSMAN_SIXES_BANDS_LATE]) {
    if (set.every((b) => keys.has(b.key))) return set;
  }
  return BATSMAN_SIXES_BANDS;
}

const BATSMAN_SIXES_PHRASINGS: Array<(name: string) => string> = [
  (n) => `${n} just went big. How many sixes tonight?`,
  (n) => `Six launched. What's ${n}'s final six count?`,
  (n) => `${n} found the rope. Total sixes by stumps?`,
  (n) => `${n}'s six count — read him.`,
];

// Lock bowler question after this many legal balls are in their spell.
const LOCK_BOWLER_AFTER_BALLS = 3;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function bucket(totalRuns: number, bands: BatsmanBand[]): string {
  for (const b of bands) if (totalRuns <= b.max) return b.key;
  return bands[bands.length - 1].key;
}

// Sum runs attributable to a batsman on a ball (runs from the bat only —
// byes, leg-byes, wides, noballs all go to extras, not the striker).
function batsmanRunsOnBall(b: Ball): number {
  const s = b.score;
  const extras = (s.bye || 0) + (s.leg_bye || 0) + (s.noball_runs || 0);
  // Sportsmonk's `runs` already includes extras in the total. Strip them.
  return Math.max(0, (s.runs || 0) - extras);
}

// Total runs conceded by the bowler on a ball: legal runs + wides + no-balls.
// Byes and leg-byes are NOT charged to the bowler in cricket.
function bowlerRunsOnBall(b: Ball): number {
  const s = b.score;
  const batted = batsmanRunsOnBall(b);
  const noball = s.noball || 0;
  // Wides aren't explicitly typed in BallData but often come through in extras
  // via leg_bye==0 bye==0 noball==0 and score.ball===false — we approximate
  // wides as (runs - batted - noball - byes) when ball is illegal. Good
  // enough for band bucketing.
  let wideEstimate = 0;
  if (!s.ball && noball === 0) {
    wideEstimate = Math.max(0, (s.runs || 0) - batted - noball - (s.bye || 0) - (s.leg_bye || 0));
  }
  return batted + noball + wideEstimate;
}

function isRetired(ball: Ball): boolean {
  const name = (ball.score?.name || "").toLowerCase();
  return name.includes("retired");
}

function extractInnings(scoreboard: string): number {
  if (scoreboard === "S1") return 1;
  if (scoreboard === "S2") return 2;
  return 0; // super over / unknown
}

/**
 * Pure resolver for a single live-player prediction. Returns the bucketed
 * correctOption it WOULD stamp, or null when the prediction can't be resolved
 * from the supplied balls (wrong category, wrong subjectType, no innings/
 * playerId metadata, no balls for that player).
 *
 * Stays mutation-free so callers can probe answers without touching DB rows.
 * Used by the at-match-end fallback in sportsmonkApi (catches questions the
 * live poll missed) and by reResolveMatch's delta evaluator.
 */
export function computeLivePlayerCorrectOption(
  pred: Prediction,
  allBalls: any[]
): string | null {
  if (pred.category !== "per_over") return null;
  const subj = (pred as any).subjectType as string | undefined;
  if (!subj) return null;
  const playerId = (pred as any).playerId as number | undefined;
  const inningsNumber = (pred as any).inningsNumber as number | undefined;
  if (!playerId || !inningsNumber) return null;

  const inningsScoreboard = inningsNumber === 1 ? "S1" : inningsNumber === 2 ? "S2" : null;
  if (!inningsScoreboard) return null;

  const inningsBalls = allBalls.filter((b: any) => b.scoreboard === inningsScoreboard) as Ball[];
  if (inningsBalls.length === 0) return null;

  if (subj === "batsman_innings") {
    const ballsForBatter = inningsBalls.filter((b) => b.batsman_id === playerId);
    if (ballsForBatter.length === 0) return null;
    const runs = ballsForBatter.reduce((s, b) => s + batsmanRunsOnBall(b), 0);
    return bucket(runs, batsmanBandsForPred(pred));
  }

  if (subj === "batsman_sixes") {
    const ballsForBatter = inningsBalls.filter((b) => b.batsman_id === playerId);
    if (ballsForBatter.length === 0) return null;
    const sixes = ballsForBatter.filter((b) => !!b.score?.six).length;
    return bucket(sixes, batsmanSixesBandsForPred(pred));
  }

  if (subj === "bowler_innings") {
    const ballsForBowler = inningsBalls.filter((b) => b.bowler_id === playerId);
    if (ballsForBowler.length === 0) return null;
    const runs = ballsForBowler.reduce((s, b) => s + bowlerRunsOnBall(b), 0);
    // Use bowlerBandsForPred so DEATH-variant predictions resolve against
    // their binary set instead of the standard 4-band one.
    return bucket(runs, bowlerBandsForPred(pred));
  }

  if (subj === "bowler_innings_wkts") {
    const ballsForBowler = inningsBalls.filter((b) => b.bowler_id === playerId);
    if (ballsForBowler.length === 0) return null;
    const wickets = ballsForBowler.filter((b) => {
      if (!b.score?.is_wicket) return false;
      const name = (b.score?.name || "").toLowerCase();
      if (name.includes("run out")) return false;
      return true;
    }).length;
    return bucket(wickets, bowlerWicketsBandsForPred(pred));
  }

  return null;
}

export interface LivePlayerProcessResult {
  generated: number;
  locked: number;
  resolved: number;
  voided: number;
}

/**
 * Process one match tick. The caller (pollSportsmonkUpdates) already has a
 * Match row and a fixture object. We lazily pull balls only when needed —
 * i.e., when status is live or we're checking a possibly-no-result status.
 */
export async function processLivePlayers(
  match: Match,
  fixture: { status?: string | null; balls?: { data?: Ball[] } | Ball[] } | null,
  io: SocketIOServer
): Promise<LivePlayerProcessResult> {
  const result: LivePlayerProcessResult = { generated: 0, locked: 0, resolved: 0, voided: 0 };

  if (!fixture) return result;
  const fixtureStatus = String(fixture.status || "");

  // --- Terminal no-result: void every unresolved live player question. ---
  if (NO_RESULT_STATUSES.has(fixtureStatus)) {
    const voidable = await Prediction.findAll({
      where: {
        matchId: match.id,
        subjectType: { [Op.in]: ["batsman_innings", "bowler_innings"] },
        status: { [Op.in]: ["open", "locked"] },
      },
    });
    for (const p of voidable) {
      await voidPrediction(p, `match_${fixtureStatus.toLowerCase().replace(/\s/g, "_")}`, io);
      result.voided += 1;
    }
    return result;
  }

  // Super over or no ball data yet → nothing to do.
  const balls: Ball[] = Array.isArray((fixture as any).balls)
    ? ((fixture as any).balls as Ball[])
    : ((fixture as any).balls?.data as Ball[]) || [];

  if (balls.length === 0) return result;

  // Group balls by innings. We only generate/resolve for innings 1 and 2 —
  // super over (scoreboard outside S1/S2) is skipped per product decision.
  const inningsBalls = new Map<number, Ball[]>();
  for (const b of balls) {
    const inn = extractInnings(b.scoreboard);
    if (inn === 1 || inn === 2) {
      const arr = inningsBalls.get(inn) || [];
      arr.push(b);
      inningsBalls.set(inn, arr);
    }
  }

  // Pull all existing live-player predictions for this match once. Cheaper
  // than per-player findOne in a loop, and lets us cross-reference.
  const existing = await Prediction.findAll({
    where: {
      matchId: match.id,
      subjectType: {
        [Op.in]: ["batsman_innings", "bowler_innings", "bowler_innings_wkts", "batsman_sixes"],
      },
    },
  });
  const existingMap = new Map<string, Prediction>();
  for (const p of existing) {
    if (p.playerId != null && p.inningsNumber != null && p.subjectType) {
      existingMap.set(`${p.subjectType}:${p.playerId}:${p.inningsNumber}`, p);
    }
  }

  for (const [innings, ballsThisInnings] of inningsBalls) {
    const seenBatsmen = new Set<number>();
    const seenBowlers = new Set<number>();
    const battedBalls = new Map<number, Ball[]>();   // batsman_id -> balls where they were striker
    const bowledBalls = new Map<number, Ball[]>();   // bowler_id -> balls delivered
    const batsmanNameById = new Map<number, string>();

    for (const b of ballsThisInnings) {
      if (b.batsman_id) {
        seenBatsmen.add(b.batsman_id);
        const arr = battedBalls.get(b.batsman_id) || [];
        arr.push(b);
        battedBalls.set(b.batsman_id, arr);
        const nm = b.batsman?.fullname;
        if (nm && !batsmanNameById.has(b.batsman_id)) batsmanNameById.set(b.batsman_id, nm);
      }
      if (b.bowler_id) {
        seenBowlers.add(b.bowler_id);
        const arr = bowledBalls.get(b.bowler_id) || [];
        arr.push(b);
        bowledBalls.set(b.bowler_id, arr);
      }
    }

    // Diagnostic: log per-innings ball counts + unique striker IDs so we can
    // tell at a glance whether the upstream API is returning middle-order balls.
    // Matches the "only openers get questions" complaint — if this log shows
    // only 2 IDs after many overs, the upstream balls feed is the culprit.
    if (seenBatsmen.size > 0) {
      const idNames = Array.from(seenBatsmen).map((id) => `${id}(${batsmanNameById.get(id) || "?"})`).join(",");
      console.log(
        `[livePlayerTracker] match=${match.id} innings=${innings} balls=${ballsThisInnings.length} strikers=[${idNames}]`
      );
    }

    // --- Generation pass ---
    // Cap on how many runs anyone could plausibly score from here (assume
    // they face every remaining ball — overstates reality but avoids
    // accidentally being too tight). Used to pick which bands the question
    // ships with, so a late-arriving batsman never sees "60+" as an option.
    const totalOversForInnings = match.totalOvers || 20;
    const remBalls = remainingBallsInInnings(ballsThisInnings, totalOversForInnings);
    const remainingMaxRuns = remBalls * 6;
    // Current over = highest ball.<over> we've seen + 1 (Sportsmonk uses
    // 0-indexed ball.over). For a fresh batsman walking in mid-over, the
    // current-over signal is what tells us "you're in the death" so we use
    // the binary band-set instead of the wide standard one.
    let maxBallSeen = 0;
    for (const b of ballsThisInnings) {
      const n = parseFloat(String((b as any).ball || "0"));
      if (Number.isFinite(n) && n > maxBallSeen) maxBallSeen = n;
    }
    const currentOver = Math.min(Math.floor(maxBallSeen) + 1, totalOversForInnings);
    const bandsForNewBatsman = pickBatsmanBands(currentOver, totalOversForInnings, remainingMaxRuns);

    for (const batsmanId of seenBatsmen) {
      const key = `batsman_innings:${batsmanId}:${innings}`;
      if (existingMap.has(key)) continue;

      const ballsForBatsman = battedBalls.get(batsmanId) || [];
      const fullname = ballsForBatsman.find((b) => b.batsman?.fullname)?.batsman?.fullname
        || `Player #${batsmanId}`;

      try {
        const [pred, created] = await Prediction.findOrCreate({
          where: {
            matchId: match.id,
            subjectType: "batsman_innings",
            playerId: batsmanId,
            inningsNumber: innings,
          },
          defaults: {
            matchId: match.id,
            category: "per_over",
            round: innings === 1 ? 1 : 4,
            // Phrasing follows the band variant — DEATH bands get the
            // binary "under 15 / 15+" wording so the question reads
            // honestly to the user (and matches the prompt the option set
            // implies). Standard bands keep the wide-tone phrasings.
            question: pickRandom(
              bandsForNewBatsman === BATSMAN_BANDS_DEATH ? BATSMAN_PHRASINGS_DEATH : BATSMAN_PHRASINGS
            )(fullname),
            options: bandsForNewBatsman.map((band) => ({
              key: band.key,
              label: band.label,
              points: 50,
            })),
            status: "open",
            subjectType: "batsman_innings",
            playerId: batsmanId,
            inningsNumber: innings,
          },
        });
        existingMap.set(key, pred);
        if (created) {
          result.generated += 1;
          console.log(`[livePlayerTracker] new batsman ${batsmanId} (${fullname}) innings ${innings}`);
          io.to(`match:${match.id}`).emit("newPrediction", {
            matchId: match.id,
            predictionId: pred.id,
            subjectType: "batsman_innings",
          });
        }
      } catch (err) {
        // Unique-constraint race with a parallel poller — safe to ignore.
        console.warn(`[livePlayerTracker] batsman ${batsmanId} generation race`, err);
      }
    }

    // --- First-six bonus generation: for each batsman who has hit a six,
    // create a `batsman_sixes` question asking for their total sixes tonight.
    for (const [batsmanId, ballsForBatsman] of battedBalls) {
      const hasHitSix = ballsForBatsman.some(
        (b) => b.score?.six === true && b.batsman_id === batsmanId
      );
      if (!hasHitSix) continue;

      const sixesKey = `batsman_sixes:${batsmanId}:${innings}`;
      if (existingMap.has(sixesKey)) continue;

      const fullname = ballsForBatsman.find((b) => b.batsman?.fullname)?.batsman?.fullname
        || `Player #${batsmanId}`;

      try {
        const [pred, created] = await Prediction.findOrCreate({
          where: {
            matchId: match.id,
            subjectType: "batsman_sixes",
            playerId: batsmanId,
            inningsNumber: innings,
          },
          defaults: {
            matchId: match.id,
            category: "per_over",
            round: innings === 1 ? 1 : 4,
            question: pickRandom(BATSMAN_SIXES_PHRASINGS)(fullname),
            options: pickBatsmanSixesBands(remBalls).map((band) => ({
              key: band.key,
              label: band.label,
              points: 50,
            })),
            status: "open",
            subjectType: "batsman_sixes",
            playerId: batsmanId,
            inningsNumber: innings,
          },
        });
        existingMap.set(sixesKey, pred);
        if (created) {
          result.generated += 1;
          console.log(
            `[livePlayerTracker] first six by ${batsmanId} (${fullname}) innings ${innings} — sixes bonus opened`
          );
          io.to(`match:${match.id}`).emit("newPrediction", {
            matchId: match.id,
            predictionId: pred.id,
            subjectType: "batsman_sixes",
          });
        }
      } catch (err) {
        console.warn(`[livePlayerTracker] batsman_sixes ${batsmanId} generation race`, err);
      }
    }

    for (const bowlerId of seenBowlers) {
      const runsKey = `bowler_innings:${bowlerId}:${innings}`;
      const wktsKey = `bowler_innings_wkts:${bowlerId}:${innings}`;
      // Only generate if NEITHER variant exists yet for this bowler in this innings.
      if (existingMap.has(runsKey) || existingMap.has(wktsKey)) continue;

      const ballsForBowler = bowledBalls.get(bowlerId) || [];
      const fullname = ballsForBowler.find((b) => b.bowler?.fullname)?.bowler?.fullname
        || `Player #${bowlerId}`;

      // Flip a coin — roughly half the bowlers get a runs question, the rest
      // a wickets question. Hashing bowlerId makes the choice deterministic
      // per bowler (so a restart doesn't swap the question mid-innings).
      const isWicketsVariant = (bowlerId + innings) % 2 === 0;
      const subject = isWicketsVariant ? "bowler_innings_wkts" : "bowler_innings";
      // Bands + phrasings are death-aware: a bowler whose first ball lands
      // at over 16+ ships with the binary "wicketless / 1+" or "<12 / 12+"
      // set, paired with the matching DEATH phrasings so the question text
      // matches the option semantics.
      const bands = pickBowlerBands(currentOver, totalOversForInnings, isWicketsVariant);
      const isDeathBands = bands === BOWLER_BANDS_DEATH || bands === BOWLER_WICKETS_BANDS_DEATH;
      const phrasings = isDeathBands
        ? (isWicketsVariant ? BOWLER_WICKETS_PHRASINGS_DEATH : BOWLER_PHRASINGS_DEATH)
        : (isWicketsVariant ? BOWLER_WICKETS_PHRASINGS : BOWLER_PHRASINGS);

      try {
        const [pred, created] = await Prediction.findOrCreate({
          where: {
            matchId: match.id,
            subjectType: subject,
            playerId: bowlerId,
            inningsNumber: innings,
          },
          defaults: {
            matchId: match.id,
            category: "per_over",
            round: innings === 1 ? 1 : 4,
            question: pickRandom(phrasings)(fullname),
            options: bands.map((band) => ({
              key: band.key,
              label: band.label,
              points: 50,
            })),
            status: "open",
            subjectType: subject,
            playerId: bowlerId,
            inningsNumber: innings,
          },
        });
        existingMap.set(isWicketsVariant ? wktsKey : runsKey, pred);
        if (created) {
          result.generated += 1;
          console.log(`[livePlayerTracker] new bowler ${bowlerId} (${fullname}) innings ${innings} — variant ${subject}`);
          io.to(`match:${match.id}`).emit("newPrediction", {
            matchId: match.id,
            predictionId: pred.id,
            subjectType: subject,
          });
        }
      } catch (err) {
        console.warn(`[livePlayerTracker] bowler ${bowlerId} generation race`, err);
      }
    }

    // --- Batsman lock pass: 30 seconds from question creation ---
    // Previous rule "lock on first legal ball faced" collapsed with the 5-second
    // poll cadence: create + lock happened in the same tick, so the frontend
    // (which filters `status === "open"`) never saw the card. Time-based lock
    // gives users a predictable 30-second window to pick.
    for (const [batsmanId] of battedBalls) {
      const key = `batsman_innings:${batsmanId}:${innings}`;
      const pred = existingMap.get(key);
      if (!pred || pred.status !== "open") continue;

      const createdMs = new Date(pred.createdAt).getTime();
      if (Date.now() - createdMs >= LOCK_BATSMAN_AFTER_MS) {
        await pred.update({ status: "locked" });
        result.locked += 1;
      }
    }

    // --- Batsman resolve pass: dismissed, retired, or innings ended ---
    const inningsEnded = isInningsEnded(fixture, innings, ballsThisInnings);
    for (const [batsmanId, ballsForBatsman] of battedBalls) {
      const key = `batsman_innings:${batsmanId}:${innings}`;
      const pred = existingMap.get(key);
      if (!pred || pred.status === "resolved" || pred.status === "voided") continue;

      const dismissalBall = ballsThisInnings.find(
        (b) =>
          b.score?.is_wicket === true &&
          b.batsmanout_id === batsmanId
      );
      const retiredBall = ballsForBatsman.find((b) => isRetired(b));

      const shouldResolve = !!dismissalBall || !!retiredBall || inningsEnded;
      if (!shouldResolve) continue;

      const runs = ballsForBatsman.reduce((sum, b) => sum + batsmanRunsOnBall(b), 0);
      // Use whichever band-set this prediction was actually shipped with,
      // not the global default — late-arriving batsmen get tighter bands.
      const correctOption = bucket(runs, batsmanBandsForPred(pred));

      // If the question is still "open" because we somehow skipped the lock
      // (e.g. run out without facing a legal ball), flip to locked first so
      // the resolver's state expectation is satisfied.
      if (pred.status === "open") {
        await pred.update({ status: "locked" });
      }
      await resolvePrediction(pred, correctOption, io, { actualBatsmanRuns: runs });
      console.log(
        `[livePlayerTracker] batsman ${batsmanId} resolved innings ${innings}: ${runs} runs → ${correctOption}`
      );
      result.resolved += 1;
    }

    // --- Batsman-sixes (first-six bonus) lock + resolve pass ---
    for (const [batsmanId, ballsForBatsman] of battedBalls) {
      const sixesKey = `batsman_sixes:${batsmanId}:${innings}`;
      const pred = existingMap.get(sixesKey);
      if (!pred || pred.status === "resolved" || pred.status === "voided") continue;

      // Same 30 s time-based lock as batsman_innings.
      if (pred.status === "open") {
        const createdMs = new Date(pred.createdAt).getTime();
        if (Date.now() - createdMs >= LOCK_BATSMAN_AFTER_MS) {
          await pred.update({ status: "locked" });
          result.locked += 1;
        }
      }

      // Resolve on dismissal / retired / innings end — same triggers as batsman_innings.
      const dismissalBall = ballsThisInnings.find(
        (b) => b.score?.is_wicket === true && b.batsmanout_id === batsmanId
      );
      const retiredBall = ballsForBatsman.find((b) => isRetired(b));
      const shouldResolve = !!dismissalBall || !!retiredBall || inningsEnded;
      if (!shouldResolve) continue;

      const sixes = ballsForBatsman.filter(
        (b) => b.score?.six === true && b.batsman_id === batsmanId
      ).length;
      // Match the band-set the question was created with — late-arrivals
      // ship the tighter LATE bands, openers ship the FULL bands.
      const correctOption = bucket(sixes, batsmanSixesBandsForPred(pred));

      if (pred.status === "open") {
        await pred.update({ status: "locked" });
      }
      await resolvePrediction(pred, correctOption, io, {});
      console.log(
        `[livePlayerTracker] batsman ${batsmanId} sixes resolved innings ${innings}: ${sixes} sixes → ${correctOption}`
      );
      result.resolved += 1;
    }

    // --- Bowler lock pass: lock after the bowler delivers 3 legal balls ---
    // Product rule: we want users to decide before the bowler's spell has
    // shown too much. Runs (or wickets) from the remaining balls still count
    // toward resolution; only submissions are locked.
    for (const [bowlerId, ballsForBowler] of bowledBalls) {
      const runsKey = `bowler_innings:${bowlerId}:${innings}`;
      const wktsKey = `bowler_innings_wkts:${bowlerId}:${innings}`;
      const pred = existingMap.get(runsKey) || existingMap.get(wktsKey);
      if (!pred || pred.status !== "open") continue;

      const legalBallsBowled = ballsForBowler.filter((b) => b.score?.ball === true).length;
      if (legalBallsBowled >= LOCK_BOWLER_AFTER_BALLS) {
        await pred.update({ status: "locked" });
        result.locked += 1;
      }
    }

    // --- Bowler resolve pass: only on innings end ---
    if (inningsEnded) {
      for (const [bowlerId, ballsForBowler] of bowledBalls) {
        const runsKey = `bowler_innings:${bowlerId}:${innings}`;
        const wktsKey = `bowler_innings_wkts:${bowlerId}:${innings}`;
        const pred = existingMap.get(runsKey) || existingMap.get(wktsKey);
        if (!pred || pred.status === "resolved" || pred.status === "voided") continue;

        let correctOption: string;
        let context: Record<string, number>;

        if (pred.subjectType === "bowler_innings_wkts") {
          // Count wickets attributable to this bowler (exclude run-outs — batsmanout_id
          // differs from striker on a run-out; we count when is_wicket && bowler_id matches
          // AND the dismissal isn't a run-out by name).
          const wickets = ballsForBowler.filter((b) => {
            if (!b.score?.is_wicket) return false;
            const name = (b.score?.name || "").toLowerCase();
            if (name.includes("run out")) return false;
            return true;
          }).length;
          // Bucket against the band-set this prediction was actually
          // shipped with (DEATH variant if the bowler was introduced at
          // over 16+) — was previously hardcoded to BOWLER_WICKETS_BANDS
          // which mis-resolved every DEATH-band card.
          correctOption = bucket(wickets, bowlerWicketsBandsForPred(pred));
          context = { actualBowlerWickets: wickets };
          console.log(
            `[livePlayerTracker] bowler ${bowlerId} (wkts) resolved innings ${innings}: ${wickets} wickets → ${correctOption}`
          );
        } else {
          const runs = ballsForBowler.reduce((sum, b) => sum + bowlerRunsOnBall(b), 0);
          correctOption = bucket(runs, bowlerBandsForPred(pred));
          context = { actualBowlerRuns: runs };
          console.log(
            `[livePlayerTracker] bowler ${bowlerId} (runs) resolved innings ${innings}: ${runs} conceded → ${correctOption}`
          );
        }

        if (pred.status === "open") {
          await pred.update({ status: "locked" });
        }
        await resolvePrediction(pred, correctOption, io, context);
        result.resolved += 1;
      }
    }
  }

  // Mid-over N+2 generation was removed per product decision — showing over-3
  // cards while over 1 is still live was too noisy. Only N+1 (end-of-over
  // generation via /advance-over in admin.ts) remains.

  return result;
}

/**
 * Poll wrapper — iterates every match in live/upcoming, fetches balls data,
 * and runs processLivePlayers. Called once per 5 s tick from index.ts.
 *
 * Guarded by an is-polling flag so slow Sportsmonk responses don't stack.
 */
let livePollInFlight = false;

export async function pollLivePlayers(io: SocketIOServer): Promise<void> {
  if (livePollInFlight) return;
  livePollInFlight = true;
  try {
    // Only iterate LIVE matches. processLivePlayers below filters balls
    // by scoreboard S1/S2, and upcoming matches have no balls — the
    // fetch + processing was a no-op anyway. Dropping upcoming saves
    // an /fixtures/{id} call per upcoming match per tick, which matters
    // for staying under Sportsmonk's 2,000-calls/hr-per-endpoint cap.
    // The moment pollSportsmonkUpdates flips a match to status="live",
    // the next pollLivePlayers tick (≤5s later) picks it up.
    const matches = await Match.findAll({ where: { status: "live" } });
    if (!matches.length) return;

    // Dynamic import — sportsmonkApi re-exports the fetch path we need.
    const { fetchLiveFixtureForTracker } = await import("./sportsmonkApi");
    const load: LoadFixtureFn = fetchLiveFixtureForTracker;

    for (const match of matches) {
      if (!match.externalId) continue;
      const fixtureId = parseInt(match.externalId);
      if (Number.isNaN(fixtureId)) continue;

      try {
        const fixture = await load(fixtureId, true);
        if (!fixture) continue;
        await processLivePlayers(match, fixture, io);
      } catch (err) {
        console.error(`[livePlayerTracker] poll error for match ${match.id}:`, err);
      }
    }
  } finally {
    livePollInFlight = false;
  }
}

/**
 * Conservative innings-end detector. Returns true when we have strong signals
 * that this innings' batting is done:
 *   - fixture.status === "Finished" (whole match done)
 *   - next-innings balls exist (S2 present while we're checking S1)
 *   - all-out: 10 unique dismissals in innings
 *   - overs exhausted: ball field floor equals match totalOvers for the last legal ball
 */
function isInningsEnded(
  fixture: { status?: string | null } | null,
  innings: number,
  ballsThisInnings: Ball[]
): boolean {
  if (!fixture || !ballsThisInnings.length) return false;
  if (String(fixture.status) === "Finished") return true;

  // 2nd innings started → 1st is over.
  if (innings === 1) {
    const hasS2 = (fixture as any).balls?.data?.some?.((b: Ball) => b.scoreboard === "S2")
      || (Array.isArray((fixture as any).balls) && (fixture as any).balls.some((b: Ball) => b.scoreboard === "S2"));
    if (hasS2) return true;
  }

  const dismissals = new Set<number>();
  for (const b of ballsThisInnings) {
    if (b.score?.is_wicket && b.batsmanout_id) dismissals.add(b.batsmanout_id);
  }
  if (dismissals.size >= 10) return true;

  return false;
}
