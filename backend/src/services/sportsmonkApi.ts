import { Op } from "sequelize";
import { Match, Prediction, MatchParticipant } from "../models";
import { generatePerOverPredictions, generateHotTake, generatePlayerHotTake, generateRivalryCalls, getCurrentRound, generatePlayerPreMatchQuestions, generatePreMatchPredictions } from "./predictionEngine";
import { ensurePunterCard, punterOpensAt, resolvePunterCard, resolvePunterCardEarly, computeCorrectFromBalls, resolveSquadPool } from "./punterCard";
import { computeLivePlayerCorrectOption } from "./livePlayerTracker";
import {
  ALL_CORRECT_OPTION,
  resolvePrediction,
  reResolvePrediction,
  generateRoundRewards,
  recomputeParticipantScores,
} from "./pointsEngine";
import { overStatsToContext } from "./feedback";
import { Server as SocketIOServer } from "socket.io";

// Sportsmonk API base. Env-driven so local simulation can point at a mock
// server: set SPORTSMONK_API_BASE=http://localhost:5001. Resolved at call
// time so dotenv loads first.
const getApiBase = () => process.env.SPORTSMONK_API_BASE || "https://cricket.sportmonks.com/api/v2.0";
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
    const url = `${getApiBase()}/teams/${teamId}?api_token=${getApiToken()}`;
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

interface BatsmanOverStats {
  runs: number;
  sixes: number;
  boundaries: number;
  isOut: boolean;
}

interface BowlerOverStats {
  runs: number;
  wickets: number;
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
  currentBowler: string;
  batsmanStats: Record<string, BatsmanOverStats>;
  bowlerStats: Record<string, BowlerOverStats>;
}

// Fetch fixture lineup (Playing XI) — available after toss
async function fetchFixtureLineup(fixtureId: number): Promise<any[]> {
  try {
    const url = `${getApiBase()}/fixtures/${fixtureId}?api_token=${getApiToken()}&include=lineup`;
    const res = await fetch(url, { headers: SPORTSMONK_HEADERS });
    const data: any = await res.json();
    return data.data?.lineup || [];
  } catch (error) {
    console.error("[Sportsmonk] Lineup fetch error:", error);
    return [];
  }
}

