import { Match, Prediction, MatchParticipant } from "../models";
import { generatePerOverPredictions, generateHotTake, generateRivalryCalls, getCurrentRound } from "./predictionEngine";
import {
  ALL_CORRECT_OPTION,
  resolvePrediction,
  reResolvePrediction,
  generateRoundRewards,
  recomputeParticipantScores,
} from "./pointsEngine";
import { Server as SocketIOServer } from "socket.io";

const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
// Read at call time, not module load time, so dotenv has loaded
const getApiToken = () => process.env.SPORTSMONK_API_KEY || "";
const SPORTSMONK_HEADERS = {
  accept: "application/json",
  "user-agent": "JaffaBackend/1.0",
};

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
    const res = await fetch(url, { headers: SPORTSMONK_HEADERS });
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
  extras: number;
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
}

// Fetch fixture with runs only (fast — for score updates)
async function fetchFixtureWithRuns(fixtureId: number): Promise<any> {
  try {
    const url = `${API_BASE}/fixtures/${fixtureId}?api_token=${getApiToken()}&include=runs`;
    const res = await fetch(url, { headers: SPORTSMONK_HEADERS });
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
    const res = await fetch(url, { headers: SPORTSMONK_HEADERS });
    const data: any = await res.json();
    return data.data || null;
  } catch (error) {
    console.error("Sportsmonk fetch (balls) error:", error);
    return null;
  }
}

async function fetchFixtureFromLivescores(
  fixtureId: number,
  include: string
): Promise<any | null> {
  const filterVariants = [
    `filter[fixture]=${fixtureId}`,
    `filter[fixtures]=${fixtureId}`,
    `filter[id]=${fixtureId}`,
  ];

  for (const filter of filterVariants) {
    try {
      const url = `${API_BASE}/livescores?api_token=${getApiToken()}&include=${include}&${filter}`;
      const res = await fetch(url, { headers: SPORTSMONK_HEADERS });
      const data: any = await res.json();
      const fixtures = data.data || [];
      const fixture = fixtures.find((item: any) => Number(item.id) === fixtureId);
      if (fixture) {
        return fixture;
      }
    } catch (error) {
      console.error(`[Sportsmonk] Livescores fetch failed for ${fixtureId} (${filter}):`, error);
    }
  }

  return null;
}

async function fetchLiveFixtureDetail(
  fixtureId: number,
  includeBalls = false
): Promise<any | null> {
  if (includeBalls) {
    const fixture = await fetchFixtureWithBalls(fixtureId);
    const ballCount = fixture?.balls?.data?.length || (Array.isArray(fixture?.balls) ? fixture.balls.length : 0);
    if (fixture && ballCount > 0) {
      return fixture;
    }
  } else {
    const fixture = await fetchFixtureWithRuns(fixtureId);
    const runCount = fixture?.runs?.data?.length || (Array.isArray(fixture?.runs) ? fixture.runs.length : 0);
    if (fixture && runCount > 0) {
      return fixture;
    }
  }

  const include = includeBalls ? "balls,runs" : "runs";
  const liveFixture = await fetchFixtureFromLivescores(fixtureId, include);
  if (liveFixture) {
    return liveFixture;
  }

  return includeBalls ? fetchFixtureWithBalls(fixtureId) : fetchFixtureWithRuns(fixtureId);
}

function getPredictionInnings(prediction: Prediction): number {
  return prediction.round <= 3 ? 1 : 2;
}

function getCompletedOverLimit(rawOvers: number, currentOver: number): number {
  if (rawOvers <= 0) return 0;
  if (rawOvers === Math.floor(rawOvers)) {
    return Math.max(currentOver, 0);
  }
  return Math.max(currentOver - 1, 0);
}

function isPredictionCompleted(
  prediction: Prediction,
  currentInnings: number,
  completedOverLimit: number
): boolean {
  const predictionInnings = getPredictionInnings(prediction);
  const predictionOver = prediction.overNumber || 0;

  if (predictionOver <= 0) return false;
  if (predictionInnings < currentInnings) return true;
  if (predictionInnings > currentInnings) return false;
  return predictionOver <= completedOverLimit;
}

function createNoopIo(): SocketIOServer {
  const noopRoom = {
    emit: () => noopRoom,
  };

  return {
    to: () => noopRoom,
    emit: () => noopRoom,
  } as unknown as SocketIOServer;
}

function resolveDismissalType(scoreName?: string | null): string | null {
  const normalized = (scoreName || "").trim().toLowerCase();
  if (!normalized) return null;

  const exactMap: Record<string, string> = {
    "catch out": "caught",
    "catch out (sub)": "caught",
    "clean bowled": "bowled",
    "lbw out": "lbw",
    "run out": "run_out",
    "run out + 1": "run_out",
    "run out + 2": "run_out",
    "run out (subs)": "run_out",
    "stump out": "stumped",
  };

  if (exactMap[normalized]) {
    return exactMap[normalized];
  }

  // Fallback for spelling/format variation across feeds.
  if (normalized.includes("run out")) return "run_out";
  if (normalized.includes("stump")) return "stumped";
  if (normalized.includes("lbw") || normalized.includes("leg before")) return "lbw";
  if (normalized.includes("bowled")) return "bowled";
  if (normalized.includes("catch")) return "caught";

  return null;
}

