import { Match, Prediction, MatchParticipant } from "../models";
import { generatePerOverPredictions, generateHotTake, generateRivalryCalls, getCurrentRound } from "./predictionEngine";
import {
  resolvePrediction,
  generateRoundRewards,
  recomputeParticipantScores,
} from "./pointsEngine";
import { Server as SocketIOServer } from "socket.io";

const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
// Read at call time, not module load time, so dotenv has loaded
const getApiToken = () => process.env.SPORTSMONK_API_KEY || "";

// ── Team cache ─────────────────────────────────────────────────────
interface CachedTeam {
  name: string;
  code: string;
  image_path: string | null;
}

const teamCache: Map<number, CachedTeam> = new Map();

export async function fetchTeamData(teamId: number): Promise<CachedTeam> {
  if (teamCache.has(teamId)) return teamCache.get(teamId)!;

  try {
    const url = `${API_BASE}/teams/${teamId}?api_token=${getApiToken()}`;
    const res = await fetch(url);
    const data: any = await res.json();
    const team: CachedTeam = {
      name: data.data?.name || `Team ${teamId}`,
      code: data.data?.code || `T${teamId}`,
      image_path: data.data?.image_path || null,
    };
    teamCache.set(teamId, team);
    return team;
  } catch (error) {
    console.error(`[Sportsmonk] Failed to fetch team ${teamId}:`, error);
    return { name: `Team ${teamId}`, code: `T${teamId}`, image_path: null };
  }
}

// Enrich fixtures with team data when includes fail
export async function enrichFixturesWithTeams(fixtures: any[]): Promise<void> {
  const missingTeamIds = new Set<number>();

  for (const f of fixtures) {
    if (!f.localteam?.data?.name && f.localteam_id) {
      missingTeamIds.add(f.localteam_id);
    }
    if (!f.visitorteam?.data?.name && f.visitorteam_id) {
      missingTeamIds.add(f.visitorteam_id);
    }
  }

  if (missingTeamIds.size === 0) return;

  console.log(`[Sportsmonk] Enriching ${missingTeamIds.size} missing teams: [${[...missingTeamIds].join(', ')}]`);

  const teamEntries = await Promise.all(
    [...missingTeamIds].map(async (id) => [id, await fetchTeamData(id)] as const)
  );
  const teamMap = new Map(teamEntries);

  for (const f of fixtures) {
    if (!f.localteam?.data?.name && f.localteam_id) {
      const team = teamMap.get(f.localteam_id);
      if (team) {
        f.localteam = { data: { name: team.name, code: team.code, image_path: team.image_path } };
      }
    }
    if (!f.visitorteam?.data?.name && f.visitorteam_id) {
      const team = teamMap.get(f.visitorteam_id);
      if (team) {
        f.visitorteam = { data: { name: team.name, code: team.code, image_path: team.image_path } };
      }
    }
  }
}

interface BallData {
  ball: number;
  scoreboard: string; // S1 = innings 1, S2 = innings 2
  batsman_id: number;
  bowler_id: number;
  batsmanout_id: number | null;
  score: {
    name: string;
    runs: number;
    four: boolean;
    six: boolean;
    bye: number;
    leg_bye: number;
    noball: number;
    noball_runs: number;
    is_wicket: boolean;
    ball: boolean; // true = legal delivery
    out: boolean;
  };
  batsman: { fullname: string };
  bowler: { fullname: string };
}

interface OverStats {
  runs: number;
  wickets: number;
  sixes: number;
  boundaries: number;
  dots: number;
  wides: number;
  noballs: number;
  lastBallRuns: number;
  lastBallWicket: boolean;
  firstBallBoundary: boolean;
  currentBatsman: string;
  overKey: number | null;
  totalBalls: number;
  legalBalls: number;
  indexingMode: "zero_based" | "one_based" | "unknown";
  isReliable: boolean;
}

// Fetch fixture with runs only (fast — for score updates)
async function fetchFixtureWithRuns(fixtureId: number): Promise<any> {
  try {
    const url = `${API_BASE}/fixtures/${fixtureId}?api_token=${getApiToken()}&include=runs`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.data || null;
  } catch (error) {
    console.error("Sportsmonk fetch (runs) error:", error);
    return null;
  }
}

// Fetch fixture with ball-by-ball data (slow — only for prediction resolution)
async function fetchFixtureWithBalls(fixtureId: number): Promise<any> {
  try {
    const url = `${API_BASE}/fixtures/${fixtureId}?api_token=${getApiToken()}&include=balls,runs`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.data || null;
  } catch (error) {
    console.error("Sportsmonk fetch (balls) error:", error);
    return null;
  }
}

function getBallOverKey(ball: number): number | null {
  if (!Number.isFinite(ball)) return null;
  return Math.floor(ball);
}

function detectOverIndexing(
  balls: BallData[],
  innings: string
): "zero_based" | "one_based" | "unknown" {
  const overKeys = new Set<number>();

  for (const ball of balls) {
    if (ball.scoreboard !== innings) continue;
    const overKey = getBallOverKey(ball.ball);
    if (overKey !== null) {
      overKeys.add(overKey);
    }
  }

  if (overKeys.has(0)) return "zero_based";
  if (overKeys.has(1)) return "one_based";
  return "unknown";
}

function getOverBalls(
  balls: BallData[],
  overNumber: number,
  innings: string
): {
  overKey: number | null;
  overBalls: BallData[];
  legalBalls: BallData[];
  indexingMode: "zero_based" | "one_based" | "unknown";
} {
  const inningsBalls = balls.filter((b) => b.scoreboard === innings);
  const indexingMode = detectOverIndexing(inningsBalls, innings);
  const preferredOverKey =
    indexingMode === "zero_based" ? overNumber - 1 : overNumber;

  const candidateKeys = Array.from(
    new Set(
      [preferredOverKey, overNumber, overNumber - 1].filter(
        (key): key is number => Number.isInteger(key) && key >= 0
      )
    )
  );

  const candidates = candidateKeys.map((key) => {
    const overBalls = inningsBalls.filter((ball) => getBallOverKey(ball.ball) === key);
    const legalBalls = overBalls.filter((ball) => ball.score.ball);
    return { key, overBalls, legalBalls };
  });

  const preferred = candidates.find((candidate) => candidate.key === preferredOverKey);
  if (preferred && preferred.overBalls.length > 0) {
    return {
      overKey: preferred.key,
      overBalls: preferred.overBalls,
      legalBalls: preferred.legalBalls,
      indexingMode,
    };
  }

  const bestCandidate = candidates
    .filter((candidate) => candidate.overBalls.length > 0)
    .sort((a, b) => {
      if (b.legalBalls.length !== a.legalBalls.length) {
        return b.legalBalls.length - a.legalBalls.length;
      }
      return b.overBalls.length - a.overBalls.length;
    })[0];

  if (bestCandidate) {
    return {
      overKey: bestCandidate.key,
      overBalls: bestCandidate.overBalls,
      legalBalls: bestCandidate.legalBalls,
      indexingMode,
    };
  }

  return {
    overKey: preferredOverKey ?? null,
    overBalls: [],
    legalBalls: [],
    indexingMode,
  };
}

// Fetch live scores
export async function fetchSportsmonkLiveScores(): Promise<any[]> {
  try {
    const url = `${API_BASE}/livescores?api_token=${getApiToken()}&include=balls,runs,localteam,visitorteam`;
    const res = await fetch(url);
    const data: any = await res.json();
    const fixtures = data.data || [];
    await enrichFixturesWithTeams(fixtures);
    return fixtures;
  } catch (error) {
    console.error("Sportsmonk livescores error:", error);
    return [];
  }
}

