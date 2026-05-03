// Owner-portal simulation match runner.
//
// Owns a single in-process Match (externalId = "sim:demo-1") and progresses
// it through a hand-curated 40-over T20 script over ~3 hours of wall clock
// (one ball every ~50 s, six balls per over → 5 min/over). After the match
// completes, sleeps 10 min then resets and replays the same script.
//
// Scope intentionally minimal for v1:
//   - Match exists in DB so all the regular flows (lobby for owner, room
//     join, /match/[id] page) "just work" against it.
//   - Punter card is generated immediately on start (admin's main testing
//     target alongside Kong). Existing ensurePunterCard handles squads.
//   - score/wickets/overs progress over time so the match feels alive.
//   - Per-over question generation + auto-resolution is NOT mirrored here
//     to avoid duplicating the live-poll's complex resolver. Admin uses
//     Kong Questions + manual /predictions/:id/resolve for in-match testing.
//
// Hidden from regular users: routes/match.ts lobby query filters externalId
// LIKE "sim:%". The owner's /owner/matches endpoint includes them.

import { Op } from "sequelize";
import { Server as SocketIOServer } from "socket.io";
import { Match, Prediction, MatchParticipant, UserPrediction } from "../models";
import { ensurePunterCard, resolvePunterCard } from "./punterCard";
import {
  SIM_TEAM_1,
  SIM_TEAM_2,
  SIM_OVERS,
  SIM_TOTAL_BALLS,
  type SimBall,
  type SimOver,
} from "../data/simulationScript";

const SIM_EXTERNAL_ID = "sim:demo-1";
const SIM_BALL_INTERVAL_MS = Number(process.env.SIM_BALL_INTERVAL_MS) || 50_000;
const SIM_RESTART_DELAY_MS = Number(process.env.SIM_RESTART_DELAY_MS) || 10 * 60 * 1000;

type SimStatus = "idle" | "running" | "cooldown";

interface SimState {
  status: SimStatus;
  matchId: string | null;
  currentBallIndex: number;
  totalBalls: number;
  currentOver: number;
  currentInnings: number;
  innings1Score: { runs: number; wickets: number; overs: number };
  innings2Score: { runs: number; wickets: number; overs: number };
  cooldownEndsAt: number | null;
}

let tickHandle: NodeJS.Timeout | null = null;
let restartHandle: NodeJS.Timeout | null = null;
let currentBallIndex = 0;
let status: SimStatus = "idle";
let matchId: string | null = null;
let cooldownEndsAt: number | null = null;
const accumulatedBalls: SimBall[] = [];

// Find-or-create the singleton sim match. Always normalises team data so a
// stale row from a previous deploy doesn't break the runner.
async function ensureSimMatch(): Promise<Match> {
  let match = await Match.findOne({ where: { externalId: SIM_EXTERNAL_ID } });
  if (!match) {
    match = await Match.create({
      externalId: SIM_EXTERNAL_ID,
      team1: SIM_TEAM_1.full,
      team2: SIM_TEAM_2.full,
      team1Short: SIM_TEAM_1.short,
      team2Short: SIM_TEAM_2.short,
      team1Players: SIM_TEAM_1.players,
      team2Players: SIM_TEAM_2.players,
      // Sim "starts" right now so per-over questions, punter card, etc.
      // calculate timestamps relative to launch.
      startTime: new Date(),
      status: "upcoming",
      currentInnings: 1,
      currentOver: 0,
      totalOvers: 20,
      scoreData: {},
    });
  } else {
    // Refresh team rosters in case the script changed since the row was
    // created — keeps punter-card pickers in sync with the new players.
    await match.update({
      team1: SIM_TEAM_1.full,
      team2: SIM_TEAM_2.full,
      team1Short: SIM_TEAM_1.short,
      team2Short: SIM_TEAM_2.short,
      team1Players: SIM_TEAM_1.players,
      team2Players: SIM_TEAM_2.players,
    });
  }
  return match;
}

function snapshotState(): SimState {
  const innings1Overs = SIM_OVERS.filter((o) => o.scoreboard === "S1");
  const innings2Overs = SIM_OVERS.filter((o) => o.scoreboard === "S2");
  return {
    status,
    matchId,
    currentBallIndex,
    totalBalls: SIM_TOTAL_BALLS,
    currentOver: deriveCurrentOver(),
    currentInnings: deriveCurrentInnings(),
    innings1Score: tallyUpTo(innings1Overs, currentBallIndex, "S1"),
    innings2Score: tallyUpTo(innings2Overs, currentBallIndex, "S2"),
    cooldownEndsAt,
  };
}