function getBallTotalRuns(ball: BallData): number {
  const score = ball.score;
  const isWide = score.name?.toLowerCase().includes("wide");
  return (
    (score.runs || 0) +
    (score.bye || 0) +
    (score.leg_bye || 0) +
    (score.noball > 0 ? 1 : 0) +
    (isWide ? 1 : 0)
  );
}

async function getTrackingSeed(match: Match): Promise<{ innings: number; over: number; resolved: number }> {
  const lastResolvedPrediction = await Prediction.findOne({
    where: {
      matchId: match.id,
      category: "per_over",
      status: "resolved",
    },
    order: [["round", "DESC"], ["overNumber", "DESC"], ["updatedAt", "DESC"]],
  });

  return {
    innings: match.currentInnings || 0,
    over: match.currentOver || 0,
    resolved: lastResolvedPrediction?.overNumber || 0,
  };
}

async function resolveOverPredictionsForOver(
  match: Match,
  innings: number,
  overNumber: number,
  balls: BallData[],
  io: SocketIOServer
): Promise<number> {
  if (overNumber <= 0) return 0;

  const inningsStr = innings === 1 ? "S1" : "S2";
  const round = getCurrentRound(innings, overNumber);
  const overStats = computeOverStats(balls, overNumber, inningsStr);

  if (balls.length === 0 || overStats.currentBatsman === "" && overStats.runs === 0 && overStats.wickets === 0 && overStats.sixes === 0 && overStats.dots === 0 && overStats.boundaries === 0 && overStats.wides === 0 && overStats.noballs === 0) {
    const ballChips = extractOverBallChips(balls, overNumber, inningsStr);
    if (ballChips.length === 0) {
      return 0;
    }
  }

  const overPredictions = await Prediction.findAll({
    where: {
      matchId: match.id,
      overNumber,
      round,
      category: "per_over",
      status: ["open", "locked"],
    },
  });

  let resolvedCount = 0;

  for (const pred of overPredictions) {
    if (pred.status === "open") {
      await pred.update({ status: "locked" });
    }
  }

  for (const pred of overPredictions) {
    const correctOption = resolveOverPredictionFromStats(pred, overStats);
    if (!correctOption) {
      console.warn(`[Sportsmonk] Could not resolve prediction "${pred.question}" (id=${pred.id})`);
      continue;
    }

    await resolvePrediction(pred, correctOption, io);
    resolvedCount += 1;
  }

  if (resolvedCount > 0) {
    const ballKey = `innings${innings}_over${overNumber}_balls`;
    const statsKey = `innings${innings}_over${overNumber}`;
    await match.update({
      scoreData: {
        ...((match.scoreData as Record<string, unknown>) || {}),
        [statsKey]: overStats,
        [ballKey]: extractOverBallChips(balls, overNumber, inningsStr),
      },
    });
  }

  return resolvedCount;
}

async function catchUpPreMatchPredictions(
  match: Match,
  fixture: any,
  allBalls: BallData[],
  io: SocketIOServer
): Promise<void> {
  const openPreMatch = await Prediction.findAll({
    where: { matchId: match.id, category: "pre_match", status: "open" },
  });

  for (const pred of openPreMatch) {
    await pred.update({ status: "locked" });
  }

  if (fixture.toss_won_team_id && fixture.elected) {
    const tossPreds = await Prediction.findAll({
      where: { matchId: match.id, category: "pre_match", status: ["open", "locked"] },
    });

    for (const pred of tossPreds) {
      if (!pred.question.toLowerCase().includes("toss")) continue;
      const correctOption = resolvePreMatchPrediction(pred, fixture, match, allBalls);
      if (correctOption) {
        await resolvePrediction(pred, correctOption, io);
      }
    }
  }

  const firstWicketPreds = await Prediction.findAll({
    where: { matchId: match.id, category: "pre_match", status: ["open", "locked"] },
  });
  const hasWicket = allBalls.some((b) => b.score?.is_wicket || b.score?.out || b.batsmanout_id);
  if (hasWicket) {
    for (const pred of firstWicketPreds) {
      if (!pred.question.toLowerCase().includes("first wicket")) continue;
      const correctOption = resolvePreMatchPrediction(pred, fixture, match, allBalls);
      if (correctOption) {
        await resolvePrediction(pred, correctOption, io);
      }
    }
  }
}

async function catchUpUnresolvedPredictions(
  match: Match,
  fixtureId: number,
  currentInnings: number,
  completedOverLimit: number,
  io: SocketIOServer
): Promise<number> {
  const unresolvedPredictions = await Prediction.findAll({
    where: {
      matchId: match.id,
      category: "per_over",
      status: ["open", "locked"],
    },
    order: [["round", "ASC"], ["overNumber", "ASC"], ["createdAt", "ASC"]],
  });

  const completedTargets = new Map<number, Set<number>>();
  for (const pred of unresolvedPredictions) {
    if (!isPredictionCompleted(pred, currentInnings, completedOverLimit)) continue;
    const innings = getPredictionInnings(pred);
    const over = pred.overNumber || 0;
    if (!completedTargets.has(innings)) {
      completedTargets.set(innings, new Set<number>());
    }
    completedTargets.get(innings)!.add(over);
  }

  if (completedTargets.size === 0) {
    return 0;
  }

  const liveFixture = await fetchLiveFixtureDetail(fixtureId, true);
  // Handle both {data:[]} and direct array formats from Sportsmonk
  const balls: BallData[] = liveFixture?.balls?.data || (Array.isArray(liveFixture?.balls) ? liveFixture.balls : []);
  if (balls.length === 0) {
    console.warn(`[Sportsmonk] No ball data available for catch-up on match ${match.id}`);
    return 0;
  }

  let resolvedCount = 0;
  for (const [innings, overs] of completedTargets.entries()) {
    for (const over of Array.from(overs).sort((a, b) => a - b)) {
      resolvedCount += await resolveOverPredictionsForOver(match, innings, over, balls, io);
    }
  }

  await catchUpPreMatchPredictions(match, liveFixture, balls, io);
  return resolvedCount;
}