// Fetch fixture with runs only (fast — for score updates)
async function fetchFixtureWithRuns(fixtureId: number): Promise<any> {
  try {
    const url = `${getApiBase()}/fixtures/${fixtureId}?api_token=${getApiToken()}&include=runs`;
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
    const url = `${getApiBase()}/fixtures/${fixtureId}?api_token=${getApiToken()}&include=balls,runs`;
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
      const url = `${getApiBase()}/livescores?api_token=${getApiToken()}&include=${include}&${filter}`;
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

// Public alias used by the livePlayerTracker service (kept as a thin wrapper
// so the tracker doesn't cross-import private helpers).
export async function fetchLiveFixtureForTracker(
  fixtureId: number,
  includeBalls = true
): Promise<any | null> {
  return fetchLiveFixtureDetail(fixtureId, includeBalls);
}

// Last-good fixture cache. When Sportsmonk hiccups (returns nothing for a
// few minutes — happens regularly on the cricket plan), we serve the most
// recent good response so the rest of the app keeps moving. Capped at 60s
// of staleness for "withRuns" (fast lane) and 30s for "withBalls" (the
// tracker pass) — beyond that we'd risk acting on data that's drifted too
// far from reality.
const lastGoodFixture: Map<string, { at: number; data: any }> = new Map();
const STALE_OK_MS_RUNS = 60_000;
const STALE_OK_MS_BALLS = 30_000;

// Reduce log spam: at most one "no fixture data" line per fixture per minute.
const lastNoDataLogAt: Map<number, number> = new Map();
const NO_DATA_LOG_INTERVAL_MS = 60_000;

function maybeLogNoData(fixtureId: number): void {
  const now = Date.now();
  const last = lastNoDataLogAt.get(fixtureId) || 0;
  if (now - last < NO_DATA_LOG_INTERVAL_MS) return;
  lastNoDataLogAt.set(fixtureId, now);
  console.log(`[Sportsmonk] No fixture data for ${fixtureId} (will retry; further misses suppressed for 60s)`);
}

// Cached unfiltered /livescores response. Used as a final fallback when the
// per-fixture and filter-based endpoints both come up empty — Sportsmonk's
// cricket plan often refuses filter[fixture]=… queries but still returns the
// fixture in the unfiltered livescores list. 5s cache is enough to avoid
// hammering /livescores when multiple matches are being polled in the same
// tick, while staying fresh enough to capture mid-over score changes.
const UNFILTERED_LIVESCORES_CACHE_MS = 5_000;
let unfilteredLivescoresCache: { at: number; promise: Promise<any[]> } | null = null;

async function getCachedUnfilteredLivescores(): Promise<any[]> {
  const now = Date.now();
  if (unfilteredLivescoresCache && now - unfilteredLivescoresCache.at < UNFILTERED_LIVESCORES_CACHE_MS) {
    return unfilteredLivescoresCache.promise;
  }
  const promise = fetchSportsmonkLiveScores().catch((err) => {
    console.error("[Sportsmonk] unfiltered livescores fetch failed:", err);
    return [] as any[];
  });
  unfilteredLivescoresCache = { at: now, promise };
  return promise;
}

async function fetchLiveFixtureDetail(
  fixtureId: number,
  includeBalls = false
): Promise<any | null> {
  const cacheKey = `${fixtureId}:${includeBalls ? "balls" : "runs"}`;
  const staleOkMs = includeBalls ? STALE_OK_MS_BALLS : STALE_OK_MS_RUNS;

  if (includeBalls) {
    const fixture = await fetchFixtureWithBalls(fixtureId);
    const ballCount = fixture?.balls?.data?.length || (Array.isArray(fixture?.balls) ? fixture.balls.length : 0);
    if (fixture && ballCount > 0) {
      lastGoodFixture.set(cacheKey, { at: Date.now(), data: fixture });
      return fixture;
    }
  } else {
    const fixture = await fetchFixtureWithRuns(fixtureId);
    const runCount = fixture?.runs?.data?.length || (Array.isArray(fixture?.runs) ? fixture.runs.length : 0);
    if (fixture && runCount > 0) {
      lastGoodFixture.set(cacheKey, { at: Date.now(), data: fixture });
      return fixture;
    }
  }

  const include = includeBalls ? "balls,runs" : "runs";
  const liveFixture = await fetchFixtureFromLivescores(fixtureId, include);
  if (liveFixture) {
    lastGoodFixture.set(cacheKey, { at: Date.now(), data: liveFixture });
    return liveFixture;
  }

  const lastResort = includeBalls
    ? await fetchFixtureWithBalls(fixtureId)
    : await fetchFixtureWithRuns(fixtureId);
  if (lastResort) {
    // Don't cache a totally-empty payload, but return it so callers fall through
    return lastResort;
  }

  // Final fallback: scan the unfiltered /livescores response. This is the
  // path that actually works on the cricket plan when /fixtures/{id} and
  // /livescores?filter[fixture]={id} both come up empty for currently-live
  // matches. fetchSportsmonkLiveScores already includes balls + runs, so the
  // payload shape matches what callers expect.
  try {
    const allLive = await getCachedUnfilteredLivescores();
    const found = allLive.find((f: any) => Number(f.id) === fixtureId);
    if (found) {
      const ballCount = found?.balls?.data?.length || (Array.isArray(found?.balls) ? found.balls.length : 0);
      const runCount = found?.runs?.data?.length || (Array.isArray(found?.runs) ? found.runs.length : 0);
      // Only cache if the payload actually carries the data this caller
      // asked for; an empty-balls payload from livescores would otherwise
      // poison the cache for the next 30s of "balls" requests.
      const useful = includeBalls ? ballCount > 0 : (runCount > 0 || ballCount > 0);
      if (useful) {
        lastGoodFixture.set(cacheKey, { at: Date.now(), data: found });
      }
      return found;
    }
  } catch (err) {
    console.error("[Sportsmonk] livescores scan failed:", err);
  }

  // Sportsmonk gave us nothing on every path. Serve last-good if recent.
  const cached = lastGoodFixture.get(cacheKey);
  if (cached && Date.now() - cached.at < staleOkMs) {
    return cached.data;
  }

  maybeLogNoData(fixtureId);
  return null;
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
  const round = getCurrentRound(innings, overNumber, match.totalOvers);
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

    await resolvePrediction(pred, correctOption, io, overStatsToContext(overStats));
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

export async function resolveRemainingPredictionsAtMatchEnd(
  match: Match,
  fixture: any,
  runs: any[],
  allBalls: BallData[],
  io: SocketIOServer
): Promise<void> {
  // Skip auto-resolution for abandoned/no-result matches
  const fixtureStatus = (fixture.status || "").toLowerCase();
  if (fixtureStatus === "abandoned" || fixtureStatus === "cancelled" || fixtureStatus === "no result" || fixtureStatus === "postp.") {
    console.log(`[Sportsmonk] Match ${match.id} was ${fixture.status} — skipping auto-resolution, leaving for admin`);
    return;
  }

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

  // Live-player innings questions (per_over rows with subjectType set) are
  // normally resolved by livePlayerTracker on innings-end during the live
  // poll. If the poll missed the window — match ended between ticks, the
  // bowler/batter never appeared in a generated bowled-balls map, status
  // jumped straight to Finished — they stay PENDING forever. Walk them
  // here as a final safety net.
  const livePlayerOpen = await Prediction.findAll({
    where: {
      matchId: match.id,
      category: "per_over",
      subjectType: { [Op.in]: ["batsman_innings", "bowler_innings", "bowler_innings_wkts", "batsman_sixes"] },
      status: ["open", "locked"],
    },
  });
  for (const pred of livePlayerOpen) {
    const correctOption = computeLivePlayerCorrectOption(pred, allBalls);
    if (correctOption) {
      await resolvePrediction(pred, correctOption, io);
    }
  }
}

// Fetch live scores
export async function fetchSportsmonkLiveScores(): Promise<any[]> {
  try {
    const url = `${getApiBase()}/livescores?api_token=${getApiToken()}&include=balls,runs,localteam,visitorteam`;
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
    const baseUrl = `${getApiBase()}/fixtures?filter[starts_between]=${today},${today}&api_token=${getApiToken()}&include=runs,localteam,visitorteam`;
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
    const baseUrl = `${getApiBase()}/fixtures?filter[starts_between]=${today},${futureDate}&api_token=${getApiToken()}&include=localteam,visitorteam,runs`;
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
export function computeOverStats(balls: BallData[], overNumber: number, innings: string): OverStats {
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
  let currentBowler = "";
  const batsmanStats: Record<string, BatsmanOverStats> = {};
  const bowlerStats: Record<string, BowlerOverStats> = {};

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
    const ballTotalRuns = getBallTotalRuns(b);
    runs += ballTotalRuns;
    extras += extraRuns;

    if (s.is_wicket || b.batsmanout_id) wickets++;
    if (s.six) { sixes++; boundaries++; }
    else if (s.four) { boundaries++; }
    if (s.runs === 0 && extraRuns === 0 && !s.is_wicket && s.ball) dots++;
    if (isWide) wides++;
    if (s.noball > 0 || s.noball_runs > 0) noballs++;

    currentBatsman = b.batsman?.fullname || currentBatsman;
    currentBowler = b.bowler?.fullname || currentBowler;

    // Track per-batsman stats
    const batName = b.batsman?.fullname;
    if (batName) {
      if (!batsmanStats[batName]) {
        batsmanStats[batName] = { runs: 0, sixes: 0, boundaries: 0, isOut: false };
      }
      batsmanStats[batName].runs += s.runs || 0;
      if (s.six) batsmanStats[batName].sixes++;
      if (s.four || s.six) batsmanStats[batName].boundaries++;
      if ((s.is_wicket || b.batsmanout_id) && b.batsmanout_id === b.batsman_id) {
        batsmanStats[batName].isOut = true;
      }
    }

    // Track per-bowler stats
    const bowlName = b.bowler?.fullname;
    if (bowlName) {
      if (!bowlerStats[bowlName]) {
        bowlerStats[bowlName] = { runs: 0, wickets: 0 };
      }
      bowlerStats[bowlName].runs += ballTotalRuns;
      if (s.is_wicket || b.batsmanout_id) {
        // Don't count run outs as bowler wickets
        const dismissal = resolveDismissalType(s.name);
        if (dismissal !== "run_out") {
          bowlerStats[bowlName].wickets++;
        }
      }
    }
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
    currentBowler,
    batsmanStats,
    bowlerStats,
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
const lastProcessedOver: Map<string, { innings: number; over: number; resolved: number; inn1Resolved?: boolean }> = new Map();

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

// Throttle: scan today's Sportsmonk fixtures for missing imports at most
// once every 30 minutes. Cron-like daily-at-midnight is the product intent;
// the 30-minute floor just covers backend restarts so a freshly-booted
// process still discovers today's fixtures within half an hour.
let lastTodayImportScanAt = 0;
const TODAY_IMPORT_SCAN_INTERVAL_MS = 30 * 60_000;

/**
 * Discover today's IPL fixtures on Sportsmonk and create local Match rows for
 * any that aren't yet in our DB. This is what makes the Punter Card hook +
 * the lobby's "Open Punter Card" button work for matches users haven't
 * tapped JOIN on yet — the card needs a real `Match` row to attach to.
 */
async function autoImportTodayFixtures(): Promise<void> {
  if (Date.now() - lastTodayImportScanAt < TODAY_IMPORT_SCAN_INTERVAL_MS) return;
  lastTodayImportScanAt = Date.now();

  try {
    const fixtures = await fetchTodayFixtures();
    if (fixtures.length === 0) return;

    for (const fixture of fixtures) {
      const fixtureId = String(fixture.id);
      const existing = await Match.findOne({ where: { externalId: fixtureId } });
      if (existing) continue;

      try {
        const team1 = await fetchTeamData(fixture.localteam_id);
        const team2 = await fetchTeamData(fixture.visitorteam_id);
        const fStatus =
          fixture.status === "Finished" ? "completed" :
          fixture.status === "NS" ? "upcoming" : "live";
        const match = await Match.create({
          externalId: fixtureId,
          team1: team1.name,
          team2: team2.name,
          team1Short: team1.code || "T1",
          team2Short: team2.code || "T2",
          team1Players: [],
          team2Players: [],
          startTime: new Date(fixture.starting_at),
          status: fStatus as any,
          scoreData: {
            venue: fixture.venue_id,
            team1Img: team1.image_path || "",
            team2Img: team2.image_path || "",
          } as any,
        });

        // Mirror the import endpoint's pre-match question setup so users can
        // play the 4 team-level questions T-45 onwards. Player questions
        // are added later at toss when the lineup arrives.
        const preMatchQuestions = generatePreMatchPredictions(
          match.id, match.team1, match.team2,
          match.team1Short, match.team2Short,
          match.team1Players, match.team2Players
        );
        for (const q of preMatchQuestions) {
          await Prediction.create(q as any);
        }
        if (match.startTime) {
          const opensAt = new Date(new Date(match.startTime).getTime() - 45 * 60_000);
          await Prediction.update(
            { opensAt },
            { where: { matchId: match.id, category: "pre_match" } }
          );
        }

        console.log(`[AutoImport] ${match.team1Short} vs ${match.team2Short} imported (today fixture)`);
      } catch (err) {
        console.error(`[AutoImport] Failed to import fixture ${fixtureId}:`, err);
      }
    }
  } catch (err) {
    console.error("[AutoImport] Today scan error:", err);
  }
}

// Match-end flow extracted so it can be triggered both from Sportsmonk's
// "Finished" status and from our own end-of-match detection (target chased
// etc.). Idempotent: bails out if status is already "completed".
async function finalizeMatch(
  match: Match,
  fixture: any,
  fixtureId: number,
  runs: any[],
  io: SocketIOServer
): Promise<void> {
  if (match.status === "completed") return;
  await match.update({ status: "completed", currentPhase: "completed" as any });

  // Pull full fixture + balls once; both resolvers below need them. The
  // Punter Card resolver in particular CANNOT trust match.scoreData (its
  // batsmen/bowlers fields are never reliably populated by the poll), so we
  // pass raw balls + fixture metadata through and let it compute everything
  // from there.
  let fullFixture: any = null;
  let allBalls: BallData[] = [];
  try {
    fullFixture = await fetchLiveFixtureDetail(fixtureId, true);
    allBalls = fullFixture?.balls?.data || [];
  } catch (err) {
    console.error("[Sportsmonk] Failed to fetch full fixture for match-end:", err);
  }

  // Resolve pre-match + per-over + hot-take + rivalry predictions.
  try {
    await resolveRemainingPredictionsAtMatchEnd(match, fullFixture || fixture, runs, allBalls, io);
  } catch (resolveErr) {
    console.error("[Sportsmonk] Error resolving predictions at match-end:", resolveErr);
  }

  // Resolve Punter Card questions — feed the fixture (for winner/toss/MoM
  // ids) + balls (for batsman/bowler stats).
  try {
    const r = await resolvePunterCard(match.id, fullFixture || fixture, allBalls);
    if (r.resolved > 0) console.log(`[PunterCard] Resolved ${r.resolved} questions for ${match.id}`);
  } catch (err) {
    console.error("[PunterCard] resolve error:", err);
  }

  // Generate final-round + grand-prize rewards per venue.
  const venues = await MatchParticipant.findAll({
    where: { matchId: match.id },
    attributes: ["venueId"],
    group: ["venueId"],
  });
  for (const v of venues) {
    await generateRoundRewards(match.id, v.venueId, 6, io);
    await generateRoundRewards(match.id, v.venueId, 0, io);
  }

  // Close any active rooms for this match.
  try {
    const { Room } = await import("../models");
    await Room.update({ status: "closed" }, { where: { matchId: match.id, status: "active" } });
  } catch (err) {
    console.error("[Sportsmonk] Room close error:", err);
  }

  io.to(`match:${match.id}`).emit("matchEnd", { matchId: match.id, winner: fixture.winner_team_id });
  console.log(`[Sportsmonk] Match ${match.id} ended — all predictions resolved`);
}

// Sportsmonk's `score.four` / `score.six` boolean flags are inconsistent
// across plans / fixtures — sometimes they're missing on legitimate
// boundaries. Fall back to the runs-on-the-ball value, but only if no
// extras are involved (otherwise a "5 off a no-ball + bye" would count).
export function isFour(b: any): boolean {
  const s = b?.score || {};
  if (s.four === true) return true;
  if (Number(s.runs) !== 4) return false;
  return !Number(s.bye || 0) && !Number(s.leg_bye || 0) && !Number(s.noball_runs || 0);
}
export function isSix(b: any): boolean {
  const s = b?.score || {};
  if (s.six === true) return true;
  if (Number(s.runs) !== 6) return false;
  return !Number(s.bye || 0) && !Number(s.leg_bye || 0) && !Number(s.noball_runs || 0);
}

// Wipes existing resolutions on a finished match and runs every resolver
// (per-over, hot-take, rivalry, pre-match, punter card) again from raw
// fixture + balls — then recomputes participant totals so leaderboards
// reflect the new outcomes. Call after shipping resolver fixes to repair
// matches that were resolved with the old buggy logic.
// Equality check that's tolerant of comma-joined multi-winner correctOptions
// (so "donovan,parag" matches "parag,donovan" and counts as unchanged).
function correctOptionEquivalent(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const norm = (s: string) =>
    Array.from(new Set(s.split(",").map((x) => x.trim()).filter(Boolean))).sort().join(",");
  return norm(a) === norm(b);
}

// Pure dispatcher that returns the would-be correctOption for a prediction
// without mutating any row. Returns null when the resolver can't determine
// (insufficient data / unsupported category) — caller should treat null as
// "skip, leave existing alone" so a wiped Sportsmonk fixture can't destroy
// previously-stamped answers.
function computeCorrectOptionForPrediction(
  prediction: Prediction,
  match: Match,
  fixture: any,
  runs: any[],
  allBalls: BallData[],
  pool: Awaited<ReturnType<typeof resolveSquadPool>> = null,
): string | null {
  switch (prediction.category) {
    case "punter_card": {
      const tk = (prediction as any).templateKey;
      if (!tk) return null;
      return computeCorrectFromBalls(
        { templateKey: tk, options: prediction.options as { key: string; label: string }[] },
        fixture,
        allBalls,
        match,
        pool,
      );
    }
    case "pre_match":
      return resolvePreMatchPrediction(prediction, fixture, match, allBalls);
    case "hot_take":
    case "rivalry_call":
      return resolveEndOfMatchPrediction(prediction, fixture, match, runs, allBalls);
    case "per_over": {
      // Live-player innings questions (batsman_innings / bowler_innings /
      // bowler_innings_wkts / batsman_sixes) live under per_over but are
      // keyed by playerId, not over number. They have their own resolver.
      if ((prediction as any).subjectType) {
        return computeLivePlayerCorrectOption(prediction, allBalls);
      }
      if (!prediction.overNumber) return null;
      const innings = getPredictionInnings(prediction);
      const inningsStr = innings === 1 ? "S1" : "S2";
      const stats = computeOverStats(allBalls, prediction.overNumber, inningsStr);
      return resolveOverPredictionFromStats(prediction, stats);
    }
    case "bold_call":
      // Resolvers for bold_call live in resolveEndOfMatchPrediction's fall-through
      // for hot_take-shaped questions. If a dedicated resolver is added later,
      // route it here. For now, attempt the end-of-match path.
      return resolveEndOfMatchPrediction(prediction, fixture, match, runs, allBalls);
    default:
      return null;
  }
}

export interface ReResolveMatchSummary {
  evaluated: number;
  updated: number;
  unchanged: number;
  skipped_no_data: number;
  participantsRecomputed: number;
  details: Array<{
    predictionId: string;
    category: string;
    question: string;
    before: string | null;
    after: string | null;
    action: "updated" | "unchanged" | "skipped";
  }>;
}

// Delta-only re-resolution: walks every prediction we own, asks the
// resolver what the answer SHOULD be from fresh fixture + balls, and only
// mutates a row when the new answer is non-null AND differs from what's
// already stamped. Crucially: when the resolver can't determine (Sportsmonk
// has aged out the fixture, returns no balls, etc.) the row is left untouched
// — so this endpoint is a safe no-op rather than a wipe in that case.
//
// After all delta updates, recomputeParticipantScores rebuilds UserPrediction
// isCorrect/pointsEarned + MatchParticipant totals from scratch using the
// updated correctOptions, so leaderboards stay consistent.
//
// Idempotent: re-running converges (second run reports updated=0).
export async function reResolveMatch(
  matchId: string,
  _io: SocketIOServer
): Promise<ReResolveMatchSummary> {
  const match = await Match.findByPk(matchId);
  if (!match) throw new Error("Match not found");
  if (!match.externalId) throw new Error("Match has no externalId — can't fetch fixture");
  const fixtureId = parseInt(match.externalId);
  if (Number.isNaN(fixtureId)) throw new Error("externalId is not numeric");

  const { recomputeParticipantScores } = await import("./pointsEngine");

  // Pull every prediction in this match across categories we own — both
  // already-resolved (so we can fix wrong answers) and still-pending (so we
  // can stamp them now if Sportsmonk has the data).
  const candidates = await Prediction.findAll({
    where: {
      matchId,
      category: ["punter_card", "hot_take", "pre_match", "per_over", "rivalry_call", "bold_call"],
    },
  });

  const summary: ReResolveMatchSummary = {
    evaluated: 0,
    updated: 0,
    unchanged: 0,
    skipped_no_data: 0,
    participantsRecomputed: 0,
    details: [],
  };

  if (candidates.length === 0) return summary;

  const fixture = await fetchLiveFixtureDetail(fixtureId, true);
  const allBalls: BallData[] = fixture?.balls?.data || (Array.isArray(fixture?.balls) ? fixture.balls : []);
  const runs: any[] = fixture?.runs?.data || (Array.isArray(fixture?.runs) ? fixture.runs : []);
  // Squad pool needed for v2 punter-card head-to-head templates (openers,
  // top-vs-death, overs 16–20, balls/boundary). Loaded once here so we don't
  // re-hit the lookup per prediction inside the loop. null is acceptable —
  // resolvers fall back gracefully.
  const pool = await resolveSquadPool(match);

  for (const pred of candidates) {
    summary.evaluated += 1;
    let newCorrect: string | null = null;
    try {
      newCorrect = computeCorrectOptionForPrediction(pred, match, fixture, runs, allBalls, pool);
    } catch (err) {
      console.error(`[reResolveMatch] resolver error for prediction ${pred.id}:`, err);
      newCorrect = null;
    }

    const before = pred.correctOption || null;

    if (newCorrect == null) {
      summary.skipped_no_data += 1;
      summary.details.push({
        predictionId: pred.id,
        category: pred.category,
        question: pred.question,
        before,
        after: null,
        action: "skipped",
      });
      continue;
    }

    if (correctOptionEquivalent(before, newCorrect)) {
      summary.unchanged += 1;
      // Make sure status is "resolved" so recomputeParticipantScores will
      // honor the correctOption. Cheap no-op if already resolved.
      if (pred.status !== "resolved") {
        await pred.update({ status: "resolved" });
      }
      summary.details.push({
        predictionId: pred.id,
        category: pred.category,
        question: pred.question,
        before,
        after: newCorrect,
        action: "unchanged",
      });
      continue;
    }

    // Genuine flip: stamp the new correctOption + mark resolved.
    await pred.update({ correctOption: newCorrect, status: "resolved" });
    summary.updated += 1;
    summary.details.push({
      predictionId: pred.id,
      category: pred.category,
      question: pred.question,
      before,
      after: newCorrect,
      action: "updated",
    });
  }

  // Single rebuild of UserPrediction.isCorrect/pointsEarned + MatchParticipant
  // totals from the (possibly updated) correctOptions. This is the only place
  // that touches UserPrediction rows in the new flow.
  const recompute = await recomputeParticipantScores({ matchId });
  summary.participantsRecomputed = recompute.participantsRecomputed;

  return summary;
}

async function _pollSportsmonkUpdatesInner(io: SocketIOServer): Promise<void> {
  // Pull today's Sportsmonk fixtures into the DB so Punter Card + pre-match
  // predictions exist before users tap JOIN. Throttled internally.
  await autoImportTodayFixtures();

  // Check both live AND upcoming matches (upcoming might have started)
  const matches = await Match.findAll({ where: { status: ["live", "upcoming"] } });
  if (matches.length === 0) return;

  for (const match of matches) {
    if (!match.externalId) continue;

    // Sportsmonk uses numeric fixture IDs
    const fixtureId = parseInt(match.externalId);
    if (isNaN(fixtureId)) continue;

    // Punter Card midnight trigger — opens at start-of-match-day, expires at match start.
    // ensurePunterCard is idempotent; it no-ops once the full card exists and
    // only backfills the 3 player-pool questions once lineup data becomes available.
    if (match.status === "upcoming" && match.startTime) {
      const opensAt = punterOpensAt(match).getTime();
      const startAt = new Date(match.startTime).getTime();
      if (Date.now() >= opensAt && Date.now() < startAt) {
        try {
          const res = await ensurePunterCard(match);
          if (res.created > 0) {
            console.log(`[PunterCard] Generated ${res.created} questions for ${match.team1Short} vs ${match.team2Short}`);
          }
        } catch (err) {
          console.error("[PunterCard] ensure error:", err);
        }
      }
    }

    // Initialize lastProcessedOver from DB state on first encounter (survives server restarts)
    if (!lastProcessedOver.has(match.id) && match.status === "live") {
      lastProcessedOver.set(match.id, await getTrackingSeed(match));
      console.log(`[Sportsmonk] Initialized tracking for ${match.team1Short} vs ${match.team2Short}: innings=${match.currentInnings}, over=${match.currentOver}`);
    }

    // Fast fetch: runs only (for score updates).
    // fetchLiveFixtureDetail already serves a recent cached payload during
    // upstream hiccups and rate-limits the "no fixture data" log itself,
    // so we just silently skip when nothing is available.
    const fixture = await fetchLiveFixtureDetail(fixtureId, false);
    if (!fixture) continue;

    // Auto-start: if match is "upcoming" in our DB but toss has happened on Sportsmonk
    if (match.status === "upcoming") {
      const hasToss = fixture.toss_won_team_id !== null && fixture.toss_won_team_id !== undefined;
      const fixtureStatus = fixture.status;

      if (hasToss || fixtureStatus !== "NS") {
        console.log(`[Sportsmonk] Toss done for ${match.team1Short} vs ${match.team2Short} — going live!`);

        // Compute actual current over from Sportsmonk runs data (rain delay may mean overs already bowled)
        const transitionRuns = fixture.runs?.data || (Array.isArray(fixture.runs) ? fixture.runs : []);
        const transitionInn1Runs = transitionRuns.find((r: any) => r.inning === 1);
        const transitionRawOvers = Number(transitionInn1Runs?.overs || 0);
        const actualCurrentOver = transitionRawOvers <= 0
          ? 1
          : Math.min(Math.floor(transitionRawOvers) + 1, match.totalOvers || 20);
        const actualRound = getCurrentRound(1, actualCurrentOver, match.totalOvers);

        // Seed innings1 / innings2 team identity from toss data so the UI
        // doesn't fall back to "team1 batted first" until the next runs
        // poll fills in actual scores. Without this users see the wrong
        // team labelled BAT for ~30s after toss.
        const tossWinId = fixture.toss_won_team_id;
        const localId = fixture.localteam_id;
        const visitorId = fixture.visitorteam_id;
        const elected = String(fixture.elected || "").toLowerCase();
        let battedFirstTeamId: number | null = null;
        if (tossWinId != null && (elected === "batting" || elected === "bowling" || elected === "bat" || elected === "field" || elected === "bowl")) {
          if (elected === "batting" || elected === "bat") {
            battedFirstTeamId = tossWinId;
          } else {
            // Toss winner chose to field/bowl → other team bats first.
            battedFirstTeamId = tossWinId === localId ? visitorId : localId;
          }
        }
        const battedFirstShort = battedFirstTeamId == null
          ? null
          : (battedFirstTeamId === localId ? match.team1Short : match.team2Short);
        const battedSecondTeamId = battedFirstTeamId == null
          ? null
          : (battedFirstTeamId === localId ? visitorId : localId);
        const battedSecondShort = battedSecondTeamId == null
          ? null
          : (battedSecondTeamId === localId ? match.team1Short : match.team2Short);

        const seededScoreData: Record<string, unknown> = {
          ...(match.scoreData || {}),
          tossWonTeamId: tossWinId,
          elected: fixture.elected,
        };
        if (battedFirstTeamId != null && battedFirstShort) {
          // Seed only team identity. Live score numbers come from the
          // regular runs-mapping pass later in this poll cycle and overwrite
          // these zeros without losing the teamId/teamShort.
          seededScoreData.innings1 = {
            ...((match.scoreData as any)?.innings1 || {}),
            score: ((match.scoreData as any)?.innings1?.score) ?? 0,
            wickets: ((match.scoreData as any)?.innings1?.wickets) ?? 0,
            overs: ((match.scoreData as any)?.innings1?.overs) ?? 0,
            teamId: battedFirstTeamId,
            teamShort: battedFirstShort,
          };
        }
        if (battedSecondTeamId != null && battedSecondShort) {
          seededScoreData.innings2 = {
            ...((match.scoreData as any)?.innings2 || {}),
            score: ((match.scoreData as any)?.innings2?.score) ?? 0,
            wickets: ((match.scoreData as any)?.innings2?.wickets) ?? 0,
            overs: ((match.scoreData as any)?.innings2?.overs) ?? 0,
            teamId: battedSecondTeamId,
            teamShort: battedSecondShort,
          };
        }

        await match.update({
          status: "live",
          currentInnings: 1,
          currentOver: actualCurrentOver,
          currentPhase: getPhase(1, actualCurrentOver, match.totalOvers) as any,
          scoreData: seededScoreData,
        });

        // Fetch lineup (Playing XI) at toss and auto-populate team players
        try {
          const fixtureId = Number(match.externalId);
          const lineup = await fetchFixtureLineup(fixtureId);
          if (lineup && lineup.length > 0) {
            const team1Lineup = lineup
              .filter((p: any) => p.lineup?.team_id === fixture.localteam_id && !p.lineup?.substitution)
              .map((p: any) => p.fullname);
            const team2Lineup = lineup
              .filter((p: any) => p.lineup?.team_id === fixture.visitorteam_id && !p.lineup?.substitution)
              .map((p: any) => p.fullname);
            if (team1Lineup.length > 0 || team2Lineup.length > 0) {
              await match.update({
                team1Players: team1Lineup.length > 0 ? team1Lineup : match.team1Players,
                team2Players: team2Lineup.length > 0 ? team2Lineup : match.team2Players,
              });
              console.log(`[Sportsmonk] Lineup fetched: ${team1Lineup.length} + ${team2Lineup.length} players`);

              // Backfill player-level pre-match questions if they weren't created at import time
              // (happens whenever a match was imported before Sportsmonk published the Playing XI)
              try {
                const existingPlayerQs = await Prediction.count({
                  where: {
                    matchId: match.id,
                    category: "pre_match",
                    question: {
                      [Op.in]: [
                        "Who will be tonight's top scorer?",
                        "Who will take the most wickets tonight?",
                        "Man of the Match — who takes the award?",
                      ],
                    },
                  },
                });
                if (existingPlayerQs === 0 && match.startTime) {
                  const t1 = team1Lineup.length > 0 ? team1Lineup : (match.team1Players || []);
                  const t2 = team2Lineup.length > 0 ? team2Lineup : (match.team2Players || []);
                  const playerQs = generatePlayerPreMatchQuestions(match.id, t1, t2);
                  const opensAt = new Date(new Date(match.startTime).getTime() - 45 * 60_000);
                  for (const q of playerQs) {
                    await Prediction.create({ ...q, opensAt } as any);
                  }
                  if (playerQs.length > 0) {
                    console.log(`[Sportsmonk] Generated ${playerQs.length} player pre-match questions at toss`);
                  }
                }
              } catch (err) {
                console.error("[Sportsmonk] Player pre-match backfill error:", err);
              }
            }
          }
        } catch (err) {
          console.error("[Sportsmonk] Lineup fetch error at toss:", err);
        }

        // Activate rooms for this match
        try {
          const { Room } = await import("../models");
          await Room.update({ status: "active" }, { where: { matchId: match.id, status: "waiting" } });
        } catch (err) {
          console.error("[Sportsmonk] Room activation error:", err);
        }

        // Generate predictions for the ACTUAL current over (skip if early-generated ones already exist)
        const existingOverPreds = await Prediction.findAll({
          where: { matchId: match.id, overNumber: actualCurrentOver, round: actualRound, category: "per_over" },
        });
        if (existingOverPreds.length === 0) {
          const overPreds = generatePerOverPredictions(match.id, actualCurrentOver, actualRound, "", "");
          for (const p of overPreds) {
            await Prediction.create(p as any);
          }
        }

        const existingHotTake = await Prediction.findAll({
          where: { matchId: match.id, round: actualRound, category: "hot_take" },
        });
        if (existingHotTake.length === 0) {
          const hotTake = generateHotTake(match.id, actualRound, match.team1Short, match.team2Short);
          if (hotTake) {
            const hotTakeExpiresAt = new Date(Date.now() + 120_000);
            await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
          }
          // Also generate player hot take
          const playerHotTake = generatePlayerHotTake(match.id, actualRound, {
            team1Players: match.team1Players,
            team2Players: match.team2Players,
          });
          if (playerHotTake) {
            await Prediction.create({ ...playerHotTake, expiresAt: new Date(Date.now() + 120_000) } as any);
          }
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
        io.to(`match:${match.id}`).emit("tossLocked", { matchId: match.id });
        console.log(`[Sportsmonk] Toss resolved; remaining pre-match questions stay open until first ball`);

        // Punter Card early-resolve: the toss-winner question is answerable now,
        // ~3.5 hours before the match ends. Players see points + popup
        // immediately instead of waiting for the final whistle.
        try {
          let tossWinnerShort: string | null = null;
          if (fixture.toss_won_team_id === fixture.localteam_id) tossWinnerShort = match.team1Short;
          else if (fixture.toss_won_team_id === fixture.visitorteam_id) tossWinnerShort = match.team2Short;
          if (tossWinnerShort) {
            const r = await resolvePunterCardEarly(match.id, { tossWinnerShort });
            if (r.resolved > 0) console.log(`[PunterCard] Early-resolved ${r.resolved} (toss)`);
          }
        } catch (err) {
          console.error("[PunterCard] Toss early-resolve error:", err);
        }

        // If rain delay caused skipped overs, resolve any early-generated predictions for completed overs
        const transitionCompletedLimit = Math.max(actualCurrentOver - 1, 0);
        if (transitionCompletedLimit >= 1) {
          try {
            const transitionFixture = await fetchLiveFixtureDetail(fixtureId, true);
            const transitionBalls: BallData[] = transitionFixture?.balls?.data || (Array.isArray(transitionFixture?.balls) ? transitionFixture.balls : []);
            if (transitionBalls.length > 0) {
              for (let ov = 1; ov <= transitionCompletedLimit; ov++) {
                await resolveOverPredictionsForOver(match, 1, ov, transitionBalls, io);
              }
              console.log(`[Sportsmonk] Resolved early predictions for overs 1-${transitionCompletedLimit} (rain delay catch-up)`);
            }
          } catch (err) {
            console.error("[Sportsmonk] Error resolving early predictions during transition:", err);
          }
        }

        io.to(`match:${match.id}`).emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: actualCurrentOver, round: actualRound });
        io.to(`match:${match.id}`).emit("matchStarted", { matchId: match.id });

        // Initialize tracking so catch-up/ball detection work correctly on next poll
        lastProcessedOver.set(match.id, {
          innings: 1,
          over: actualCurrentOver,
          resolved: transitionCompletedLimit,
        });
        lastKnownScore.set(match.id, {
          innings: 1,
          score: transitionInn1Runs ? transitionInn1Runs.score : 0,
          wickets: transitionInn1Runs ? transitionInn1Runs.wickets : 0,
          overs: transitionRawOvers,
        });

        console.log(`[Sportsmonk] Over ${actualCurrentOver} predictions live (round ${actualRound})`);

        // Skip catch-up/ball detection on this transition poll — predictions need time for users to answer
        continue;
      } else {
        // Generate Over 1 predictions 5 min before scheduled start
        const now = new Date();
        const matchStartTime = match.startTime ? new Date(match.startTime) : null;
        if (matchStartTime) {
          const fiveMinBefore = new Date(matchStartTime.getTime() - 5 * 60 * 1000);
          if (now >= fiveMinBefore) {
            const existingOver1 = await Prediction.findAll({
              where: { matchId: match.id, overNumber: 1, round: 1, category: "per_over" },
            });
            if (existingOver1.length === 0) {
              const over1Preds = generatePerOverPredictions(match.id, 1, 1, "", "");
              for (const p of over1Preds) {
                await Prediction.create(p as any);
              }
              io.to(`match:${match.id}`).emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: 1 });
              console.log(`[Sportsmonk] Over 1 predictions generated early for ${match.team1Short} vs ${match.team2Short}`);
            }
          }
        }
        continue;
      }
    }

    const runs = fixture.runs?.data || (Array.isArray(fixture.runs) ? fixture.runs : []);

    // Best-effort rain detection: check if Sportsmonk indicates reduced overs
    // Sportsmonk may include DLS/reduced-over info in the note field or fixture resource
    if (fixture.note && match.totalOvers === 20) {
      const dlsMatch = fixture.note.match(/(\d+)\s*ov(?:er)?s?\s*(?:per|a)\s*side/i);
      if (dlsMatch) {
        const reducedOvers = parseInt(dlsMatch[1], 10);
        if (reducedOvers > 0 && reducedOvers < 20) {
          await match.update({ totalOvers: reducedOvers });
          // Lock predictions for overs beyond the new limit
          const stalePreds = await Prediction.findAll({
            where: { matchId: match.id, status: "open", overNumber: { [Op.gt]: reducedOvers } },
          });
          for (const pred of stalePreds) {
            await pred.update({ status: "locked" });
          }
          io.to(`match:${match.id}`).emit("oversReduced", { matchId: match.id, totalOvers: reducedOvers });
          console.log(`[Sportsmonk] Rain detected: ${match.team1Short} vs ${match.team2Short} reduced to ${reducedOvers} overs. Locked ${stalePreds.length} predictions.`);
        }
      }
    }

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
    const currentOver = rawOvers <= 0 ? 1 : Math.min(Math.floor(rawOvers) + 1, match.totalOvers || 20);
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
      currentPhase: getPhase(currentInnings, currentOver, match.totalOvers) as any,
      scoreData: liveScore,
    });
    io.to(`match:${match.id}`).emit("scoreUpdate", {
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

            io.to(`match:${match.id}`).emit("scoreUpdate", {
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
        const currentRound = getCurrentRound(currentInnings, currentOver, match.totalOvers);
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
          io.to(`match:${match.id}`).emit("predictionsLocked", { matchId: match.id, overNumber: currentOver });
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

        // Generate next over's predictions, but only AFTER ball 3 of the live
        // over has been bowled. This gives users time to follow the current
        // over before being asked about the next one. Sportsmonk's `overs`
        // decimal is "balls bowled into the in-progress over" (0.3 = 3 balls
        // into Over 1, 1.3 = 3 balls into Over 2). We trigger on ≥ 3.
        const legalBallsInCurrentOver = Math.round((nowOvers - Math.floor(nowOvers)) * 10);
        const nextOverNum = currentOver + 1;
        if (legalBallsInCurrentOver >= 3 && nextOverNum <= (match.totalOvers || 20)) {
          const nextOverRound = getCurrentRound(currentInnings, nextOverNum, match.totalOvers);
          const existingNextPreds = await Prediction.findAll({
            where: { matchId: match.id, overNumber: nextOverNum, round: nextOverRound, category: "per_over" },
          });
          if (existingNextPreds.length === 0) {
            const newPreds = generatePerOverPredictions(match.id, nextOverNum, nextOverRound, "", "");
            for (const p of newPreds) {
              await Prediction.create(p as any);
            }
            io.to(`match:${match.id}`).emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: nextOverNum, round: nextOverRound });
            console.log(`[Sportsmonk] Generated over ${nextOverNum} predictions (over ${currentOver} at ball ${legalBallsInCurrentOver})`);
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
        const innings2Round1 = getCurrentRound(2, 1, match.totalOvers);
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
          io.to(`match:${match.id}`).emit("predictionsLocked", {
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
    // ---- Match-end finalization ----
    // Two triggers fire the same flow (idempotent, gated on status !== completed):
    //   (a) Sportsmonk has flipped status to "Finished" — authoritative.
    //   (b) We can compute end-of-match from the score data ourselves
    //       (target chased / inn-2 all out / inn-2 overs done). This catches
    //       the gap where Sportsmonk takes minutes to flip status, leaving
    //       early-generated predictions (e.g. Over 20 created mid-Over 18)
    //       stuck open after the actual finish.
    const inn1RunsForEnd = runs.find((r: any) => r.inning === 1);
    const inn2RunsForEnd = runs.find((r: any) => r.inning === 2);
    const totalOversForEnd = match.totalOvers || 20;
    const targetChased = !!(inn1RunsForEnd && inn2RunsForEnd && Number(inn2RunsForEnd.score) > Number(inn1RunsForEnd.score));
    const inn2AllOut = !!(inn2RunsForEnd && Number(inn2RunsForEnd.wickets) >= 10);
    const inn2OversDone = !!(inn2RunsForEnd && Number(inn2RunsForEnd.overs) >= totalOversForEnd - 0.001);
    const computedEnd = targetChased || inn2AllOut || inn2OversDone;

    if ((fixture.status === "Finished" || computedEnd) && match.status !== "completed") {
      await finalizeMatch(match, fixture, fixtureId, runs, io);
      continue;
    }

    // Skip the rest of the poll body once the match is completed.
    if (match.status === "completed") continue;

    // Check for innings break.
    // Two triggers, whichever fires first:
    //   (a) Sportsmonk has flipped to innings 2 (first ball of chase bowled)
    //   (b) Innings 1 has clearly ended (10 wickets OR all overs bowled),
    //       but Sportsmonk still reports innings 1 because the chase hasn't
    //       started — typical 15-min innings break.
    // Without (b), per-over predictions for over 20 sit unresolved and the
    // innings-2 over-1 / rivalry calls never get generated until the chase
    // begins, leaving users staring at a stale screen for 10-15 minutes.
    let inningsJustChanged = false;
    const innings1RunsEarly = runs.find((r: any) => r.inning === 1);
    const totalOversBound = (match.totalOvers || 20) - 0.001;
    const innings1Done = !!innings1RunsEarly && (
      Number(innings1RunsEarly.wickets) >= 10 ||
      Number(innings1RunsEarly.overs) >= totalOversBound
    );
    const trigByInnings2Started = currentInnings === 2 && lastProcessed.innings === 1;
    const trigByInn1End = innings1Done && lastProcessed.innings === 1 && !lastProcessed.inn1Resolved;

    if (trigByInnings2Started || trigByInn1End) {
      inningsJustChanged = true;
      const innings1Runs = innings1RunsEarly;
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
            match.id, target, chasingTeamShort, chasingTeamPlayers, match.totalOvers
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

        // Resolve hot take predictions that depend on first innings data.
        // Round 2 = "Total first innings score". Round 3 includes player
        // comparisons (e.g. "who smashes more sixes in the death — A vs B")
        // and a per-over death-runs question. Both bucket on inn1 data.
        const hotTakePreds = await Prediction.findAll({
          where: { matchId: match.id, category: "hot_take", status: ["open", "locked"], round: [2, 3] },
        });
        // Pull inn1 balls once; we need them for the death-overs sixes counts.
        let inn1Balls: BallData[] = [];
        try {
          const fullFx = await fetchFixtureWithBalls(fixtureId);
          const allBalls: BallData[] = fullFx?.balls?.data || (Array.isArray(fullFx?.balls) ? fullFx.balls : []);
          inn1Balls = allBalls.filter((b) => b.scoreboard === "S1");
        } catch { /* best effort */ }

        const totalOvers = match.totalOvers || 20;
        const midEnd = Math.ceil(totalOvers * 0.75);
        const isDeathBall = (b: BallData) => {
          const ovStr = String((b as any).ball || "0");
          const ovIdx = parseInt(ovStr.split(".")[0], 10);
          return Number.isFinite(ovIdx) && (ovIdx + 1) > midEnd;
        };

        for (const pred of hotTakePreds) {
          let correctOption: string | null = null;
          const q = pred.question.toLowerCase();

          if (pred.round === 2) {
            // "Total first innings score" — same banding as before.
            const score = innings1Runs.score;
            if (score < 150) correctOption = "low";
            else if (score <= 175) correctOption = "par";
            else if (score <= 200) correctOption = "high";
            else correctOption = "massive";
          } else if (pred.round === 3 && q.includes("smashes more sixes in the death")) {
            // Player vs player six count in the death overs of innings 1.
            const opts = pred.options.filter((o) => o.key !== "neither");
            const sixesByName = new Map<string, number>();
            for (const o of opts) sixesByName.set(o.label, 0);
            for (const b of inn1Balls) {
              if (!isDeathBall(b)) continue;
              const name = b.batsman?.fullname;
              if (!name || !sixesByName.has(name)) continue;
              if (isSix(b)) sixesByName.set(name, (sixesByName.get(name) || 0) + 1);
            }
            const [a, c] = opts;
            const aSixes = sixesByName.get(a.label) || 0;
            const bSixes = sixesByName.get(c.label) || 0;
            if (aSixes === 0 && bSixes === 0) correctOption = "neither";
            else if (aSixes > bSixes) correctOption = a.key;
            else if (bSixes > aSixes) correctOption = c.key;
            else correctOption = "neither"; // exact tie counts as neither dominating
          } else if (pred.round === 3 && q.includes("biggest over in the death")) {
            // Find the highest single-over total in death overs of inn1.
            const overTotals = new Map<number, number>();
            for (const b of inn1Balls) {
              if (!isDeathBall(b)) continue;
              const ovStr = String((b as any).ball || "0");
              const ovIdx = parseInt(ovStr.split(".")[0], 10);
              const overNum = ovIdx + 1;
              const r = Number(b.score?.runs || 0);
              overTotals.set(overNum, (overTotals.get(overNum) || 0) + r);
            }
            let biggest = 0;
            for (const v of overTotals.values()) if (v > biggest) biggest = v;
            if (biggest <= 9) correctOption = "0_9";
            else if (biggest <= 14) correctOption = "10_14";
            else if (biggest <= 19) correctOption = "15_19";
            else correctOption = "20_plus";
            // If the saved option keys don't match these, fall back to "neither"-ish first option
            if (!pred.options.find((o) => o.key === correctOption)) {
              correctOption = pred.options[0]?.key || null;
            }
          }

          if (correctOption) {
            await resolvePrediction(pred, correctOption, io);
            console.log(`[Sportsmonk] Innings break hot take resolved: "${pred.question}" → ${correctOption}`);
          } else {
            console.warn(`[Sportsmonk] Innings break: no resolver for hot take "${pred.question}" (round ${pred.round})`);
          }
        }
        // Round 3 boundaries-in-second-innings still resolves at match end (needs S2 data).

        // Generate Over 1 (2nd innings) per-over predictions — locked when 1st ball of innings 2 is bowled
        const inn2Round = getCurrentRound(2, 1, match.totalOvers); // = 4
        const existingInn2Over1 = await Prediction.findAll({
          where: { matchId: match.id, overNumber: 1, round: inn2Round, category: "per_over" },
        });
        if (existingInn2Over1.length === 0) {
          const inn2OverPreds = generatePerOverPredictions(match.id, 1, inn2Round, "", "");
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
          // Also generate player hot take for chase powerplay
          const playerHotTake = generatePlayerHotTake(match.id, inn2Round, {
            team1Players: match.team1Players,
            team2Players: match.team2Players,
          });
          if (playerHotTake) {
            await Prediction.create({ ...playerHotTake, expiresAt: new Date(Date.now() + 120_000) } as any);
          }
        }

        io.to(`match:${match.id}`).emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: inn2Round });
        io.to(`match:${match.id}`).emit("inningsBreak", {
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
            io.to(`match:${match.id}`).emit("predictionsLocked", { matchId: match.id, type: "innings1_all" });

            for (const pred of allInn1Preds) {
              const overNum = pred.overNumber || 0;
              if (overNum <= 0) continue;
              const overStats = computeOverStats(balls, overNum, "S1");
              const correctOption = resolveOverPredictionFromStats(pred, overStats);
              if (correctOption) {
                await resolvePrediction(pred, correctOption, io, overStatsToContext(overStats));
              } else {
                console.warn(`[Sportsmonk] Inn-break: could not resolve "${pred.question}" (id=${pred.id})`);
              }
            }
            console.log(`[Sportsmonk] Innings break: resolved ${allInn1Preds.length} 1st innings predictions`);
          }
        } catch (err) {
          console.error("[Sportsmonk] Error resolving innings 1 predictions at innings break:", err);
        }

        // Punter Card early-resolve: at innings break we know whether anyone
        // hit a 50 or 100 in innings 1. Compute from the inn1 balls we
        // already pulled above so users see those points rolling in instead
        // of waiting until match end.
        try {
          const runsByBatsman = new Map<string, number>();
          for (const b of inn1Balls) {
            const name = b.batsman?.fullname;
            if (!name) continue;
            // batsmanRunsOnBall isn't exported here; replicate the simple
            // inn-totals math: ball.score.runs minus extras.
            const s = b.score || ({} as any);
            const extras = Number(s.bye || 0) + Number(s.leg_bye || 0) + Number(s.noball_runs || 0);
            const batRuns = Math.max(0, Number(s.runs || 0) - extras);
            runsByBatsman.set(name, (runsByBatsman.get(name) || 0) + batRuns);
          }
          let anyHit50 = false;
          let anyHit100 = false;
          for (const r of runsByBatsman.values()) {
            if (r >= 100) { anyHit100 = true; anyHit50 = true; break; }
            if (r >= 50) anyHit50 = true;
          }
          const r = await resolvePunterCardEarly(match.id, {
            inn1AnyHit50: anyHit50,
            inn1AnyHit100: anyHit100,
          });
          if (r.resolved > 0) console.log(`[PunterCard] Early-resolved ${r.resolved} (innings break)`);
        } catch (err) {
          console.error("[PunterCard] Innings-break early-resolve error:", err);
        }

        // Update tracking so over-completion block doesn't re-run, AND mark
        // inn1Resolved so the early "innings-1 ended but innings-2 hasn't
        // started" trigger above won't fire on every subsequent poll tick.
        lastProcessedOver.set(match.id, {
          innings: currentInnings,
          over: currentOver,
          resolved: Math.max(lastProcessed.resolved || 0, lastProcessed.over),
          inn1Resolved: true,
        });

        console.log(`[Sportsmonk] Innings break — target: ${target} (trigger: ${trigByInnings2Started ? "innings2-started" : "innings1-ended"})`);
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
            completedOver,
            match.totalOvers
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
              await resolvePrediction(pred, correctOption, io, overStatsToContext(overStats));
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
            io.to(`match:${match.id}`).emit("predictionsLocked", { matchId: match.id, overNumber: nextOverNum });
          }

          // Update match state + store over stats for catch-up resolution
          const newPhase = getPhase(currentInnings, currentOver, match.totalOvers);
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
          io.to(`match:${match.id}`).emit("scoreUpdate", {
            matchId: match.id,
            innings: currentInnings,
            over: currentOver,
            scoreData: match.scoreData,
          });

          // Check round change
          const prevRound = getCurrentRound(
            prevInningsStr === "S1" ? 1 : 2,
            completedOver,
            match.totalOvers
          );
          const newRound = getCurrentRound(currentInnings, currentOver, match.totalOvers);

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
                io.to(`match:${match.id}`).emit("newPrediction", { matchId: match.id, type: "hot_take", round: newRound });
              }
              // Also generate player hot take for this round
              // Compute player context from ball data
              // Top scorer: sum all runs per batsman in the current innings
              const currentInn = currentInnings === 1 ? "S1" : "S2";
              const batsmanRunTotals: Record<string, number> = {};
              const dismissedSet = new Set<string>();
              for (const b of balls) {
                if (b.scoreboard !== currentInn) continue;
                const name = b.batsman?.fullname;
                if (name) batsmanRunTotals[name] = (batsmanRunTotals[name] || 0) + (b.score?.runs || 0);
                // Track every batsman dismissed this innings so we don't base
                // hot-takes on someone who's already out
                if ((b.score?.is_wicket || b.batsmanout_id) && name) dismissedSet.add(name);
              }
              let topScorerName: string | undefined;
              let topScorerRuns = 0;
              for (const [name, r] of Object.entries(batsmanRunTotals)) {
                if (dismissedSet.has(name)) continue;
                if (r > topScorerRuns) { topScorerRuns = r; topScorerName = name; }
              }
              // Current batsmen at crease: from the latest over's stats (excluding any dismissed mid-over)
              const stillBatting = Object.keys(overStats.batsmanStats).filter(n => !dismissedSet.has(n));
              const currentBatsmen: [string, string] | undefined =
                stillBatting.length >= 2
                  ? [stillBatting[0], stillBatting[1]]
                  : undefined;
              const playerHotTake = generatePlayerHotTake(match.id, newRound, {
                team1Players: match.team1Players,
                team2Players: match.team2Players,
                topScorerName,
                currentBatsmen,
              });
              if (playerHotTake) {
                await Prediction.create({ ...playerHotTake, expiresAt: roundHotTakeExpiresAt } as any);
              }
            }
          }

          // Per-over generation for the NEXT over now happens mid-over via the
          // ball-bowled trigger above (gated on legalBallsInCurrentOver >= 3).
          // The old end-of-over "two-ahead" path fired too early — right at
          // the over transition — which contradicted the product rule that
          // users shouldn't see Over N+1 until 3 balls into Over N.
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

function getPhase(innings: number, over: number, totalOvers: number = 20): string {
  const overs = totalOvers || 20;
  let ppEnd = Math.min(6, overs);
  let midEnd = Math.ceil(overs * 0.75);
  if (overs <= 3) { ppEnd = 1; midEnd = 2; }
  else if (ppEnd >= midEnd) { midEnd = ppEnd + 1; }
  if (innings === 1) {
    if (over <= ppEnd) return "innings1_powerplay";
    if (over <= midEnd) return "innings1_middle";
    return "innings1_death";
  }
  if (over <= ppEnd) return "innings2_powerplay";
  if (over <= midEnd) return "innings2_middle";
  return "innings2_death";
}

// Resolve per-over prediction using computed over stats.
//
// This resolves team-level per-over questions only. Player-specific live
// questions (batsman_innings, bowler_innings) are resolved by the
// livePlayerTracker service using stable Sportsmonk player IDs — never via
// substring matching on question text, which was the source of the
// "wrong-player-resolved" class of bug.
export function resolveOverPredictionFromStats(prediction: Prediction, stats: OverStats): string | null {
  // Live player questions are keyed by playerId and resolved elsewhere.
  // Return null so the over resolver leaves them alone.
  if (prediction.subjectType) return null;

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
      // Match Sportsmonk's canonical elected values. Anything unexpected → null
      // so we don't silently misclassify.
      const electedLower = String(elected).toLowerCase();
      let decision: "bat" | "field" | null = null;
      if (electedLower === "batting" || electedLower === "bat") decision = "bat";
      else if (electedLower === "bowling" || electedLower === "bowl" || electedLower === "field") decision = "field";
      if (!decision) return null;
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

  // --- Player-based pre-match resolutions ---

  // Q5: "Who will be tonight's top scorer?"
  if (q.includes("top scorer")) {
    const batsmanRuns: Record<string, number> = {};
    for (const b of allBalls) {
      const name = b.batsman?.fullname;
      if (name) {
        batsmanRuns[name] = (batsmanRuns[name] || 0) + (b.score?.runs || 0);
      }
    }
    // Find max scorer
    let maxRuns = 0;
    let maxName = "";
    for (const [name, r] of Object.entries(batsmanRuns)) {
      if (r > maxRuns) { maxRuns = r; maxName = name; }
    }
    if (!maxName) return null;

    // Match against option keys using playerKey format
    const matchedOption = prediction.options.find(
      (o) => o.key !== "someone_else" && o.label?.toLowerCase() === maxName.toLowerCase()
    );
    if (matchedOption) return matchedOption.key;

    // Check for ties — if another batter has the same max runs AND is in the options
    const tiedNames = Object.entries(batsmanRuns).filter(([, r]) => r === maxRuns).map(([n]) => n);
    for (const tn of tiedNames) {
      const tiedOption = prediction.options.find(
        (o) => o.key !== "someone_else" && o.label?.toLowerCase() === tn.toLowerCase()
      );
      if (tiedOption) return tiedOption.key;
    }

    return "someone_else";
  }

  // Q6: "Who will take the most wickets tonight?"
  if (q.includes("most wickets")) {
    const bowlerWickets: Record<string, number> = {};
    for (const b of allBalls) {
      if (b.score?.is_wicket || b.batsmanout_id) {
        // Don't count run outs as bowler wickets
        const dismissal = resolveDismissalType(b.score?.name);
        if (dismissal === "run_out") continue;
        const name = b.bowler?.fullname;
        if (name) {
          bowlerWickets[name] = (bowlerWickets[name] || 0) + 1;
        }
      }
    }
    let maxWickets = 0;
    let maxName = "";
    for (const [name, w] of Object.entries(bowlerWickets)) {
      if (w > maxWickets) { maxWickets = w; maxName = name; }
    }
    if (!maxName) return null;

    const matchedOption = prediction.options.find(
      (o) => o.key !== "someone_else" && o.label?.toLowerCase() === maxName.toLowerCase()
    );
    if (matchedOption) return matchedOption.key;

    // Check for ties
    const tiedNames = Object.entries(bowlerWickets).filter(([, w]) => w === maxWickets).map(([n]) => n);
    for (const tn of tiedNames) {
      const tiedOption = prediction.options.find(
        (o) => o.key !== "someone_else" && o.label?.toLowerCase() === tn.toLowerCase()
      );
      if (tiedOption) return tiedOption.key;
    }

    return "someone_else";
  }

  // Q7: "Man of the Match — who takes the award?"
  if (q.includes("man of the match")) {
    const motmId = fixture.man_of_match_id;
    if (!motmId) return null; // MOTM not yet available — leave for admin manual resolution

    // We need to find the MOTM player name. Check lineup data or ball data for matching ID.
    // First try: find any ball where batsman_id or bowler_id matches motmId
    let motmName = "";
    for (const b of allBalls) {
      if (b.batsman_id === motmId) { motmName = b.batsman?.fullname || ""; break; }
      if (b.bowler_id === motmId) { motmName = b.bowler?.fullname || ""; break; }
    }

    if (!motmName) return null; // Could not resolve MOTM name from ball data

    const matchedOption = prediction.options.find(
      (o) => o.key !== "someone_else" && o.label?.toLowerCase() === motmName.toLowerCase()
    );
    if (matchedOption) return matchedOption.key;
    return "someone_else";
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

  // Abandoned/cancelled matches — leave all predictions for admin manual resolution
  const fixtureStatus = (fixture.status || "").toLowerCase();
  if (fixtureStatus === "abandoned" || fixtureStatus === "cancelled" || fixtureStatus === "no result" || fixtureStatus === "postp.") {
    return null;
  }

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
    return inn2.overs > ((match.totalOvers || 20) - 1) ? "yes" : "no";
  }

  // "How many wickets fall in the chase by over 15?"
  if (q.includes("wickets fall in the chase")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    if (!inn2) return "0_2";
    // Count wickets in 2nd innings up to 75% mark
    const midEnd = Math.ceil((match.totalOvers || 20) * 0.75);
    const inn2Balls = allBalls.filter((b) => b.scoreboard === "S2" && b.ball < midEnd);
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
    const deathStart = Math.ceil((match.totalOvers || 20) * 0.75) + 1;
    for (let ov = deathStart; ov <= (match.totalOvers || 20); ov++) {
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
      if (isFour(b) || isSix(b)) boundaries++;
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
  if (q.includes("chase done in which phase")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    const inn1 = runs.find((r: any) => r.inning === 1);
    if (!inn2 || !inn1) return "not_chased";

    // Did chasing team win? (also handles null winner_team_id for abandoned matches)
    if (!fixture.winner_team_id || fixture.winner_team_id !== inn2.team_id) return "not_chased";

    const overs = inn2.overs;
    if (overs <= 6) return "powerplay";
    if (overs <= 15) return "middle";
    return "death";
  }

  // --- Player-based hot take resolutions ---

  // Helper: sum runs per batsman from ball data for a given innings and over range
  const sumBatsmanRuns = (
    innings: string,
    overStart: number,
    overEnd: number
  ): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const b of allBalls) {
      if (b.scoreboard !== innings) continue;
      const overIdx = Math.floor(b.ball);
      if (overIdx < overStart || overIdx >= overEnd) continue;
      const name = b.batsman?.fullname;
      if (name) {
        result[name] = (result[name] || 0) + (b.score?.runs || 0);
      }
    }
    return result;
  };

  // Round 1: "Will either opener score 50+ in the powerplay?"
  if (q.includes("either opener score 50+")) {
    const ppRuns = sumBatsmanRuns("S1", 0, 6);
    const values = Object.values(ppRuns);
    const any50 = values.some((r) => r >= 50);
    return any50 ? "yes" : "no";
  }

  // Round 2: "Will [player] reach a century this innings?"
  if (q.includes("reach a century")) {
    // Sum all runs for this batter in S1 (entire innings)
    const inn1Runs = sumBatsmanRuns("S1", 0, 100);
    // Find which player name from options appears in the question
    for (const [name, r] of Object.entries(inn1Runs)) {
      if (q.includes(name.toLowerCase()) && r >= 100) return "yes";
    }
    return "no";
  }

  // Round 3: "Who smashes more sixes in the death — [batter1] or [batter2]?"
  if (q.includes("more sixes in the death")) {
    const deathStart = Math.ceil((match.totalOvers || 20) * 0.75);
    const totalOvers = match.totalOvers || 20;
    const batter1Sixes: Record<string, number> = {};
    for (const b of allBalls) {
      if (b.scoreboard !== "S1") continue;
      if (Math.floor(b.ball) < deathStart) continue;
      if (isSix(b)) {
        const name = b.batsman?.fullname;
        if (name) batter1Sixes[name] = (batter1Sixes[name] || 0) + 1;
      }
    }
    // Match option keys against player names
    const options = prediction.options;
    const namedOptions = options.filter((o) => o.key !== "neither");
    if (namedOptions.length >= 2) {
      const p1Name = namedOptions[0].label;
      const p2Name = namedOptions[1].label;
      const p1Sixes = batter1Sixes[p1Name] || 0;
      const p2Sixes = batter1Sixes[p2Name] || 0;
      if (p1Sixes === 0 && p2Sixes === 0) return "neither";
      if (p1Sixes > p2Sixes) return namedOptions[0].key;
      if (p2Sixes > p1Sixes) return namedOptions[1].key;
      return ALL_CORRECT_OPTION; // tied sixes
    }
    return null; // malformed options — leave for admin
  }

  // Round 4: "Will [opener1] outscore [opener2] in the chase powerplay?"
  if (q.includes("outscore") && q.includes("chase powerplay")) {
    const ppRuns = sumBatsmanRuns("S2", 0, 6);
    const options = prediction.options;
    const namedOptions = options.filter((o) => o.key !== "equal");
    if (namedOptions.length >= 2) {
      const p1Name = namedOptions[0].label;
      const p2Name = namedOptions[1].label;
      const p1Runs = ppRuns[p1Name] || 0;
      const p2Runs = ppRuns[p2Name] || 0;
      if (p1Runs > p2Runs) return namedOptions[0].key;
      if (p2Runs > p1Runs) return namedOptions[1].key;
      return "equal";
    }
    return null; // malformed options — leave for admin
  }

  // Round 5: "Will any bowler finish the match with 3+ wickets?"
  if (q.includes("bowler finish the match with 3+")) {
    const bowlerWickets: Record<string, number> = {};
    for (const b of allBalls) {
      if (b.score?.is_wicket || b.batsmanout_id) {
        // Don't count run outs as bowler wickets
        const dismissal = resolveDismissalType(b.score?.name);
        if (dismissal === "run_out") continue;
        const name = b.bowler?.fullname;
        if (name) bowlerWickets[name] = (bowlerWickets[name] || 0) + 1;
      }
    }
    const any3Plus = Object.values(bowlerWickets).some((w) => w >= 3);
    return any3Plus ? "yes" : "no";
  }

  // Round 6: "Will [batter] hit a six in the last 5 overs?"
  if (q.includes("hit a six in the last 5 overs")) {
    const deathStart = Math.max(0, (match.totalOvers || 20) - 5);
    for (const b of allBalls) {
      if (b.scoreboard !== "S2") continue;
      if (Math.floor(b.ball) < deathStart) continue;
      if (isSix(b) && b.batsman?.fullname && q.includes(b.batsman.fullname.toLowerCase())) {
        return "yes";
      }
    }
    return "no";
  }

  return null;
}