// Walk balls 0..currentBallIndex and tally per-scoreboard runs/wickets/overs.
function tallyUpTo(
  overs: SimOver[],
  ballIndex: number,
  scoreboard: "S1" | "S2",
): { runs: number; wickets: number; overs: number } {
  let runs = 0;
  let wickets = 0;
  let oversCompleted = 0;
  let ballsInCurrentOver = 0;
  let consumed = 0;
  for (const over of overs) {
    for (const b of over.balls) {
      // Position of THIS ball in the global stream; bail once we've passed
      // the consumed pointer.
      const globalPos = globalIndexOf(over.scoreboard, over.overNumber, b);
      if (globalPos >= ballIndex) {
        const o = oversCompleted + ballsInCurrentOver / 10;
        return { runs, wickets, overs: round1(o) };
      }
      if (b.scoreboard === scoreboard) {
        runs += b.runs;
        if (b.isWicket) wickets += 1;
        ballsInCurrentOver += 1;
        if (ballsInCurrentOver === 6) {
          oversCompleted += 1;
          ballsInCurrentOver = 0;
        }
      }
      consumed += 1;
    }
  }
  void consumed;
  const o = oversCompleted + ballsInCurrentOver / 10;
  return { runs, wickets, overs: round1(o) };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

// Global flat-stream position of a given ball — matches the order in
// SIM_BALLS / accumulatedBalls. Used by tallyUpTo to know when to stop.
function globalIndexOf(sb: "S1" | "S2", overNo: number, b: SimBall): number {
  let idx = 0;
  for (const over of SIM_OVERS) {
    for (const ball of over.balls) {
      if (over.scoreboard === sb && over.overNumber === overNo && ball === b) return idx;
      idx += 1;
    }
  }
  return idx;
}

function deriveCurrentInnings(): number {
  const innings1Balls = SIM_OVERS.filter((o) => o.scoreboard === "S1")
    .reduce((s, o) => s + o.balls.length, 0);
  return currentBallIndex < innings1Balls ? 1 : 2;
}

function deriveCurrentOver(): number {
  const inn = deriveCurrentInnings();
  const inningsOvers = SIM_OVERS.filter((o) => o.scoreboard === (inn === 1 ? "S1" : "S2"));
  const offset = inn === 1 ? 0 : SIM_OVERS.filter((o) => o.scoreboard === "S1").reduce((s, o) => s + o.balls.length, 0);
  let consumed = currentBallIndex - offset;
  if (consumed < 0) return 1;
  for (let i = 0; i < inningsOvers.length; i++) {
    consumed -= inningsOvers[i].balls.length;
    if (consumed < 0) return inningsOvers[i].overNumber;
  }
  return 20;
}

// Apply one ball: append to in-memory stream, recompute scoreData, persist.
async function tick(io: SocketIOServer): Promise<void> {
  if (status !== "running" || matchId == null) return;

  if (currentBallIndex >= SIM_TOTAL_BALLS) {
    await onScriptComplete(io);
    return;
  }

  const ball = (function nextBall() {
    let idx = 0;
    for (const over of SIM_OVERS) {
      for (const b of over.balls) {
        if (idx === currentBallIndex) return b;
        idx += 1;
      }
    }
    return null;
  })();

  if (!ball) {
    await onScriptComplete(io);
    return;
  }

  accumulatedBalls.push(ball);
  currentBallIndex += 1;

  const innings1Tally = tallyUpTo(
    SIM_OVERS.filter((o) => o.scoreboard === "S1"),
    currentBallIndex,
    "S1",
  );
  const innings2Tally = tallyUpTo(
    SIM_OVERS.filter((o) => o.scoreboard === "S2"),
    currentBallIndex,
    "S2",
  );

  const match = await Match.findByPk(matchId);
  if (!match) return;

  // First ball flips upcoming → live.
  if (match.status === "upcoming") {
    await match.update({ status: "live", currentInnings: 1, currentOver: 1 });
  }

  const inn = deriveCurrentInnings();
  const over = deriveCurrentOver();

  const newScoreData = {
    ...(match.scoreData || {}),
    innings1: { score: innings1Tally.runs, wickets: innings1Tally.wickets, overs: innings1Tally.overs, teamShort: SIM_TEAM_1.short },
    innings2: { score: innings2Tally.runs, wickets: innings2Tally.wickets, overs: innings2Tally.overs, teamShort: SIM_TEAM_2.short },
  };

  await match.update({
    currentInnings: inn,
    currentOver: over,
    scoreData: newScoreData,
  });

  // Cheap socket so any frontend already on the sim match reflects the
  // updated score without waiting for the 10 s polling fallback.
  io.to(`match:${matchId}`).emit("scoreUpdate", {
    matchId,
    scoreData: newScoreData,
    innings: inn,
    over,
  });
}

async function onScriptComplete(io: SocketIOServer): Promise<void> {
  if (matchId == null) return;
  const match = await Match.findByPk(matchId);
  if (!match) return;
  await match.update({ status: "completed", currentPhase: "completed" });

  // Best-effort punter card resolution against the synthetic ball stream.
  // The resolver is forgiving — anything unresolvable just stays unresolved
  // and the admin can fire it manually from the matches dashboard.
  try {
    await resolvePunterCard(matchId, undefined, accumulatedBalls.slice(), io);
  } catch (err) {
    console.warn("[Sim] punter card resolve failed:", err);
  }

  io.to(`match:${matchId}`).emit("matchCompleted", { matchId });

  // Cooldown then auto-reset.
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  status = "cooldown";
  cooldownEndsAt = Date.now() + SIM_RESTART_DELAY_MS;
  console.log(`[Sim] script complete — cooling down for ${SIM_RESTART_DELAY_MS / 1000}s`);
  restartHandle = setTimeout(async () => {
    restartHandle = null;
    cooldownEndsAt = null;
    try {
      await reset(io);
    } catch (err) {
      console.error("[Sim] auto-reset failed:", err);
    }
  }, SIM_RESTART_DELAY_MS);
}

// Public API ─────────────────────────────────────────────────────

export async function start(io: SocketIOServer): Promise<SimState> {
  if (status === "running") return snapshotState();

  // Cancel any pending cooldown timer — admin pressing Start during a
  // cooldown should jump straight to a fresh run.
  if (restartHandle) { clearTimeout(restartHandle); restartHandle = null; cooldownEndsAt = null; }

  const match = await ensureSimMatch();
  matchId = match.id;

  // Wipe prior progress for the same match so each start cycle is a clean
  // replay. (Unlike reset(), this preserves prior MatchParticipant rows so
  // returning admins keep their context — reset() is the destructive variant.)
  await match.update({
    status: "upcoming",
    currentInnings: 1,
    currentOver: 0,
    scoreData: {},
  });
  currentBallIndex = 0;
  accumulatedBalls.length = 0;

  // Generate the punter card up front so it's available the moment a user
  // (or admin) joins the sim match. ensurePunterCard is idempotent.
  try {
    await ensurePunterCard(match);
  } catch (err) {
    console.warn("[Sim] punter card generation failed:", err);
  }

  status = "running";
  tickHandle = setInterval(() => {
    tick(io).catch((err) => console.error("[Sim] tick error:", err));
  }, SIM_BALL_INTERVAL_MS);

  console.log(`[Sim] started — ${SIM_TOTAL_BALLS} balls @ ${SIM_BALL_INTERVAL_MS}ms each`);
  return snapshotState();
}

export function stop(): SimState {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  if (restartHandle) { clearTimeout(restartHandle); restartHandle = null; cooldownEndsAt = null; }
  status = "idle";
  return snapshotState();
}

// Hard reset: stop, wipe all sim-match predictions + participants + user
// answers, then start fresh. Use when the admin wants a truly clean slate
// (e.g. they fired Kong questions during a prior run and want them gone).
export async function reset(io: SocketIOServer): Promise<SimState> {
  stop();
  const match = await Match.findOne({ where: { externalId: SIM_EXTERNAL_ID } });
  if (match) {
    const matchPredIds = (await Prediction.findAll({
      where: { matchId: match.id },
      attributes: ["id"],
    })).map((p) => p.id);
    if (matchPredIds.length > 0) {
      await UserPrediction.destroy({ where: { predictionId: { [Op.in]: matchPredIds } } });
      await Prediction.destroy({ where: { id: { [Op.in]: matchPredIds } } });
    }
    await MatchParticipant.destroy({ where: { matchId: match.id } });
  }
  return start(io);
}

export async function getState(): Promise<SimState> {
  return snapshotState();
}