async function resolveRemainingPredictionsAtMatchEnd(
  match: Match,
  fixture: any,
  runs: any[],
  allBalls: BallData[],
  io: SocketIOServer
): Promise<void> {
  const preMatchPreds = await Prediction.findAll({
    where: { matchId: match.id, category: "pre_match", status: ["open", "locked"] },
  });

  for (const pred of preMatchPreds) {
    const correctOption = resolvePreMatchPrediction(pred, fixture, match, allBalls);
    if (correctOption) {
      await resolvePrediction(pred, correctOption, io);
    }
  }

  const unresolvedOverPreds = await Prediction.findAll({
    where: { matchId: match.id, category: "per_over", status: ["open", "locked"] },
    order: [["round", "ASC"], ["overNumber", "ASC"]],
  });

  const completedTargets = new Map<number, Set<number>>();
  for (const pred of unresolvedOverPreds) {
    const innings = getPredictionInnings(pred);
    const over = pred.overNumber || 0;
    if (!completedTargets.has(innings)) {
      completedTargets.set(innings, new Set<number>());
    }
    completedTargets.get(innings)!.add(over);
  }

  for (const [innings, overs] of completedTargets.entries()) {
    for (const over of Array.from(overs).sort((a, b) => a - b)) {
      await resolveOverPredictionsForOver(match, innings, over, allBalls, io);
    }
  }

  const otherOpenPreds = await Prediction.findAll({
    where: { matchId: match.id, category: ["hot_take", "rivalry_call"], status: ["open", "locked"] },
  });

  for (const pred of otherOpenPreds) {
    const correctOption = resolveEndOfMatchPrediction(pred, fixture, match, runs, allBalls);
    if (correctOption) {
      await resolvePrediction(pred, correctOption, io);
    }
  }
}

