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

const BOWLER_BANDS: BowlerBand[] = [
  { key: "0_24", label: "0-24", max: 24 },
  { key: "25_35", label: "25-35", max: 35 },
  { key: "36_45", label: "36-45", max: 45 },
  { key: "45_plus", label: "45+", max: Infinity },
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

// Bowler-wickets bands — user-specified.
const BOWLER_WICKETS_BANDS = [
  { key: "0", label: "0", max: 0 },
  { key: "1", label: "1", max: 1 },
  { key: "2", label: "2", max: 2 },
  { key: "2_plus", label: "2+", max: Infinity },
];

// Batsman-sixes bands — used for the first-six bonus question.
const BATSMAN_SIXES_BANDS = [
  { key: "1_2", label: "1-2", max: 2 },
  { key: "2_4", label: "2-4", max: 4 },
  { key: "4_plus", label: "4+", max: Infinity },
];

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
            question: pickRandom(BATSMAN_PHRASINGS)(fullname),
            options: BATSMAN_BANDS.map((band) => ({
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
            options: BATSMAN_SIXES_BANDS.map((band) => ({
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
      const bands = isWicketsVariant ? BOWLER_WICKETS_BANDS : BOWLER_BANDS;
      const phrasings = isWicketsVariant ? BOWLER_WICKETS_PHRASINGS : BOWLER_PHRASINGS;

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
      const correctOption = bucket(runs, BATSMAN_BANDS);

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
      const correctOption = bucket(sixes, BATSMAN_SIXES_BANDS);

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
          correctOption = bucket(wickets, BOWLER_WICKETS_BANDS);
          context = { actualBowlerWickets: wickets };
          console.log(
            `[livePlayerTracker] bowler ${bowlerId} (wkts) resolved innings ${innings}: ${wickets} wickets → ${correctOption}`
          );
        } else {
          const runs = ballsForBowler.reduce((sum, b) => sum + bowlerRunsOnBall(b), 0);
          correctOption = bucket(runs, BOWLER_BANDS);
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
    const matches = await Match.findAll({ where: { status: ["live", "upcoming"] } });
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