// Helper: fetch all pages from a paginated SportsMonk endpoint
async function fetchAllPages(baseUrl: string): Promise<any[]> {
  const allFixtures: any[] = [];
  let page = 1;

  while (true) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${separator}page=${page}`;
    const res = await fetch(url);
    const data: any = await res.json();
    const fixtures = data.data || [];
    allFixtures.push(...fixtures);

    const totalPages = data.meta?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allFixtures;
}

// Fetch today's fixtures
export async function fetchTodayFixtures(): Promise<any[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const baseUrl = `${API_BASE}/fixtures?filter[starts_between]=${today},${today}&api_token=${getApiToken()}&include=runs,localteam,visitorteam`;
    const fixtures = await fetchAllPages(baseUrl);
    await enrichFixturesWithTeams(fixtures);
    return fixtures;
  } catch (error) {
    console.error("Sportsmonk fixtures error:", error);
    return [];
  }
}

// Fetch upcoming fixtures (next 30 days)
export async function fetchUpcomingFixtures(): Promise<any[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const baseUrl = `${API_BASE}/fixtures?filter[starts_between]=${today},${futureDate}&api_token=${getApiToken()}&include=localteam,visitorteam,runs`;
    console.log(`[Sportsmonk] Fetching upcoming: ${today} to ${futureDate}`);
    const fixtures = await fetchAllPages(baseUrl);
    console.log(`[Sportsmonk] Upcoming fixtures found: ${fixtures.length} (all pages)`);
    await enrichFixturesWithTeams(fixtures);
    return fixtures;
  } catch (error) {
    console.error("Sportsmonk upcoming fixtures error:", error);
    return [];
  }
}

// Compute over stats from ball-by-ball data
export function computeOverStats(
  balls: BallData[],
  overNumber: number,
  innings: string
): OverStats {
  const {
    overKey,
    overBalls,
    legalBalls,
    indexingMode,
  } = getOverBalls(balls, overNumber, innings);

  let runs = 0;
  let wickets = 0;
  let sixes = 0;
  let boundaries = 0;
  let dots = 0;
  let wides = 0;
  let noballs = 0;
  let lastBallRuns = 0;
  let lastBallWicket = false;
  let firstBallBoundary = false;
  let currentBatsman = "";

  for (let i = 0; i < overBalls.length; i++) {
    const b = overBalls[i];
    const s = b.score;

    // s.runs = bat runs; extras (wides, noballs, byes, leg byes) are in separate fields
    const isWide = s.name?.toLowerCase().includes("wide");
    const extraRuns = (s.bye || 0) + (s.leg_bye || 0)
      + (s.noball > 0 ? 1 : 0)   // noball penalty run
      + (isWide ? 1 : 0);         // wide penalty run
    runs += s.runs + extraRuns;

    if (s.is_wicket || b.batsmanout_id) wickets++;
    if (s.six) { sixes++; boundaries++; }
    else if (s.four) { boundaries++; }
    if (s.runs === 0 && extraRuns === 0 && !s.is_wicket && s.ball) dots++;
    if (isWide) wides++;
    if (s.noball > 0 || s.noball_runs > 0) noballs++;

    currentBatsman = b.batsman?.fullname || currentBatsman;
  }

  // Last legal ball
  if (legalBalls.length > 0) {
    const lastBall = legalBalls[legalBalls.length - 1];
    lastBallRuns = lastBall.score.runs;
    lastBallWicket = lastBall.score.is_wicket || lastBall.batsmanout_id !== null;
  }

  // First legal ball
  if (legalBalls.length > 0) {
    const firstBall = legalBalls[0];
    firstBallBoundary = firstBall.score.four || firstBall.score.six;
  }

  return {
    runs,
    wickets,
    sixes,
    boundaries,
    dots,
    wides,
    noballs,
    lastBallRuns,
    lastBallWicket,
    firstBallBoundary,
    currentBatsman,
    overKey,
    totalBalls: overBalls.length,
    legalBalls: legalBalls.length,
    indexingMode,
    isReliable: overBalls.length > 0 && legalBalls.length > 0,
  };
}

function logOverResolutionStats(
  prediction: Prediction,
  innings: string,
  stats: OverStats,
  correctOption: string | null
): void {
  console.log(
    `[Sportsmonk] Resolve check over ${prediction.overNumber} (${prediction.question}) ` +
      `innings=${innings} overKey=${stats.overKey ?? "none"} indexing=${stats.indexingMode} ` +
      `balls=${stats.totalBalls} legal=${stats.legalBalls} runs=${stats.runs} ` +
      `wkts=${stats.wickets} sixes=${stats.sixes} correct=${correctOption ?? "none"}`
  );
}

// Get the current over number from ball data
function getCurrentOver(balls: BallData[], innings: string): number {
  const inningsBalls = balls.filter((b) => b.scoreboard === innings && b.score.ball);
  if (inningsBalls.length === 0) return 0;

  const lastBall = inningsBalls[inningsBalls.length - 1];
  // ball 0.6 = end of over 1, ball 1.1 = start of over 2
  const overIndex = Math.floor(lastBall.ball);
  const ballInOver = Math.round((lastBall.ball - overIndex) * 10);

  // If last ball is .6, the over is complete
  if (ballInOver >= 6) return overIndex + 1;
  // Otherwise we're mid-over
  return overIndex + 1;
}

// Track last processed over per match to avoid duplicate processing
const lastProcessedOver: Map<string, { innings: number; over: number; resolved: number }> = new Map();

// Track last known score per match to detect ball-by-ball changes (for locking predictions)
const lastKnownScore: Map<string, { innings: number; score: number; wickets: number; overs: number }> = new Map();

// Concurrency guard — prevent overlapping polls
let isPolling = false;

function resolveHotTakeAtPhaseEnd(
  prediction: any,
  round: number,
  balls: any[],
  runs: any[],
  inningsStr: string
): string | null {
  const q = prediction.question.toLowerCase();

  // Round 1: "Total runs in the powerplay?"
  if (round === 1 && q.includes("total runs in the powerplay")) {
    let ppRuns = 0;
    for (const b of balls) {
      if (b.scoreboard !== "S1") continue;
      if (Math.floor(b.ball) < 6) ppRuns += b.score?.runs || 0;
    }
    if (ppRuns < 30) return "under_30";
    if (ppRuns < 45) return "30_45";
    if (ppRuns < 60) return "45_60";
    return "60_plus";
  }

  // Round 2: "What will the score be at the 10-over mark?"
  if (round === 2 && q.includes("10-over mark")) {
    let scoreAt10 = 0;
    for (const b of balls) {
      if (b.scoreboard !== "S1") continue;
      if (Math.floor(b.ball) < 10) scoreAt10 += b.score?.runs || 0;
    }
    if (scoreAt10 < 70) return "under_70";
    if (scoreAt10 < 90) return "70_90";
    if (scoreAt10 < 110) return "90_110";
    return "110_plus";
  }

  // Round 5: "How many wickets fall in the chase by over 15?"
  if (round === 5 && q.includes("wickets fall in the chase")) {
    const inn2Balls = balls.filter((b: any) => b.scoreboard === "S2" && b.ball < 15);
    let wkts = 0;
    for (const b of inn2Balls) { if (b.score?.is_wicket || b.batsmanout_id) wkts++; }
    if (wkts <= 2) return "0_2";
    if (wkts <= 4) return "3_4";
    if (wkts <= 6) return "5_6";
    return "7_plus";
  }

  return null;
}

// Main polling function — call this on interval
export async function pollSportsmonkUpdates(io: SocketIOServer): Promise<void> {
  if (isPolling) {
    console.log("[Sportsmonk] Previous poll still running, skipping");
    return;
  }
  isPolling = true;
  try {
    await _pollSportsmonkUpdatesInner(io);
  } finally {
    isPolling = false;
  }
}

async function _pollSportsmonkUpdatesInner(io: SocketIOServer): Promise<void> {
  // Check both live AND upcoming matches (upcoming might have started)
  const matches = await Match.findAll({ where: { status: ["live", "upcoming"] } });
  if (matches.length === 0) return;

  for (const match of matches) {
    if (!match.externalId) continue;

    // Sportsmonk uses numeric fixture IDs
    const fixtureId = parseInt(match.externalId);
    if (isNaN(fixtureId)) continue;

    // Initialize lastProcessedOver from DB state on first encounter (survives server restarts)
    if (!lastProcessedOver.has(match.id) && match.status === "live") {
      lastProcessedOver.set(match.id, {
        innings: match.currentInnings || 0,
        over: match.currentOver || 0,
        resolved: (match.currentOver || 1) - 1,
      });
      console.log(`[Sportsmonk] Initialized tracking for ${match.team1Short} vs ${match.team2Short}: innings=${match.currentInnings}, over=${match.currentOver}`);
    }

    // Fast fetch: runs only (for score updates)
    const fixture = await fetchFixtureWithRuns(fixtureId);
    if (!fixture) {
      console.log(`[Sportsmonk] No fixture data for ${fixtureId}`);
      continue;
    }

    // Auto-start: if match is "upcoming" in our DB but toss has happened on Sportsmonk
    if (match.status === "upcoming") {
      const hasToss = fixture.toss_won_team_id !== null && fixture.toss_won_team_id !== undefined;
      const fixtureStatus = fixture.status;

      if (hasToss || fixtureStatus !== "NS") {
        console.log(`[Sportsmonk] Toss done for ${match.team1Short} vs ${match.team2Short} — going live!`);

        await match.update({
          status: "live",
          currentInnings: 1,
          currentOver: 1,
          currentPhase: "innings1_powerplay" as any,
          scoreData: {
            ...match.scoreData,
            tossWonTeamId: fixture.toss_won_team_id,
            elected: fixture.elected,
          },
        });

        // Generate Over 1 predictions + Round 1 hot take
        const { generatePerOverPredictions, generateHotTake } = await import("./predictionEngine");

        // Before generating over 1:
        const existingOver1 = await Prediction.findAll({ where: { matchId: match.id, overNumber: 1, round: 1, category: "per_over" } });
        if (existingOver1.length === 0) {
          const over1Preds = generatePerOverPredictions(match.id, 1, 1, "");
          for (const p of over1Preds) {
            await Prediction.create(p as any);
          }
        }

        // Before generating hot take:
        const existingHotTake = await Prediction.findOne({ where: { matchId: match.id, category: "hot_take", round: 1 } });
        if (!existingHotTake) {
          const hotTake = generateHotTake(match.id, 1, match.team1Short, match.team2Short);
          if (hotTake) {
            const hotTakeExpiresAt = new Date(Date.now() + 120_000);
            await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
          }
        }

        io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: 1 });
        io.emit("matchStarted", { matchId: match.id });

        console.log(`[Sportsmonk] Over 1 predictions live`);

        // === Resolve toss prediction immediately ===
        if (hasToss && fixture.toss_won_team_id && fixture.elected) {
          const tossPreds = await Prediction.findAll({
            where: { matchId: match.id, category: "pre_match", status: "open" },
          });
          for (const pred of tossPreds) {
            if (pred.status !== "resolved" && pred.question.toLowerCase().includes("toss")) {
              let tossWinnerShort: string | null = null;
              if (fixture.toss_won_team_id === fixture.localteam_id) {
                tossWinnerShort = match.team1Short;
              } else if (fixture.toss_won_team_id === fixture.visitorteam_id) {
                tossWinnerShort = match.team2Short;
              }
              if (tossWinnerShort) {
                const decision = fixture.elected === "batting" ? "bat" : "field";
                const correctOption = `${tossWinnerShort.toLowerCase()}_${decision}`;
                await resolvePrediction(pred, correctOption, io);
                console.log(`[Sportsmonk] Toss resolved immediately: ${correctOption}`);
              }
            }
          }
        }
      } else {
          // Generate Over 1 predictions early (5 min before match)
          const now = new Date();
          const fiveMinBefore = new Date(match.startTime.getTime() - 5 * 60 * 1000);
          if (now >= fiveMinBefore) {
            const existingOver1 = await Prediction.findAll({
              where: { matchId: match.id, overNumber: 1, round: 1, category: "per_over" },
            });
            if (existingOver1.length === 0) {
              const over1Preds = generatePerOverPredictions(match.id, 1, 1, "");
              for (const p of over1Preds) {
                await Prediction.create(p as any);
              }
              io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: 1 });
              console.log(`[Sportsmonk] Over 1 predictions generated early (5 min before match)`);
            }
          }
        continue;
      }
    }

    const runs = fixture.runs?.data || (Array.isArray(fixture.runs) ? fixture.runs : []);

    // Determine current innings and overs from runs data (fast, no balls needed)
    const innings2Runs = runs.find((r: any) => r.inning === 2);
    const innings1Runs = runs.find((r: any) => r.inning === 1);
    const currentInnings = innings2Runs ? 2 : 1;
    const currentInningsStr = currentInnings === 2 ? "S2" : "S1";
    const rawOvers = currentInnings === 2
      ? (innings2Runs?.overs || 0)
      : (innings1Runs?.overs || 0);
    const rawOver = Math.ceil(rawOvers);
    // Ensure currentOver is at least 1 (over 0 doesn't exist in cricket)
    const currentOver = Math.max(rawOver, 1);
    // Detect if a complete over just finished (e.g., overs=3.0 means over 3 completed)
    const isWholeOver = rawOvers > 0 && rawOvers === Math.floor(rawOvers);
    const justCompletedOver = isWholeOver ? rawOvers : 0;

    const lastProcessed = lastProcessedOver.get(match.id) || { innings: 0, over: 0, resolved: 0 };

    // === ALWAYS update live score on every poll (every 30s) ===
    const liveScore: Record<string, unknown> = {
      ...(match.scoreData || {}),
      lastUpdated: new Date().toISOString(),
      currentInnings,
      currentOver,
    };

    for (const r of runs) {
      const key = r.inning === 1 ? "innings1" : "innings2";
      const teamShort = r.team_id === fixture.localteam_id
        ? match.team1Short
        : match.team2Short;
      liveScore[key] = {
        score: r.score,
        wickets: r.wickets,
        overs: r.overs,
        teamId: r.team_id,
        teamShort,
      };
    }

    await match.update({ scoreData: liveScore });
    io.emit("scoreUpdate", {
      matchId: match.id,
      innings: currentInnings,
      over: currentOver,
      scoreData: liveScore,
    });

    // Log score every poll
    const inn1 = liveScore.innings1 as any;
    const inn2 = liveScore.innings2 as any;
    const scoreLog = inn1 ? `${inn1.score}/${inn1.wickets} (${inn1.overs} ov)` : "0/0";
    const scoreLog2 = inn2 ? ` | Inn2: ${inn2.score}/${inn2.wickets} (${inn2.overs} ov)` : "";
    console.log(`[Sportsmonk] ${match.team1Short} vs ${match.team2Short} — Inn1: ${scoreLog}${scoreLog2} | Over ${currentOver}`);

    // Lock per-over predictions once a ball is bowled in the current over
    const currentInnRuns = currentInnings === 2 ? innings2Runs : innings1Runs;
    const prevScore = lastKnownScore.get(match.id);
    const nowScore = currentInnRuns ? currentInnRuns.score : 0;
    const nowWickets = currentInnRuns ? currentInnRuns.wickets : 0;
    const nowOvers = currentInnRuns ? currentInnRuns.overs : 0;

    if (prevScore && prevScore.innings === currentInnings && Math.ceil(prevScore.overs) === currentOver) {
      // Same over — check if score/wickets/overs changed (ball was bowled)
      const ballBowled = nowScore !== prevScore.score || nowWickets !== prevScore.wickets || nowOvers !== prevScore.overs;
      if (ballBowled) {
        // Lock current over's predictions (e.g., Over 1 predictions lock when 1st ball of Over 1 is bowled)
        const openOverPreds = await Prediction.findAll({
          where: { matchId: match.id, overNumber: currentOver, category: "per_over", status: "open" },
        });
        if (openOverPreds.length > 0) {
          for (const pred of openOverPreds) {
            await pred.update({ status: "locked" });
          }
          io.emit("predictionsLocked", { matchId: match.id, overNumber: currentOver });
          console.log(`[Sportsmonk] Locked ${openOverPreds.length} predictions for over ${currentOver} (ball detected)`);
        }

        // Generate next over's predictions (to be answered during current over)
        const nextOverNum = currentOver + 1;
        if (nextOverNum <= 20) {
          const nextOverRound = getCurrentRound(currentInnings, nextOverNum);
          const existingNextPreds = await Prediction.findAll({
            where: { matchId: match.id, overNumber: nextOverNum, round: nextOverRound, category: "per_over" },
          });
          if (existingNextPreds.length === 0) {
            const newPreds = generatePerOverPredictions(match.id, nextOverNum, nextOverRound);
            for (const p of newPreds) {
              await Prediction.create(p as any);
            }
            io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: nextOverNum, round: nextOverRound });
            console.log(`[Sportsmonk] Generated over ${nextOverNum} predictions (during over ${currentOver})`);
          }
        }

        // === Resolve over predictions as soon as possible ===
        // Case 1: overs is whole number (e.g., 3.0) → over 3 just completed, resolve over 3 NOW
        // Case 2: ball in over N detected → over N-1 is definitely complete, resolve it
        const overToResolve = isWholeOver ? justCompletedOver : currentOver - 1;
        if (overToResolve > 0 && overToResolve > (lastProcessed.resolved || 0)) {
          try {
            const fixtureWithBalls = await fetchFixtureWithBalls(fixtureId);
            const balls: BallData[] = fixtureWithBalls?.balls?.data || [];
            const overToResolveInningsStr = currentInningsStr;
            const overToResolveStats = computeOverStats(balls, overToResolve, overToResolveInningsStr);
            const overToResolveRound = getCurrentRound(currentInnings, overToResolve);

            const overToResolvePreds = await Prediction.findAll({
              where: { matchId: match.id, overNumber: overToResolve, round: overToResolveRound, category: "per_over" },
            });

            for (const pred of overToResolvePreds) {
              if (pred.status === "open") await pred.update({ status: "locked" });
            }
            for (const pred of overToResolvePreds) {
              if (pred.status !== "resolved") {
                if (!overToResolveStats.isReliable) {
                  console.warn(
                    `[Sportsmonk] Skipping over ${overToResolve} resolution for "${pred.question}" due to unreliable ball data`
                  );
                  continue;
                }
                const correctOption = resolveOverPredictionFromStats(pred, overToResolveStats);
                logOverResolutionStats(pred, overToResolveInningsStr, overToResolveStats, correctOption);
                if (correctOption) {
                  await resolvePrediction(pred, correctOption, io);
                }
              }
            }
            if (overToResolvePreds.length > 0) {
              console.log(`[Sportsmonk] Resolved over ${overToResolve} predictions immediately (ball detected in over ${currentOver})`);
            }

            // Update resolved tracking
            lastProcessedOver.set(match.id, { ...lastProcessed, resolved: overToResolve });
          } catch (err) {
            console.error(`[Sportsmonk] Error resolving over ${overToResolve}:`, err);
          }
        }

        // Lock remaining pre-match questions when 1st ball bowled
        if (currentOver === 1 && currentInnings === 1) {
          const openPreMatch = await Prediction.findAll({
            where: { matchId: match.id, category: "pre_match", status: "open" },
          });
          if (openPreMatch.length > 0) {
            for (const pred of openPreMatch) {
              await pred.update({ status: "locked" });
            }
            io.emit("predictionsLocked", { matchId: match.id, type: "pre_match" });
            console.log(`[Sportsmonk] Locked ${openPreMatch.length} pre-match predictions (1st ball bowled)`);
          }
        }
      }
    }
    // Over changed — lock current over predictions and generate next over
    if (prevScore && prevScore.innings === currentInnings && Math.ceil(prevScore.overs) !== currentOver) {
      // New over started — lock predictions for this over (users were answering during prev over)
      const openOverPreds = await Prediction.findAll({
        where: { matchId: match.id, overNumber: currentOver, category: "per_over", status: "open" },
      });
      if (openOverPreds.length > 0) {
        for (const pred of openOverPreds) {
          await pred.update({ status: "locked" });
        }
        io.emit("predictionsLocked", { matchId: match.id, overNumber: currentOver });
        console.log(`[Sportsmonk] Locked ${openOverPreds.length} predictions for over ${currentOver} (over changed)`);
      }

      // Generate next over's predictions so users can answer during this over
      const nextOverNum = currentOver + 1;
      if (nextOverNum <= 20) {
        const nextOverRound = getCurrentRound(currentInnings, nextOverNum);
        const existingNextPreds = await Prediction.findAll({
          where: { matchId: match.id, overNumber: nextOverNum, round: nextOverRound, category: "per_over" },
        });
        if (existingNextPreds.length === 0) {
          const newPreds = generatePerOverPredictions(match.id, nextOverNum, nextOverRound);
          for (const p of newPreds) {
            await Prediction.create(p as any);
          }
          io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: nextOverNum, round: nextOverRound });
          console.log(`[Sportsmonk] Generated over ${nextOverNum} predictions (over changed to ${currentOver})`);
        }
      }
    }

    lastKnownScore.set(match.id, { innings: currentInnings, score: nowScore, wickets: nowWickets, overs: nowOvers });

    // Check if match ended
    if (fixture.status === "Finished") {
      if (match.status !== "completed") {
        await match.update({ status: "completed", currentPhase: "completed" as any });

        // === Resolve pre-match predictions using Sportmonks data ===
        try {
          // Fetch full fixture data for resolution (balls needed for sixes/wicket type)
          const fullFixture = await fetchFixtureWithBalls(fixtureId);
          const allBalls: BallData[] = fullFixture?.balls?.data || [];

          const preMatchPreds = await Prediction.findAll({
            where: { matchId: match.id, category: "pre_match", status: "open" },
          });

          for (const pred of preMatchPreds) {
            const correctOption = resolvePreMatchPrediction(
              pred, fixture, match, allBalls
            );
            if (correctOption) {
              await resolvePrediction(pred, correctOption, io);
              console.log(`[Sportsmonk] Pre-match resolved: "${pred.question}" → ${correctOption}`);
            }
          }

          // Resolve any remaining open per-over predictions (last over)
          const openOverPreds = await Prediction.findAll({
            where: { matchId: match.id, category: "per_over", status: "open" },
          });
          for (const pred of openOverPreds) {
            const overNum = pred.overNumber || 0;
            if (overNum > 0) {
              const innings = pred.round <= 3 ? "S1" : "S2";
              const overStats = computeOverStats(allBalls, overNum, innings);
              if (!overStats.isReliable) {
                console.warn(
                  `[Sportsmonk] Skipping end-match over ${overNum} resolution for "${pred.question}" due to unreliable ball data`
                );
                continue;
              }
              const correctOption = resolveOverPredictionFromStats(pred, overStats);
              logOverResolutionStats(pred, innings, overStats, correctOption);
              if (correctOption) {
                await resolvePrediction(pred, correctOption, io);
                console.log(`[Sportsmonk] End-match over ${overNum} resolved: "${pred.question}" → ${correctOption}`);
              }
            }
          }

          // Also resolve any open hot_take and rivalry_call predictions
          const otherOpenPreds = await Prediction.findAll({
            where: { matchId: match.id, category: ["hot_take", "rivalry_call"], status: "open" },
          });
          for (const pred of otherOpenPreds) {
            const correctOption = resolveEndOfMatchPrediction(pred, fixture, match, runs, allBalls);
            if (correctOption) {
              await resolvePrediction(pred, correctOption, io);
              console.log(`[Sportsmonk] End-match resolved: "${pred.question}" → ${correctOption}`);
            }
          }
        } catch (resolveErr) {
          console.error("[Sportsmonk] Error resolving pre-match predictions:", resolveErr);
        }

        // Generate final rewards
        const venues = await MatchParticipant.findAll({
          where: { matchId: match.id },
          attributes: ["venueId"],
          group: ["venueId"],
        });
        for (const v of venues) {
          await generateRoundRewards(match.id, v.venueId, 6, io); // Final round rewards
          await generateRoundRewards(match.id, v.venueId, 0, io); // Grand prize
        }

        io.emit("matchEnd", { matchId: match.id, winner: fixture.winner_team_id });
        console.log(`[Sportsmonk] Match ${match.id} ended — all predictions resolved`);
      }
      continue;
    }

    // Check for innings break
    let inningsJustChanged = false;
    if (currentInnings === 2 && lastProcessed.innings === 1) {
      inningsJustChanged = true;
      const innings1Runs = runs.find((r: any) => r.inning === 1);
      if (innings1Runs) {
        const target = innings1Runs.score + 1;
        await match.update({ currentPhase: "innings_break" as any, currentInnings: 2 });

        // Determine chasing team based on who batted first
        const battingFirstIsLocal = innings1Runs.team_id === fixture.localteam_id;
        const chasingTeamShort = battingFirstIsLocal ? match.team2Short : match.team1Short;
        const chasingTeamPlayers = battingFirstIsLocal ? match.team2Players : match.team1Players;

        // Check for existing rivalry calls to avoid duplicates
        const existingRivalryCalls = await Prediction.findAll({
          where: { matchId: match.id, category: "rivalry_call" },
        });
        if (existingRivalryCalls.length === 0) {
          const rivalryCalls = generateRivalryCalls(
            match.id, target, chasingTeamShort, chasingTeamPlayers
          );
          const rivalryExpiresAt = new Date(Date.now() + 120_000);
          for (const rc of rivalryCalls) {
            await Prediction.create({ ...rc, expiresAt: rivalryExpiresAt } as any);
          }
        }

        // Round 3 rewards
        const venues = await MatchParticipant.findAll({
          where: { matchId: match.id },
          attributes: ["venueId"],
          group: ["venueId"],
        });
        for (const v of venues) {
          await generateRoundRewards(match.id, v.venueId, 3, io);
        }

        // Resolve hot take predictions that depend on first innings data
        // Match by round 3 (1st innings death) — more reliable than text matching
        const hotTakePreds = await Prediction.findAll({
          where: { matchId: match.id, category: "hot_take", status: "open", round: 3 },
        });
        for (const pred of hotTakePreds) {
          const score = innings1Runs.score;
          let correctOption: string;
          if (score < 150) correctOption = "low";
          else if (score <= 175) correctOption = "par";
          else if (score <= 200) correctOption = "high";
          else correctOption = "massive";
          await resolvePrediction(pred, correctOption, io);
          console.log(`[Sportsmonk] Innings break hot take resolved: "${pred.question}" → ${correctOption}`);
        }

        // Generate Over 1 (2nd innings) per-over predictions — locked when 1st ball of innings 2 is bowled
        const inn2Round = getCurrentRound(2, 1); // = 4
        const existingInn2Over1 = await Prediction.findAll({
          where: { matchId: match.id, overNumber: 1, round: inn2Round, category: "per_over" },
        });
        if (existingInn2Over1.length === 0) {
          const inn2OverPreds = generatePerOverPredictions(match.id, 1, inn2Round);
          for (const p of inn2OverPreds) {
            await Prediction.create(p as any);
          }
        }

        // Generate Round 4 hot take (with dedup check)
        const existingHotTake4 = await Prediction.findOne({
          where: { matchId: match.id, category: "hot_take", round: inn2Round },
        });
        if (!existingHotTake4) {
          const hotTakeExpiresAt = new Date(Date.now() + 120_000);
          const hotTake = generateHotTake(match.id, inn2Round, match.team1Short, match.team2Short);
          if (hotTake) {
            await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
          }
        }

        io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: inn2Round });
        io.emit("inningsBreak", {
          matchId: match.id,
          target,
          team1Score: innings1Runs.score,
          team1Wickets: innings1Runs.wickets,
        });

        // Resolve last over of innings 1 predictions
        try {
          const completedOver = lastProcessed.over;
          if (completedOver > 0) {
            const fixtureWithBalls = await fetchFixtureWithBalls(fixtureId);
            const balls: BallData[] = fixtureWithBalls?.balls?.data || [];
            const overStats = computeOverStats(balls, completedOver, "S1");
            const completedRound = getCurrentRound(1, completedOver);
            const overPredictions = await Prediction.findAll({
              where: { matchId: match.id, overNumber: completedOver, round: completedRound, status: "open" },
            });
            // Lock predictions first to prevent late submissions
            for (const pred of overPredictions) {
              await pred.update({ status: "locked" });
            }
            io.emit("predictionsLocked", { matchId: match.id, overNumber: completedOver });
            for (const pred of overPredictions) {
              const correctOption = resolveOverPredictionFromStats(pred, overStats);
              if (correctOption) {
                await resolvePrediction(pred, correctOption, io);
              } else {
                console.warn(`[Sportsmonk] Could not resolve prediction "${pred.question}" (id=${pred.id}) — no matching rule`);
              }
            }
            console.log(`[Sportsmonk] Resolved innings 1 over ${completedOver} predictions`);
          }
        } catch (err) {
          console.error("[Sportsmonk] Error resolving last over of innings 1:", err);
        }

        // Update tracking so over-completion block doesn't re-run
        lastProcessedOver.set(match.id, { innings: currentInnings, over: currentOver, resolved: lastProcessed.over });

        console.log(`[Sportsmonk] Innings break — target: ${target}`);
      }
    }

    // Catch-up: resolve first-innings hot takes and fix rivalry calls if we're already in innings 2
    if (currentInnings === 2) {
      const innings1Runs = runs.find((r: any) => r.inning === 1);
      if (innings1Runs) {
        // Fix rivalry call question text if it has the wrong chasing team
        const battingFirstIsLocal = innings1Runs.team_id === fixture.localteam_id;
        const correctChasingShort = battingFirstIsLocal ? match.team2Short : match.team1Short;
        const wrongChasingShort = battingFirstIsLocal ? match.team1Short : match.team2Short;
        const rivalryCalls = await Prediction.findAll({
          where: { matchId: match.id, category: "rivalry_call", status: "open" },
        });
        for (const rc of rivalryCalls) {
          if (rc.question.includes(`${wrongChasingShort} need`)) {
            const fixedQuestion = rc.question.replace(`${wrongChasingShort} need`, `${correctChasingShort} need`);
            await rc.update({ question: fixedQuestion });
            console.log(`[Sportsmonk] Fixed rivalry call: "${fixedQuestion}"`);
          }
        }
        // Catch-up: resolve round 3 hot takes (1st innings score) by round number
        const round3HotTakes = await Prediction.findAll({
          where: { matchId: match.id, category: "hot_take", status: "open", round: 3 },
        });
        for (const pred of round3HotTakes) {
          const score = innings1Runs.score;
          let correctOption: string;
          if (score < 150) correctOption = "low";
          else if (score <= 175) correctOption = "par";
          else if (score <= 200) correctOption = "high";
          else correctOption = "massive";
          await resolvePrediction(pred, correctOption, io);
          console.log(`[Sportsmonk] Catch-up resolved: "${pred.question}" → ${correctOption}`);
        }
        // Catch-up: resolve round 1 hot takes (total powerplay runs)
        const round1HotTakes = await Prediction.findAll({
          where: { matchId: match.id, category: "hot_take", status: "open", round: 1 },
        });
        for (const pred of round1HotTakes) {
          const fullFixture = await fetchFixtureWithBalls(fixtureId);
          const allBalls: BallData[] = fullFixture?.balls?.data || [];
          let ppRuns = 0;
          for (const b of allBalls) {
            if (b.scoreboard !== "S1") continue;
            if (Math.floor(b.ball) < 6) ppRuns += b.score?.runs || 0;
          }
          let correctOption: string;
          if (ppRuns < 30) correctOption = "under_30";
          else if (ppRuns < 45) correctOption = "30_45";
          else if (ppRuns < 60) correctOption = "45_60";
          else correctOption = "60_plus";
          await resolvePrediction(pred, correctOption, io);
          console.log(`[Sportsmonk] Catch-up resolved: "${pred.question}" → ${correctOption}`);
        }
      }
    }

    // === Over-completion logic: resolve predictions & generate new ones ===
    // Trigger when: over number increased (3.1 → currentOver=4) OR whole over detected (3.0 → justCompletedOver=3)
    // Skip if innings just changed — that's handled in the innings break block above
    const overChanged = currentOver > lastProcessed.over || currentInnings > lastProcessed.innings;
    const wholeOverCompleted = justCompletedOver > 0 && justCompletedOver > (lastProcessed.over - 1);
    if (!inningsJustChanged && (overChanged || wholeOverCompleted)) {
      try {
        const completedOver = currentInnings > lastProcessed.innings
          ? lastProcessed.over // last over of previous innings
          : justCompletedOver > 0 ? justCompletedOver : currentOver - 1;

        if (completedOver > 0) {
          console.log(`[Sportsmonk] Over ${completedOver} completed — fetching ball-by-ball data...`);

          // Slow fetch: get ball-by-ball data only when an over completes
          const fixtureWithBalls = await fetchFixtureWithBalls(fixtureId);
          const balls: BallData[] = fixtureWithBalls?.balls?.data || [];

          const prevInningsStr = currentInnings > lastProcessed.innings ? "S1" : currentInningsStr;
          const overStats = computeOverStats(balls, completedOver, prevInningsStr);

          console.log(`[Sportsmonk] Over ${completedOver}: ${overStats.runs} runs, ${overStats.wickets} wkts, ${overStats.sixes} sixes`);

          // Resolve predictions for the completed over (filter by round to avoid cross-innings collision)
          const completedRound = getCurrentRound(
            prevInningsStr === "S1" ? 1 : 2,
            completedOver
          );
          const overPredictions = await Prediction.findAll({
            where: { matchId: match.id, overNumber: completedOver, round: completedRound, category: "per_over" },
          });

          // Lock & resolve predictions for the completed over
          for (const pred of overPredictions) {
            if (pred.status === "open") await pred.update({ status: "locked" });
          }
          for (const pred of overPredictions) {
            if (pred.status === "resolved") continue;
            if (!overStats.isReliable) {
              console.warn(
                `[Sportsmonk] Skipping over ${completedOver} resolution for "${pred.question}" due to unreliable ball data`
              );
              continue;
            }
            const correctOption = resolveOverPredictionFromStats(pred, overStats);
            logOverResolutionStats(pred, prevInningsStr, overStats, correctOption);
            if (correctOption) {
              await resolvePrediction(pred, correctOption, io);
            } else {
              console.warn(`[Sportsmonk] Could not resolve prediction "${pred.question}" (id=${pred.id}) — no matching rule`);
            }
          }

        // === Resolve "first wicket" pre-match prediction ===
        const firstWicketPred = await Prediction.findOne({
          where: { matchId: match.id, category: "pre_match", status: "locked" },
        });
        if (
          firstWicketPred &&
          firstWicketPred.status !== "resolved" &&
          firstWicketPred.question.toLowerCase().includes("first wicket")
        ) {
          const wicketBall = balls.find((b: any) => b.score?.is_wicket || b.score?.out || b.batsmanout_id);
          if (wicketBall) {
            const dismissalName = (wicketBall.score?.name || "").toLowerCase();
            let correctOption: string | null = null;
            if (dismissalName.includes("run out")) correctOption = "run_out";
            else if (dismissalName.includes("stumped") || dismissalName.includes("stumping")) correctOption = "stumped";
            else if (dismissalName.includes("lbw") || dismissalName.includes("leg before")) correctOption = "lbw";
            else if (dismissalName.includes("bowled")) correctOption = "bowled";
            else if (dismissalName.includes("caught")) correctOption = "caught";
            else correctOption = "caught";
            await resolvePrediction(firstWicketPred, correctOption, io);
            console.log(`[Sportsmonk] First wicket resolved immediately: ${correctOption}`);
          }
        }

          // Lock next over's predictions (users were answering these during the completed over)
          const nextOverNum = completedOver + 1;
          const nextOverPreds = await Prediction.findAll({
            where: { matchId: match.id, overNumber: nextOverNum, category: "per_over", status: "open" },
          });
          for (const pred of nextOverPreds) {
            await pred.update({ status: "locked" });
          }
          if (nextOverPreds.length > 0) {
            io.emit("predictionsLocked", { matchId: match.id, overNumber: nextOverNum });
          }

          // Update match state
          const newPhase = getPhase(currentInnings, currentOver);
          await match.update({
            currentOver,
            currentInnings,
            currentPhase: newPhase as any,
          });

          // Check round change
          const prevRound = getCurrentRound(
            prevInningsStr === "S1" ? 1 : 2,
            completedOver
          );
          const newRound = getCurrentRound(currentInnings, currentOver);

          if (newRound !== prevRound && prevRound > 0) {
            const venues = await MatchParticipant.findAll({
              where: { matchId: match.id },
              attributes: ["venueId"],
              group: ["venueId"],
            });
            for (const v of venues) {
              await MatchParticipant.update(
                { boostsUsedRound: 0, currentRound: newRound },
                { where: { matchId: match.id, venueId: v.venueId } }
              );
              await generateRoundRewards(match.id, v.venueId, prevRound, io);
            }

            // === Resolve hot take for the ending round at phase boundary ===
            const endingHotTakes = await Prediction.findAll({
              where: { matchId: match.id, category: "hot_take", status: "open", round: prevRound },
            });
            for (const pred of endingHotTakes) {
              const hotTakeAnswer = resolveHotTakeAtPhaseEnd(pred, prevRound, balls, runs, prevInningsStr);
              if (hotTakeAnswer) {
                await resolvePrediction(pred, hotTakeAnswer, io);
                console.log(`[Sportsmonk] Hot take resolved at phase end (round ${prevRound}): "${pred.question}" → ${hotTakeAnswer}`);
              }
            }

            // Generate hot take for new round (with dedup check)
            const existingHotTake = await Prediction.findOne({
              where: { matchId: match.id, category: "hot_take", round: newRound },
            });
            if (!existingHotTake) {
              const roundHotTakeExpiresAt = new Date(Date.now() + 120_000);
              const hotTake = generateHotTake(match.id, newRound, match.team1Short, match.team2Short);
              if (hotTake) {
                await Prediction.create({ ...hotTake, expiresAt: roundHotTakeExpiresAt } as any);
                io.emit("newPrediction", { matchId: match.id, type: "hot_take", round: newRound });
              }
            }
          }

          // Generate predictions TWO overs ahead (to be answered during the next over)
          const twoAhead = currentOver + 1;
          const twoAheadRound = getCurrentRound(currentInnings, twoAhead);
          if (twoAhead <= 20) {
            // Check if innings can continue (not all-out or target already chased)
            const currentInningsRuns = runs.find((r: any) => r.inning === currentInnings);
            const isAllOut = currentInningsRuns && currentInningsRuns.wickets >= 10;
            const inn1Data = liveScore.innings1 as any;
            const targetChased = currentInnings === 2 && currentInningsRuns && inn1Data &&
              currentInningsRuns.score >= (inn1Data.score + 1);

            if (!isAllOut && !targetChased) {
              const nextBatsman = overStats.currentBatsman;

              // Deduplication: check if predictions for this over+round already exist
              const existingPreds = await Prediction.findAll({
                where: { matchId: match.id, overNumber: twoAhead, round: twoAheadRound, category: "per_over" },
              });

              if (existingPreds.length === 0) {
                const newPreds = generatePerOverPredictions(match.id, twoAhead, twoAheadRound, nextBatsman);
                for (const p of newPreds) {
                  await Prediction.create(p as any);
                }
                io.emit("newPrediction", {
                  matchId: match.id,
                  type: "per_over",
                  overNumber: twoAhead,
                  round: twoAheadRound,
                });
                console.log(`[Sportsmonk] Over ${twoAhead} predictions generated (2 ahead)`);
              } else {
                console.log(`[Sportsmonk] Over ${twoAhead} predictions already exist — skipping`);
              }
            } else {
              console.log(`[Sportsmonk] Innings cannot continue (allOut=${!!isAllOut}, targetChased=${!!targetChased}) — skipping prediction generation`);
            }
          }
        }
      } catch (overErr) {
        console.error(`[Sportsmonk] Error processing over change for ${match.team1Short} vs ${match.team2Short}:`, overErr);
      }

      // Update tracking — mark the completed over as resolved
      const resolvedOver = currentInnings > lastProcessed.innings
        ? lastProcessed.over
        : justCompletedOver > 0 ? justCompletedOver : currentOver - 1;
      lastProcessedOver.set(match.id, { innings: currentInnings, over: currentOver, resolved: Math.max(resolvedOver, lastProcessed.resolved || 0) });
    }
  }
}

function getPhase(innings: number, over: number): string {
  if (innings === 1) {
    if (over <= 6) return "innings1_powerplay";
    if (over <= 15) return "innings1_middle";
    return "innings1_death";
  }
  if (over <= 6) return "innings2_powerplay";
  if (over <= 15) return "innings2_middle";
  return "innings2_death";
}

// Resolve per-over prediction using computed over stats
export function resolveOverPredictionFromStats(prediction: Prediction, stats: OverStats): string | null {
  const q = prediction.question.toLowerCase();

  if (q.includes("how many runs")) {
    if (stats.runs <= 5) return "low";
    if (stats.runs <= 10) return "medium";
    return "high";
  }

  if (q.includes("wicket in over")) {
    return stats.wickets > 0 ? "yes" : "no";
  }

  if (q.includes("sixes in over")) {
    if (stats.sixes === 0) return "zero";
    if (stats.sixes === 1) return "one";
    if (stats.sixes === 2) return "two";
    return "three_plus";
  }

  if (q.includes("boundary off the first ball")) {
    return stats.firstBallBoundary ? "yes" : "no";
  }

  if (q.includes("dot balls")) {
    if (stats.dots <= 2) return "few";
    if (stats.dots <= 4) return "some";
    return "lots";
  }

  if (q.includes("how does over") && q.includes("last ball")) {
    if (stats.lastBallWicket) return "wicket";
    if (stats.lastBallRuns >= 4) return "boundary";
    if (stats.lastBallRuns >= 1) return "single";
    return "dot";
  }

  if (q.includes("score 10+") || q.includes("10+ total runs")) {
    return stats.runs >= 10 ? "yes" : "no";
  }

  if (q.includes("more than 2 boundaries")) {
    return stats.boundaries > 2 ? "yes" : "no";
  }

  if (q.includes("maiden")) {
    // A maiden = 0 runs conceded including extras (wides/noballs break a maiden)
    return (stats.runs === 0 && stats.wides === 0 && stats.noballs === 0) ? "yes" : "no";
  }

  if (q.includes("last ball of over") && q.includes("runs")) {
    if (stats.lastBallRuns === 0) return "zero";
    if (stats.lastBallRuns <= 2) return "single_double";
    return "three_plus";
  }

  return null;
}

export interface RepairPerOverPredictionsScope {
  matchId?: string;
}

export interface RepairPerOverPredictionsSummary {
  matchesChecked: number;
  predictionsChecked: number;
  predictionsCorrected: number;
  participantsRecomputed: number;
  userPredictionsRecomputed: number;
}

export async function repairPerOverPredictions(
  scope: RepairPerOverPredictionsScope = {}
): Promise<RepairPerOverPredictionsSummary> {
  const matchWhere: Record<string, string> = {};
  if (scope.matchId) matchWhere.id = scope.matchId;

  const matches = await Match.findAll({
    where: matchWhere,
    order: [["updatedAt", "DESC"]],
  });

  let predictionsChecked = 0;
  let predictionsCorrected = 0;
  let participantsRecomputed = 0;
  let userPredictionsRecomputed = 0;

  for (const match of matches) {
    if (!match.externalId) continue;

    const fixtureId = Number(match.externalId);
    if (!Number.isFinite(fixtureId)) continue;

    const fullFixture = await fetchFixtureWithBalls(fixtureId);
    const allBalls: BallData[] = fullFixture?.balls?.data || [];
    if (allBalls.length === 0) {
      console.warn(
        `[Sportsmonk Repair] Skipping match ${match.id} (${match.externalId}) because no ball-by-ball data was returned`
      );
      continue;
    }

    const perOverPredictions = await Prediction.findAll({
      where: { matchId: match.id, category: "per_over", status: "resolved" },
      order: [["overNumber", "ASC"], ["createdAt", "ASC"]],
    });

    let correctedThisMatch = 0;

    for (const pred of perOverPredictions) {
      const overNumber = pred.overNumber || 0;
      if (overNumber <= 0) continue;

      predictionsChecked += 1;

      const innings = pred.round <= 3 ? "S1" : "S2";
      const overStats = computeOverStats(allBalls, overNumber, innings);
      if (!overStats.isReliable) {
        console.warn(
          `[Sportsmonk Repair] Skipping "${pred.question}" due to unreliable ball data (match=${match.id}, innings=${innings}, over=${overNumber})`
        );
        continue;
      }

      const expectedCorrectOption = resolveOverPredictionFromStats(pred, overStats);
      logOverResolutionStats(pred, innings, overStats, expectedCorrectOption);

      if (expectedCorrectOption && pred.correctOption !== expectedCorrectOption) {
        const previousCorrectOption = pred.correctOption;
        await pred.update({ correctOption: expectedCorrectOption });
        correctedThisMatch += 1;
        predictionsCorrected += 1;
        console.log(
          `[Sportsmonk Repair] Corrected "${pred.question}" from ${previousCorrectOption ?? "null"} to ${expectedCorrectOption}`
        );
      }
    }

    if (correctedThisMatch > 0) {
      const scoreSummary = await recomputeParticipantScores({ matchId: match.id });
      participantsRecomputed += scoreSummary.participantsRecomputed;
      userPredictionsRecomputed += scoreSummary.userPredictionsRecomputed;
    }
  }

  return {
    matchesChecked: matches.length,
    predictionsChecked,
    predictionsCorrected,
    participantsRecomputed,
    userPredictionsRecomputed,
  };
}

// Resolve pre-match predictions when match finishes
function resolvePreMatchPrediction(
  prediction: Prediction,
  fixture: any,
  match: Match,
  allBalls: BallData[]
): string | null {
  const q = prediction.question.toLowerCase();
  const options = prediction.options;

  // Q1: "Who wins tonight?"
  if (q.includes("who wins")) {
    const winnerTeamId = fixture.winner_team_id;
    if (!winnerTeamId) return null;

    // Match team IDs from scoreData to determine which short name won
    const scoreData = match.scoreData as any;
    const inn1TeamId = scoreData?.innings1?.teamId;
    const inn2TeamId = scoreData?.innings2?.teamId;

    // Determine winner short name by matching team IDs
    let winnerShort: string | null = null;
    if (winnerTeamId === inn1TeamId) {
      // First batting team won — that's localteam in most cases
      winnerShort = match.team1Short;
    } else if (winnerTeamId === inn2TeamId) {
      winnerShort = match.team2Short;
    }

    // Also check fixture's localteam_id/visitorteam_id
    if (!winnerShort) {
      if (winnerTeamId === fixture.localteam_id) {
        winnerShort = match.team1Short;
      } else if (winnerTeamId === fixture.visitorteam_id) {
        winnerShort = match.team2Short;
      }
    }

    if (winnerShort) {
      return winnerShort.toLowerCase();
    }
    return null;
  }

  // Q2: "Pick your man of the match"
  if (q.includes("man of the match") || q.includes("steals the show")) {
    const motmId = fixture.man_of_match_id;
    if (!motmId) return null;

    // Try to match MOTM player from options by checking all players
    // Since we store player names as keys, we need to check Sportmonks MOTM
    // For now, return null if we can't match (MOTM name not easily available from fixture alone)
    // We'd need to fetch the player endpoint — skip for now unless we have the name
    return null;
  }

  // Q3: "Toss time — who wins and what do they pick?"
  if (q.includes("toss")) {
    const tossWinnerId = fixture.toss_won_team_id;
    const elected = fixture.elected; // "batting" or "bowling"
    if (!tossWinnerId || !elected) return null;

    let tossWinnerShort: string | null = null;
    if (tossWinnerId === fixture.localteam_id) {
      tossWinnerShort = match.team1Short;
    } else if (tossWinnerId === fixture.visitorteam_id) {
      tossWinnerShort = match.team2Short;
    }

    if (tossWinnerShort) {
      const decision = elected === "batting" ? "bat" : "field";
      return `${tossWinnerShort.toLowerCase()}_${decision}`;
    }
    return null;
  }

  // Q4: "Which team hits more sixes?"
  if (q.includes("more sixes")) {
    let team1Sixes = 0;
    let team2Sixes = 0;

    for (const b of allBalls) {
      if (b.score?.six) {
        if (b.scoreboard === "S1") team1Sixes++;
        else if (b.scoreboard === "S2") team2Sixes++;
      }
    }

    // Team batting first in S1 — map to team short names
    const scoreData = match.scoreData as any;
    const inn1TeamId = scoreData?.innings1?.teamId;

    if (inn1TeamId === fixture.localteam_id) {
      // team1 batted first (S1), team2 batted second (S2)
      return team1Sixes >= team2Sixes
        ? match.team1Short.toLowerCase()
        : match.team2Short.toLowerCase();
    } else {
      // team2 batted first (S1), team1 batted second (S2)
      return team2Sixes >= team1Sixes
        ? match.team1Short.toLowerCase()
        : match.team2Short.toLowerCase();
    }
  }

  // Q5: "First wicket — how does it fall?"
  if (q.includes("first wicket")) {
    // Find the first ball with a wicket
    const wicketBall = allBalls.find((b) => b.score?.is_wicket || b.score?.out || b.batsmanout_id);
    if (!wicketBall) return null;

    const dismissalName = (wicketBall.score?.name || "").toLowerCase();

    if (dismissalName.includes("run out")) return "run_out";
    if (dismissalName.includes("stumped") || dismissalName.includes("stumping")) return "stumped";
    if (dismissalName.includes("lbw") || dismissalName.includes("leg before")) return "lbw";
    if (dismissalName.includes("bowled")) return "bowled";
    if (dismissalName.includes("caught")) return "caught";

    // Default to caught if we can't determine
    return "caught";
  }

  return null;
}

// Resolve hot_take and rivalry_call predictions at end of match
function resolveEndOfMatchPrediction(
  prediction: Prediction,
  fixture: any,
  match: Match,
  runs: any[],
  allBalls: BallData[]
): string | null {
  const q = prediction.question.toLowerCase();

  // "Total first innings score"
  if (q.includes("total first innings score") || q.includes("gut say")) {
    const inn1 = runs.find((r: any) => r.inning === 1);
    if (!inn1) return null;
    const score = inn1.score;
    if (score < 150) return "low";
    if (score <= 175) return "par";
    if (score <= 200) return "high";
    return "massive";
  }

  // "Will the match go to the last over?"
  if (q.includes("last over")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    if (!inn2) return "no";
    return inn2.overs >= 19 ? "yes" : "no";
  }

  // "How many wickets fall in the chase by over 15?"
  if (q.includes("wickets fall in the chase")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    if (!inn2) return "0_2";
    // Count wickets in 2nd innings up to over 15
    const inn2Balls = allBalls.filter((b) => b.scoreboard === "S2" && b.ball < 15);
    let wkts = 0;
    for (const b of inn2Balls) {
      if (b.score?.is_wicket || b.batsmanout_id) wkts++;
    }
    if (wkts <= 2) return "0_2";
    if (wkts <= 4) return "3_4";
    if (wkts <= 6) return "5_6";
    return "7_plus";
  }

  // "Total runs in the powerplay?"
  if (q.includes("total runs in the powerplay")) {
    let ppRuns = 0;
    for (const b of allBalls) {
      if (b.scoreboard !== "S1") continue;
      if (Math.floor(b.ball) < 6) ppRuns += b.score?.runs || 0;
    }
    if (ppRuns < 30) return "under_30";
    if (ppRuns < 45) return "30_45";
    if (ppRuns < 60) return "45_60";
    return "60_plus";
  }

  // "What will the score be at the 10-over mark?"
  if (q.includes("10-over mark")) {
    let scoreAt10 = 0;
    for (const b of allBalls) {
      if (b.scoreboard !== "S1") continue;
      if (Math.floor(b.ball) < 10) scoreAt10 += b.score?.runs || 0;
    }
    if (scoreAt10 < 70) return "under_70";
    if (scoreAt10 < 90) return "70_90";
    if (scoreAt10 < 110) return "90_110";
    return "110_plus";
  }

  // "Will the match end with a six or a four?"
  if (q.includes("end with a six or a four")) {
    if (allBalls.length === 0) return "neither";
    const lastBall = allBalls[allBalls.length - 1];
    const runs = lastBall.score?.runs || 0;
    const isSix = lastBall.score?.six || runs === 6;
    const isFour = lastBall.score?.four || runs === 4;
    if (isSix) return "six";
    if (isFour) return "four";
    return "neither";
  }

  // "How much will [team] score in the powerplay?" (rivalry call)
  if (q.includes("score in the powerplay")) {
    let ppRuns = 0;
    for (const b of allBalls) {
      if (b.scoreboard !== "S2") continue;
      if (Math.floor(b.ball) < 6) ppRuns += b.score?.runs || 0;
    }
    if (ppRuns < 30) return "under_30";
    if (ppRuns < 45) return "30_45";
    if (ppRuns < 60) return "45_60";
    return "60_plus";
  }

  // "Will any player score a century tonight?"
  if (q.includes("century")) {
    let hasCentury = false;
    const batterRuns: Record<number, number> = {};
    for (const b of allBalls) {
      const batterId = b.batsman_id;
      if (batterId) {
        batterRuns[batterId] = (batterRuns[batterId] || 0) + (b.score?.runs || 0);
        if (batterRuns[batterId] >= 100) { hasCentury = true; break; }
      }
    }
    return hasCentury ? "yes" : "no";
  }

  // "Chase done in which phase?"
  if (q.includes("chase done in which phase") || q.includes("need")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    const inn1 = runs.find((r: any) => r.inning === 1);
    if (!inn2 || !inn1) return "not_chased";

    // Did chasing team win?
    if (fixture.winner_team_id !== inn2.team_id) return "not_chased";

    const overs = inn2.overs;
    if (overs <= 6) return "powerplay";
    if (overs <= 15) return "middle";
    return "death";
  }

  return null;
}