// Fetch live scores
export async function fetchSportsmonkLiveScores(): Promise<any[]> {
  try {
    const url = `${API_BASE}/livescores?api_token=${getApiToken()}&include=balls,runs,localteam,visitorteam`;
    const res = await fetch(url, { headers: SPORTSMONK_HEADERS });
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
    const res = await fetch(url, { headers: SPORTSMONK_HEADERS });
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
function computeOverStats(balls: BallData[], overNumber: number, innings: string): OverStats {
  // Sportsmonk uses 0-indexed overs: over 1 = balls 0.1-0.6, over 2 = balls 1.1-1.6
  const overPrefix = (overNumber - 1).toString();
  const overBalls = balls.filter(
    (b) => b.scoreboard === innings && String(b.ball).split(".")[0] === overPrefix
  );

  let runs = 0;
  let extras = 0;
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

  const legalBalls = overBalls.filter((b) => b.score.ball); // only legal deliveries

  for (let i = 0; i < overBalls.length; i++) {
    const b = overBalls[i];
    const s = b.score;

    // s.runs = bat runs; extras (wides, noballs, byes, leg byes) are in separate fields
    const isWide = s.name?.toLowerCase().includes("wide");
    const extraRuns =
      (s.bye || 0) +
      (s.leg_bye || 0) +
      (s.noball > 0 ? 1 : 0) +
      (isWide ? 1 : 0);
    runs += getBallTotalRuns(b);
    extras += extraRuns;

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
    lastBallRuns = getBallTotalRuns(lastBall);
    lastBallWicket = lastBall.score.is_wicket || lastBall.batsmanout_id !== null;
  }

  // First legal ball
  if (legalBalls.length > 0) {
    const firstBall = legalBalls[0];
    firstBallBoundary = firstBall.score.four || firstBall.score.six;
  }

  return {
    runs,
    extras,
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
  };
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

// Cache ball data per match to detect umpire review changes
// Key: matchId, Value: Map of "S1-0.1" => { runs, is_wicket, four, six, noball, name }
const cachedBallData: Map<string, Map<string, { runs: number; is_wicket: boolean; four: boolean; six: boolean; noball: number; name?: string }>> = new Map();

// Concurrency guard — prevent overlapping polls
let isPolling = false;

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
      lastProcessedOver.set(match.id, await getTrackingSeed(match));
      console.log(`[Sportsmonk] Initialized tracking for ${match.team1Short} vs ${match.team2Short}: innings=${match.currentInnings}, over=${match.currentOver}`);
    }

    // Fast fetch: runs only (for score updates)
    const fixture = await fetchLiveFixtureDetail(fixtureId, false);
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

        const over1Preds = generatePerOverPredictions(match.id, 1, 1, "");
        for (const p of over1Preds) {
          await Prediction.create(p as any);
        }

        const hotTake = generateHotTake(match.id, 1, match.team1Short, match.team2Short);
        if (hotTake) {
          const hotTakeExpiresAt = new Date(Date.now() + 120_000);
          await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
        }

        // Toss detected: resolve the toss question immediately; the other 3 remain open until first ball
        const allPreMatch = await Prediction.findAll({
          where: { matchId: match.id, category: "pre_match" },
        });
        for (const pred of allPreMatch) {
          if (pred.question.toLowerCase().includes("toss")) {
            const correctOption = resolvePreMatchPrediction(pred, fixture, match, []);
            if (correctOption) {
              await resolvePrediction(pred, correctOption, io);
            } else {
              await pred.update({ status: "locked" });
            }
          }
        }
        io.emit("tossLocked", { matchId: match.id });
        console.log(`[Sportsmonk] Toss resolved; remaining pre-match questions stay open until first ball`);

        io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: 1 });
        io.emit("matchStarted", { matchId: match.id });

        console.log(`[Sportsmonk] Over 1 predictions live`);
      } else {
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
      ? Number(innings2Runs?.overs || 0)
      : Number(innings1Runs?.overs || 0);
    // rawOvers format: 5.0 = 5 overs complete (over 6 starting), 5.3 = 3 balls into over 6
    // Math.floor(rawOvers) + 1 correctly gives the CURRENT over being bowled in all cases
    const currentOver = rawOvers <= 0 ? 1 : Math.min(Math.floor(rawOvers) + 1, 20);
    const completedOverLimit = Math.max(currentOver - 1, 0);

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

    await match.update({
      currentInnings,
      currentOver,
      currentPhase: getPhase(currentInnings, currentOver) as any,
      scoreData: liveScore,
    });
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

    // === CATCH-UP RESOLVER: resolve any locked predictions for already-completed overs ===
    // This handles server restarts, missed polls, and over-transition edge cases
    try {
      const resolvedCount = await catchUpUnresolvedPredictions(
        match,
        fixtureId,
        currentInnings,
        completedOverLimit,
        io
      );
      if (resolvedCount > 0) {
        console.log(`[CatchUp] Resolved ${resolvedCount} missed per-over predictions for ${match.team1Short} vs ${match.team2Short}`);
      }
    } catch (catchUpErr) {
      console.error("[CatchUp] Error in catch-up resolver:", catchUpErr);
    }

    // Lock per-over predictions once a ball is bowled in the current over
    const currentInnRuns = currentInnings === 2 ? innings2Runs : innings1Runs;
    const prevScore = lastKnownScore.get(match.id);
    const nowScore = currentInnRuns ? currentInnRuns.score : 0;
    const nowWickets = currentInnRuns ? currentInnRuns.wickets : 0;
    const nowOvers = currentInnRuns ? currentInnRuns.overs : 0;

    // === BALL CHANGE DETECTION: detect umpire reviews / signal reversals ===
    // Only fetch ball data when we know score changed (to minimize API calls)
    if (prevScore && (nowScore !== prevScore.score || nowWickets !== prevScore.wickets || nowOvers !== prevScore.overs)) {
      try {
        const fixtureWithBalls = await fetchFixtureWithBalls(fixtureId);
        const currentBalls: BallData[] = fixtureWithBalls?.balls?.data || (Array.isArray(fixtureWithBalls?.balls) ? fixtureWithBalls.balls : []);

        if (currentBalls.length > 0) {
          const currentBallChips = extractOverBallChips(currentBalls, currentOver, currentInningsStr);
          const prevCache = cachedBallData.get(match.id);
          const newCache = new Map<string, { runs: number; is_wicket: boolean; four: boolean; six: boolean; noball: number; name?: string }>();
          const changedOvers = new Set<string>(); // "S1-3" format

          for (const b of currentBalls) {
            const key = `${b.scoreboard}-${b.ball}`;
            const ballInfo = {
              runs: b.score.runs,
              is_wicket: b.score.is_wicket || !!b.batsmanout_id,
              four: b.score.four,
              six: b.score.six,
              noball: b.score.noball || 0,
              name: b.score.name,
            };
            newCache.set(key, ballInfo);

            if (prevCache) {
              const prev = prevCache.get(key);
              if (prev && (
                prev.runs !== ballInfo.runs ||
                prev.is_wicket !== ballInfo.is_wicket ||
                prev.four !== ballInfo.four ||
                prev.six !== ballInfo.six ||
                prev.noball !== ballInfo.noball
              )) {
                const overPrefix = String(b.ball).split(".")[0];
                const overNumber = Number(overPrefix) + 1;
                changedOvers.add(`${b.scoreboard}-${overNumber}`);
                console.log(`[BallChange] ${match.team1Short} vs ${match.team2Short}: Ball ${key} changed — runs:${prev.runs}→${ballInfo.runs} wicket:${prev.is_wicket}→${ballInfo.is_wicket} four:${prev.four}→${ballInfo.four} six:${prev.six}→${ballInfo.six}`);
              }
            }
          }

          cachedBallData.set(match.id, newCache);

          if (currentBallChips.length > 0) {
            const liveBallKey = `innings${currentInnings}_over${currentOver}_balls`;
            const updatedScoreData: Record<string, unknown> = {
              ...(((match.scoreData as Record<string, unknown>) || {})),
              [liveBallKey]: currentBallChips,
            };

            await match.update({ scoreData: updatedScoreData });

            io.emit("scoreUpdate", {
              matchId: match.id,
              innings: currentInnings,
              over: currentOver,
              scoreData: updatedScoreData,
            });
          }

          // Re-resolve affected predictions for completed overs only
          if (changedOvers.size > 0) {
            let reResolved = 0;
            for (const overKey of changedOvers) {
              const [inningsStr, overNumStr] = overKey.split("-");
              const overNum = Number(overNumStr);
              // Only re-resolve already-completed overs (not the current in-progress over)
              if (overNum >= currentOver) continue;
              const overStats = computeOverStats(currentBalls, overNum, inningsStr);

              const affectedPreds = await Prediction.findAll({
                where: { matchId: match.id, category: "per_over", overNumber: overNum, status: "resolved" },
              });

              for (const pred of affectedPreds) {
                const newCorrectOption = resolveOverPredictionFromStats(pred, overStats);
                if (newCorrectOption && newCorrectOption !== pred.correctOption) {
                  const changed = await reResolvePrediction(pred, newCorrectOption, io);
                  if (changed) reResolved++;
                }
              }
            }
            if (reResolved > 0) {
              await recomputeParticipantScores({ matchId: match.id });
              console.log(`[BallChange] Re-resolved ${reResolved} predictions for ${match.team1Short} vs ${match.team2Short}`);
            }
          }
        }
      } catch (ballChangeErr) {
        console.error("[BallChange] Error in ball change detection:", ballChangeErr);
      }
    }

    // Use same formula as currentOver so "same over" detection is consistent
    const prevCurrentOver = !prevScore || prevScore.overs <= 0 ? 1 : Math.min(Math.floor(prevScore.overs) + 1, 20);
    if (prevScore && prevScore.innings === currentInnings && prevCurrentOver === currentOver) {
      // Same over — check if score/wickets/overs changed (ball was bowled)
      const ballBowled = nowScore !== prevScore.score || nowWickets !== prevScore.wickets || nowOvers !== prevScore.overs;
      if (ballBowled) {
        // Lock current over's predictions (e.g., Over 1 predictions lock when 1st ball of Over 1 is bowled)
        const currentRound = getCurrentRound(currentInnings, currentOver);
        const openOverPreds = await Prediction.findAll({
          where: {
            matchId: match.id,
            overNumber: currentOver,
            round: currentRound,
            category: "per_over",
            status: "open",
          },
        });
        if (openOverPreds.length > 0) {
          for (const pred of openOverPreds) {
            await pred.update({ status: "locked" });
          }
          io.emit("predictionsLocked", { matchId: match.id, overNumber: currentOver });
          console.log(`[Sportsmonk] Locked ${openOverPreds.length} predictions for over ${currentOver} (ball detected)`);
        }

        // Lock any remaining pre-match predictions if still open (fallback for edge cases)
        const openPreMatch = await Prediction.findAll({
          where: { matchId: match.id, category: "pre_match", status: "open" },
        });
        for (const pred of openPreMatch) {
          await pred.update({ status: "locked" });
        }
        if (openPreMatch.length > 0) {
          console.log(`[Sportsmonk] Locked ${openPreMatch.length} pre-match predictions (ball detected fallback)`);
        }

        // When 2nd innings starts (ball bowled in innings 2), lock all open rivalry_call
        if (currentInnings === 2 && prevScore.innings === 1) {
          const staleOpen = await Prediction.findAll({
            where: { matchId: match.id, category: ["rivalry_call", "pre_match"], status: "open" },
          });
          for (const pred of staleOpen) {
            await pred.update({ status: "locked" });
          }
          if (staleOpen.length > 0) {
            console.log(`[Sportsmonk] Locked ${staleOpen.length} rivalry_call/pre_match predictions (innings 2 started)`);
          }
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
      }
    }

    // First ball of innings 2 arrives on the same update that flips innings, so the
    // generic "same over" lock path above does not run for chase over 1.
    if (prevScore && prevScore.innings === 1 && currentInnings === 2) {
      // SportsMonk can expose the innings 2 score row at 0.0 during the break.
      // Only lock chase over 1 once innings 2 has actual ball progress.
      const innings2FirstBallBowled = nowOvers > 0;

      if (innings2FirstBallBowled) {
        const innings2Round1 = getCurrentRound(2, 1);
        const openInn2Over1Preds = await Prediction.findAll({
          where: {
            matchId: match.id,
            overNumber: 1,
            round: innings2Round1,
            category: "per_over",
            status: "open",
          },
        });

        if (openInn2Over1Preds.length > 0) {
          for (const pred of openInn2Over1Preds) {
            await pred.update({ status: "locked" });
          }
          io.emit("predictionsLocked", {
            matchId: match.id,
            overNumber: 1,
            round: innings2Round1,
          });
          console.log(
            `[Sportsmonk] Locked ${openInn2Over1Preds.length} predictions for innings 2 over 1 (first ball detected)`
          );
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
          const fullFixture = await fetchLiveFixtureDetail(fixtureId, true);
          const allBalls: BallData[] = fullFixture?.balls?.data || [];
          await resolveRemainingPredictionsAtMatchEnd(match, fixture, runs, allBalls, io);
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
          // 15 minutes — covers full IPL innings break; locked at first ball of innings 2
          const rivalryExpiresAt = new Date(Date.now() + 900_000);
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
        // Round 2 = "Total first innings score" (after R2/R3 swap)
        const hotTakePreds = await Prediction.findAll({
          where: { matchId: match.id, category: "hot_take", status: ["open", "locked"], round: 2 },
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
        // Round 3 = "Total boundaries in second innings" — resolved at match end (needs S2 data)

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

        // Resolve all remaining 1st innings per-over predictions at innings break
        try {
          const fixtureWithBalls = await fetchFixtureWithBalls(fixtureId);
          const balls: BallData[] = fixtureWithBalls?.balls?.data || (Array.isArray(fixtureWithBalls?.balls) ? fixtureWithBalls.balls : []);

          // Sweep ALL unresolved 1st innings predictions (rounds 1-3), not just the last over
          // Status must include "locked" — ball detection locks them before innings break fires
          const allInn1Preds = await Prediction.findAll({
            where: { matchId: match.id, category: "per_over", round: [1, 2, 3], status: ["open", "locked"] },
          });

          if (allInn1Preds.length > 0) {
            // Lock any still-open ones first
            for (const pred of allInn1Preds) {
              if (pred.status === "open") await pred.update({ status: "locked" });
            }
            io.emit("predictionsLocked", { matchId: match.id, type: "innings1_all" });

            for (const pred of allInn1Preds) {
              const overNum = pred.overNumber || 0;
              if (overNum <= 0) continue;
              const overStats = computeOverStats(balls, overNum, "S1");
              const correctOption = resolveOverPredictionFromStats(pred, overStats);
              if (correctOption) {
                await resolvePrediction(pred, correctOption, io);
              } else {
                console.warn(`[Sportsmonk] Inn-break: could not resolve "${pred.question}" (id=${pred.id})`);
              }
            }
            console.log(`[Sportsmonk] Innings break: resolved ${allInn1Preds.length} 1st innings predictions`);
          }
        } catch (err) {
          console.error("[Sportsmonk] Error resolving innings 1 predictions at innings break:", err);
        }

        // Update tracking so over-completion block doesn't re-run
        lastProcessedOver.set(match.id, {
          innings: currentInnings,
          over: currentOver,
          resolved: Math.max(lastProcessed.resolved || 0, lastProcessed.over),
        });

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
        // Catch-up: resolve round 2 hot takes (1st innings score) by round number
        const round2HotTakes = await Prediction.findAll({
          where: { matchId: match.id, category: "hot_take", status: ["open", "locked"], round: 2 },
        });
        for (const pred of round2HotTakes) {
          const score = innings1Runs.score;
          let correctOption: string;
          if (score < 150) correctOption = "low";
          else if (score <= 175) correctOption = "par";
          else if (score <= 200) correctOption = "high";
          else correctOption = "massive";
          await resolvePrediction(pred, correctOption, io);
          console.log(`[Sportsmonk] Catch-up resolved: "${pred.question}" → ${correctOption}`);
        }
        // Round 3 hot take ("Total boundaries in second innings") needs S2 data — resolved at match end
        // Catch-up: resolve round 1 hot takes (powerplay first 3 vs last 3)
        const round1HotTakes = await Prediction.findAll({
          where: { matchId: match.id, category: "hot_take", status: "open", round: 1 },
        });
        for (const pred of round1HotTakes) {
          const fullFixture = await fetchFixtureWithBalls(fixtureId);
          const allBalls: BallData[] = fullFixture?.balls?.data || [];
          let first3 = 0, last3 = 0;
          for (const b of allBalls) {
            if (b.scoreboard !== "S1") continue;
            const overIdx = Math.floor(b.ball);
            const ballRuns = getBallTotalRuns(b);
            if (overIdx < 3) first3 += ballRuns;
            else if (overIdx < 6) last3 += ballRuns;
          }
    const correctOption =
      first3 > last3 ? "first_3" : last3 > first3 ? "last_3" : ALL_CORRECT_OPTION;
    await resolvePrediction(pred, correctOption, io);
          console.log(`[Sportsmonk] Catch-up resolved: "${pred.question}" → ${correctOption}`);
        }
      }
    }

    // === Over-completion logic: resolve predictions & generate new ones ===
    // Skip if innings just changed — that's handled in the innings break block above
    if (!inningsJustChanged && (currentOver > lastProcessed.over || currentInnings > lastProcessed.innings)) {
      try {
        const completedOver = currentInnings > lastProcessed.innings
          ? lastProcessed.over // last over of previous innings
          : currentOver - 1;

        if (completedOver > 0) {
          console.log(`[Sportsmonk] Over ${completedOver} completed — fetching ball-by-ball data...`);

          // Slow fetch: get ball-by-ball data only when an over completes
          const fixtureWithBalls = await fetchLiveFixtureDetail(fixtureId, true);
          const balls: BallData[] = fixtureWithBalls?.balls?.data || (Array.isArray(fixtureWithBalls?.balls) ? fixtureWithBalls.balls : []);

          const prevInningsStr = currentInnings > lastProcessed.innings ? "S1" : currentInningsStr;
          const overStats = computeOverStats(balls, completedOver, prevInningsStr);

          // Store ball chips for the completed over in scoreData
          const ballChips = extractOverBallChips(balls, completedOver, prevInningsStr);
          const inningsNum = prevInningsStr === "S1" ? 1 : 2;
          const ballKey = `innings${inningsNum}_over${completedOver}_balls`;
          await match.update({
            scoreData: {
              ...(match.scoreData as Record<string, unknown> || {}),
              [ballKey]: ballChips,
            },
          });

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
            const correctOption = resolveOverPredictionFromStats(pred, overStats);
            if (correctOption) {
              await resolvePrediction(pred, correctOption, io);
            } else {
              console.warn(`[Sportsmonk] Could not resolve prediction "${pred.question}" (id=${pred.id}) — no matching rule`);
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

          // Update match state + store over stats for catch-up resolution
          const newPhase = getPhase(currentInnings, currentOver);
          const statsKey = `innings${inningsNum}_over${completedOver}`;
          await match.update({
            currentOver,
            currentInnings,
            currentPhase: newPhase as any,
            scoreData: {
              ...(match.scoreData as Record<string, unknown> || {}),
              [statsKey]: overStats,
              [ballKey]: ballChips,
            },
          });

          // Re-emit scoreUpdate with updated scoreData (includes ball chips now)
          io.emit("scoreUpdate", {
            matchId: match.id,
            innings: currentInnings,
            over: currentOver,
            scoreData: match.scoreData,
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

      // Update tracking
      lastProcessedOver.set(match.id, {
        innings: currentInnings,
        over: currentOver,
        resolved: Math.max(lastProcessed.resolved || 0, completedOverLimit),
      });
    }
  }
}

// Convert raw BallData for an over into displayable ball chips
function extractOverBallChips(balls: BallData[], overNumber: number, innings: string): { label: string; type: string }[] {
  const overPrefix = (overNumber - 1).toString();
  const overBalls = balls.filter(
    (b) => b.scoreboard === innings && String(b.ball).split(".")[0] === overPrefix
  );

  return overBalls.map((b) => {
    const s = b.score;
    const isWide = s.name?.toLowerCase().includes("wide");
    const isNoball = s.noball > 0 || s.noball_runs > 0;

    if (s.is_wicket || b.batsmanout_id) return { label: "W", type: "wicket" };
    if (isWide) {
      const extra = s.runs > 0 ? `wd+${s.runs}` : "wd";
      return { label: extra, type: "wide" };
    }
    if (isNoball) {
      const extra = s.runs > 0 ? `nb+${s.runs}` : "nb";
      return { label: extra, type: "noball" };
    }
    if (s.leg_bye > 0) return { label: `lb${s.leg_bye}`, type: "extra" };
    if (s.bye > 0) return { label: `b${s.bye}`, type: "extra" };
    if (s.six) return { label: "6", type: "six" };
    if (s.four) return { label: "4", type: "boundary" };
    if (s.runs === 0) return { label: "•", type: "dot" };
    return { label: String(s.runs), type: "runs" };
  });
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

  if (q.includes("more than 2 boundaries")) {
    return stats.boundaries > 2 ? "yes" : "no";
  }

  if (q.includes("maiden")) {
    // A maiden = 0 runs conceded including extras (wides/noballs break a maiden)
    return (stats.runs === 0 && stats.wides === 0 && stats.noballs === 0) ? "yes" : "no";
  }

  if (q.includes("how many extras")) {
    if (stats.extras === 0) return "none";
    if (stats.extras <= 2) return "one_two";
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
  if (scope.matchId) {
    matchWhere.id = scope.matchId;
  }

  const matches = await Match.findAll({
    where: matchWhere,
    order: [["updatedAt", "DESC"]],
  });

  let predictionsChecked = 0;
  let predictionsCorrected = 0;
  let participantsRecomputed = 0;
  let userPredictionsRecomputed = 0;
  const io = createNoopIo();

  for (const match of matches) {
    if (!match.externalId) continue;

    const fixtureId = Number(match.externalId);
    if (!Number.isFinite(fixtureId)) continue;

    const fullFixture = await fetchLiveFixtureDetail(fixtureId, true);
    const allBalls: BallData[] = fullFixture?.balls?.data || [];
    if (allBalls.length === 0) {
      console.warn(
        `[Sportsmonk Repair] Skipping match ${match.id} (${match.externalId}) because no ball-by-ball data was returned`
      );
      continue;
    }

    // Include resolved predictions so we can detect and fix incorrect evaluations
    const allPredictions = await Prediction.findAll({
      where: {
        matchId: match.id,
        category: "per_over",
        status: ["open", "locked", "resolved"],
      },
      order: [["round", "ASC"], ["overNumber", "ASC"], ["createdAt", "ASC"]],
    });

    const unresolvedPredictions = allPredictions.filter((p) => p.status !== "resolved");
    const resolvedPredictions = allPredictions.filter((p) => p.status === "resolved");

    // Resolve unresolved predictions as before
    const targets = new Map<number, Set<number>>();
    for (const pred of unresolvedPredictions) {
      predictionsChecked += 1;
      const innings = getPredictionInnings(pred);
      const over = pred.overNumber || 0;
      if (!targets.has(innings)) {
        targets.set(innings, new Set<number>());
      }
      targets.get(innings)!.add(over);
    }

    let correctedThisMatch = 0;
    for (const [innings, overs] of targets.entries()) {
      for (const over of Array.from(overs).sort((a, b) => a - b)) {
        correctedThisMatch += await resolveOverPredictionsForOver(match, innings, over, allBalls, io);
      }
    }

    // Re-check resolved predictions for changed ball data
    for (const pred of resolvedPredictions) {
      predictionsChecked += 1;
      const innings = getPredictionInnings(pred);
      const over = pred.overNumber || 0;
      if (over <= 0) continue;
      const inningsStr = innings === 1 ? "S1" : "S2";
      const overStats = computeOverStats(allBalls, over, inningsStr);
      const newCorrectOption = resolveOverPredictionFromStats(pred, overStats);
      if (newCorrectOption && newCorrectOption !== pred.correctOption) {
        const changed = await reResolvePrediction(pred, newCorrectOption, io);
        if (changed) {
          correctedThisMatch += 1;
          console.log(`[Sportsmonk Repair] Re-resolved prediction ${pred.id}: "${pred.question}" from "${pred.correctOption}" to "${newCorrectOption}"`);
        }
      }
    }

    predictionsCorrected += correctedThisMatch;

    if (correctedThisMatch > 0) {
      const summary = await recomputeParticipantScores({ matchId: match.id });
      participantsRecomputed += summary.participantsRecomputed;
      userPredictionsRecomputed += summary.userPredictionsRecomputed;
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
  // Q1: "Who wins tonight?"
  if (q.includes("who wins") && !q.includes("toss")) {
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

  // Q2: "Toss time — who wins and what do they pick?"
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

  // Q3: "Which team hits more sixes?"
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
    const hasTieOption = prediction.options.some((option) => option.key === "tie");

    if (inn1TeamId === fixture.localteam_id) {
      // team1 batted first (S1), team2 batted second (S2)
      if (team1Sixes > team2Sixes) return match.team1Short.toLowerCase();
      if (team2Sixes > team1Sixes) return match.team2Short.toLowerCase();
      return hasTieOption ? "tie" : null;
    } else {
      // team2 batted first (S1), team1 batted second (S2)
      if (team2Sixes > team1Sixes) return match.team1Short.toLowerCase();
      if (team1Sixes > team2Sixes) return match.team2Short.toLowerCase();
      return hasTieOption ? "tie" : null;
    }
  }

  // Q4: "First wicket — how does it fall?"
  if (q.includes("first wicket")) {
    // Find the first ball with a wicket
    const wicketBall = allBalls.find((b) => b.score?.is_wicket || b.score?.out || b.batsmanout_id);
    if (!wicketBall) return null;

    console.log("[Sportsmonk] First wicket raw dismissal:", {
      scoreName: wicketBall.score?.name || null,
      scoreboard: wicketBall.scoreboard,
      ball: wicketBall.ball,
      batsmanOutId: wicketBall.batsmanout_id,
    });

    return resolveDismissalType(wicketBall.score?.name);
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
    return inn2.overs > 19 ? "yes" : "no";
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

  // "More runs in the powerplay — first 3 overs or last 3?"
  if (q.includes("powerplay") && q.includes("first 3")) {
    let first3 = 0, last3 = 0;
    for (const b of allBalls) {
      if (b.scoreboard !== "S1") continue;
      const overIdx = Math.floor(b.ball);
      const ballRuns = getBallTotalRuns(b);
      if (overIdx < 3) first3 += ballRuns;
      else if (overIdx < 6) last3 += ballRuns;
    }
    return first3 > last3 ? "first_3" : last3 > first3 ? "last_3" : ALL_CORRECT_OPTION;
  }

  // "Biggest over in the death — how many runs?"
  if (q.includes("biggest over in the death")) {
    let maxOverRuns = 0;
    for (let ov = 16; ov <= 20; ov++) {
      let overRuns = 0;
      const prefix = String(ov - 1);
      for (const b of allBalls) {
        if (b.scoreboard !== "S2") continue;
        if (String(b.ball).split(".")[0] === prefix) {
          overRuns += getBallTotalRuns(b);
        }
      }
      maxOverRuns = Math.max(maxOverRuns, overRuns);
    }
    if (maxOverRuns < 10) return "under_10";
    if (maxOverRuns <= 15) return "10_15";
    if (maxOverRuns <= 20) return "16_20";
    return "20_plus";
  }

  // "Total boundaries in the second innings"
  if (q.includes("total boundaries in the second innings")) {
    const s2Balls = allBalls.filter((b) => b.scoreboard === "S2");
    let boundaries = 0;
    for (const b of s2Balls) {
      if (b.score?.four || b.score?.six) boundaries++;
    }
    if (boundaries < 10) return "under_10";
    if (boundaries <= 20) return "10_20";
    if (boundaries <= 30) return "20_30";
    return "30_plus";
  }

  // "How many runs in the chase powerplay?"
  if (q.includes("chase powerplay")) {
    let ppRuns = 0;
    for (const b of allBalls) {
      if (b.scoreboard !== "S2") continue;
      if (Math.floor(b.ball) < 6) ppRuns += getBallTotalRuns(b);
    }
    if (ppRuns < 30) return "under_30";
    if (ppRuns <= 45) return "30_45";
    if (ppRuns <= 60) return "45_60";
    return "60_plus";
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
