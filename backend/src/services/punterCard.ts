import { Op } from "sequelize";
import { Server as SocketIOServer } from "socket.io";
import { Match, Prediction, UserPrediction, MatchParticipant, User } from "../models";
import sequelize from "../config/database";
import { playerKey } from "./predictionEngine";
import { ALL_CORRECT_OPTION } from "./pointsEngine";
import { getYearWeekNumber } from "../utils/weekHelper";
import { resolveBallName, isInLineup, addLearnedAlias, clearLearnedAliases, findFuzzyMatch } from "./playerNameMatch";
import {
  squadWithRolesForTeam,
  getPlayerRole,
  type Player,
  type PlayerRole,
} from "../data/iplSquads";

// Sentinel returned by computeCorrectFromBalls when a head-to-head question
// can't be evaluated fairly — e.g. a named player isn't in the actual XI.
// resolvePunterCard converts this into a "resolved with no winner" outcome:
// the prediction is closed but no one's points / stats move, and no
// myPredictionWin / leaderboardUpdate sockets are emitted.
export const VOID_OPTION = "__void__";

// Lowercased set of all 22 (or fewer) names in today's actual XI, sourced
// from match.team1Players + team2Players. Returns null if neither lineup
// has been populated yet (toss hasn't happened, or this is a legacy row).
// Callers that need a "did this player feature today" check can fall back
// to other heuristics in that case.
function lineupNamesLower(match?: Match | null): Set<string> | null {
  if (!match) return null;
  const t1 = Array.isArray(match.team1Players) ? match.team1Players : [];
  const t2 = Array.isArray(match.team2Players) ? match.team2Players : [];
  if (t1.length === 0 && t2.length === 0) return null;
  return new Set([...t1, ...t2].map((n) => String(n || "").toLowerCase().trim()).filter(Boolean));
}

// Map decimal-odds-style difficulty to in-app points.
// Reference (from user-supplied screenshot): odds range ~1.07 (very likely)
// to ~50.00 (very unlikely). We want points to scale with difficulty but stay
// in the same order-of-magnitude as the rest of the game (per-over = 50,
// hot take = 20-25). Formula: round(odds * 5), clamped [5, 200].
export function oddsToPoints(odds: number): number {
  if (!isFinite(odds) || odds <= 1) return 5;
  // Round to nearest multiple of 5 so the on-screen number always reads as
  // a clean tens/fives value (35, 40, 45, … never 42 or 49).
  const raw = Math.round(odds * 5);
  const snapped = Math.round(raw / 5) * 5;
  return Math.max(5, Math.min(200, snapped));
}

const PUNTER_TEMPLATES = [
  // --- Player-pool templates (kept from v1) ---
  "punter_motm",
  "punter_top_batter",
  "punter_top_bowler",
  // --- v1 templates retained ONLY so already-generated cards still resolve.
  //     New cards no longer include these. ---
  "punter_inn1_50",
  "punter_inn1_100",
  "punter_inn2_50",
  "punter_inn2_100",
  "punter_highest_at_1st_dismissal",
  "punter_match_winner",
  "punter_toss_winner",
  // --- v2 head-to-head questions (replace v1 7-pack going forward) ---
  "punter_star_batter_lower",        // who scores fewer runs: starBat(t1) vs starBat(t2)
  "punter_wk_better_sr",             // who finishes with better SR: wk(t1) vs wk(t2)
  "punter_openers_more_boundaries",  // which team's openers hit more (4s+6s)
  "punter_allrounder_impact",        // bigger impact (runs+wkts+catches): allRounder(t1) vs allRounder(t2)
  "punter_first_event",              // first six or first wicket of the match
  "punter_top_vs_death",             // t1 top order runs (openers + #3) vs t2 death bowling runs (overs 16–20 of t1's innings)
  "punter_overs_16_20_runs",         // which team scores more across overs 16–20
  "punter_balls_per_boundary",       // which team has worse dots÷boundaries ratio (more wasteful)
] as const;
export type PunterTemplate = (typeof PUNTER_TEMPLATES)[number];

interface SquadSource {
  team1Players: Player[];
  team2Players: Player[];
}

// Resolve squad pool for a match. Order of preference:
//   1. The match's own team1Players / team2Players if already populated
//      (real XI announced at toss, enriched with roles from our IPL_SQUADS
//      index — falls back to a positional heuristic for unknown names).
//   2. The hardcoded latest-known XI for that team from IPL_SQUADS_2026
//      (PDF-derived data, refreshed each season).
//   3. As a last resort, the most-recent past match in our DB where this
//      team played.
// Returns null only if neither source produces enough names for either side.
export async function resolveSquadPool(match: Match): Promise<SquadSource | null> {
  const team1 = await resolveTeamPool(match.team1Short, match.team1Players, match.id);
  const team2 = await resolveTeamPool(match.team2Short, match.team2Players, match.id);
  if (!team1 || !team2) return null;
  return { team1Players: team1, team2Players: team2 };
}

async function resolveTeamPool(
  short: string | null | undefined,
  matchXI: string[] | undefined,
  excludeMatchId: string
): Promise<Player[] | null> {
  // 1. Actual XI for this match — enrich each name with a role.
  if (Array.isArray(matchXI) && matchXI.length >= 6) {
    return enrichWithRoles(matchXI);
  }

  // 2. Hardcoded latest XI from the PDF data, merged with any SquadOverride
  // rows written by post-match squad sync. Already role-tagged.
  if (short) {
    const known = await squadWithRolesForTeam(short);
    if (known && known.length >= 6) return known;
  }

  // 3. Last resort — most recent past match's lineup, role-enriched.
  if (short) {
    const recent = await lookupRecentSquad(short, excludeMatchId);
    if (recent && recent.length >= 6) return enrichWithRoles(recent);
  }

  return null;
}

// Heuristic role-tagger for raw `string[]` lineups (e.g. arrived via Sportsmonk
// or stored in match.team1Players). First tries the global name → role index
// from IPL_SQUADS_2026; falls back to positional rule of thumb (top half =
// batters, last 4 = bowlers, middle = all-rounders).
function enrichWithRoles(names: string[]): Player[] {
  return names.map((name, i, arr) => {
    const known = getPlayerRole(name);
    if (known) return { name, role: known };
    let role: PlayerRole;
    if (arr.length >= 8 && i >= arr.length - 4) role = "bowl";
    else if (arr.length >= 8 && i >= arr.length - 7) role = "all";
    else role = "bat";
    return { name, role };
  });
}

async function lookupRecentSquad(teamShort: string, excludeMatchId: string): Promise<string[] | null> {
  const recents = await Match.findAll({
    where: {
      id: { [Op.ne]: excludeMatchId },
      [Op.or]: [{ team1Short: teamShort }, { team2Short: teamShort }],
    } as any,
    order: [["startTime", "DESC"]],
    limit: 5,
  });
  for (const m of recents) {
    const arr = m.team1Short === teamShort ? m.team1Players : m.team2Players;
    if (Array.isArray(arr) && arr.length >= 6) return arr;
  }
  return null;
}

// ---- Generator ----

export interface PunterCardQuestion {
  matchId: string;
  category: "punter_card";
  round: 0;
  question: string;
  options: { key: string; label: string; points: number }[];
  templateKey: PunterTemplate;
}

// Build the 10-question Punter Card. team-level questions always render;
// player-pool questions render only if `pool` is provided (else they're
// dropped and a later pass at toss can backfill).
export function buildPunterCardQuestions(
  match: Match,
  pool: SquadSource | null
): PunterCardQuestion[] {
  const matchId = match.id;
  const t1 = match.team1Short || match.team1 || "Team A";
  const t2 = match.team2Short || match.team2 || "Team B";
  const team1Full = match.team1 || t1;
  const team2Full = match.team2 || t2;

  const out: PunterCardQuestion[] = [];

  if (pool) {
    // 1. Player of the Match — large pool from both squads, sorted by
    //    expected difficulty (top-of-order batters easiest → bowlers harder).
    out.push({
      matchId,
      category: "punter_card",
      round: 0,
      templateKey: "punter_motm",
      question: "Player of the Match",
      options: motmOptions(pool),
    });

    // 2. Top Batter — primarily top-order from both squads.
    out.push({
      matchId,
      category: "punter_card",
      round: 0,
      templateKey: "punter_top_batter",
      question: "Top Batter",
      options: topBatterOptions(pool),
    });

    // 3. Top Bowler — primarily tail-end of squad lists (typical bowlers).
    out.push({
      matchId,
      category: "punter_card",
      round: 0,
      templateKey: "punter_top_bowler",
      question: "Top Bowler",
      options: topBowlerOptions(pool),
    });
  }

  // ---- v2 head-to-head pack (replaces the old yes/no + winner/toss 7) ----
  //
  // Every question phrasing bakes in the actual player names so users see
  // "Who scores less today: Ruturaj Gaikwad or Shubman Gill?" instead of a
  // generic placeholder. Pickers fall back to null on thin squad data, in
  // which case the corresponding card is silently skipped (the resolver
  // would have nothing to bind it to anyway).

  const t1Players = pool?.team1Players || [];
  const t2Players = pool?.team2Players || [];

  // 4. Star batter — who scores LESS (lower runs wins the pick).
  const star1 = t1Players.length ? pickStarBatter(t1Players, match.team1Short) : null;
  const star2 = t2Players.length ? pickStarBatter(t2Players, match.team2Short) : null;
  if (star1 && star2 && star1.name.toLowerCase() !== star2.name.toLowerCase()) {
    out.push({
      matchId, category: "punter_card", round: 0,
      templateKey: "punter_star_batter_lower",
      question: `Who scores less today: ${star1.name} or ${star2.name}?`,
      options: [
        { key: playerKey(star1.name), label: star1.name, points: oddsToPoints(2.0) },
        { key: playerKey(star2.name), label: star2.name, points: oddsToPoints(2.0) },
        { key: ALL_CORRECT_OPTION,   label: "Tie",       points: oddsToPoints(15.0) },
      ],
    });
  }

  // 5. Wicket-keepers — who finishes with the BETTER strike rate.
  const wk1 = t1Players.length ? pickWicketKeeper(t1Players) : null;
  const wk2 = t2Players.length ? pickWicketKeeper(t2Players) : null;
  if (wk1 && wk2 && wk1.name.toLowerCase() !== wk2.name.toLowerCase()) {
    out.push({
      matchId, category: "punter_card", round: 0,
      templateKey: "punter_wk_better_sr",
      question: `Who finishes with better strike rate: ${wk1.name} or ${wk2.name}?`,
      options: [
        { key: playerKey(wk1.name), label: wk1.name, points: oddsToPoints(2.0) },
        { key: playerKey(wk2.name), label: wk2.name, points: oddsToPoints(2.0) },
        { key: ALL_CORRECT_OPTION,  label: "Neither bats", points: oddsToPoints(15.0) },
      ],
    });
  }

  // 6. Openers — which side scores more boundaries (4s + 6s combined).
  if (pickOpeners(t1Players) && pickOpeners(t2Players)) {
    out.push({
      matchId, category: "punter_card", round: 0,
      templateKey: "punter_openers_more_boundaries",
      question: `Who scores more boundaries: ${team1Full} openers or ${team2Full} openers?`,
      options: [
        { key: "team1", label: `${team1Full} openers`, points: oddsToPoints(2.0) },
        { key: "team2", label: `${team2Full} openers`, points: oddsToPoints(2.0) },
        { key: ALL_CORRECT_OPTION, label: "Tied",      points: oddsToPoints(15.0) },
      ],
    });
  }

  // 7. Top all-rounders — bigger impact (runs + wickets + catches, summed).
  const ar1 = t1Players.length ? pickTopAllrounder(t1Players) : null;
  const ar2 = t2Players.length ? pickTopAllrounder(t2Players) : null;
  if (ar1 && ar2 && ar1.name.toLowerCase() !== ar2.name.toLowerCase()) {
    out.push({
      matchId, category: "punter_card", round: 0,
      templateKey: "punter_allrounder_impact",
      question: `Who has the bigger impact today: ${ar1.name} or ${ar2.name}?`,
      options: [
        { key: playerKey(ar1.name), label: `${ar1.name} (runs+wkts+catches)`, points: oddsToPoints(2.0) },
        { key: playerKey(ar2.name), label: `${ar2.name} (runs+wkts+catches)`, points: oddsToPoints(2.0) },
        { key: ALL_CORRECT_OPTION,  label: "Tied",                            points: oddsToPoints(15.0) },
      ],
    });
  }

  // 8. First six or first wicket — pure ball-by-ball question, no squad
  //    dependency, always emitted.
  out.push({
    matchId, category: "punter_card", round: 0,
    templateKey: "punter_first_event",
    question: "What comes first today: first six or first wicket?",
    options: [
      // Sixes go first in T20 powerplay roughly 60% of the time per public
      // ball-by-ball stats; tiny edge to "wicket" in the points either way.
      { key: "six",    label: "First six",    points: oddsToPoints(1.7) },
      { key: "wicket", label: "First wicket", points: oddsToPoints(2.0) },
    ],
  });

  // (Removed: "Who'll disappoint fans faster — top order vs death bowling".
  //  Question retired per product call. The `punter_top_vs_death` template
  //  is still kept in PUNTER_TEMPLATES + the resolver switch below so any
  //  rows generated before this change continue to resolve cleanly.)

  // 10. Death overs (16–20) — which team scores more.
  out.push({
    matchId, category: "punter_card", round: 0,
    templateKey: "punter_overs_16_20_runs",
    question: `Which team gets more from overs 16–20: ${team1Full} or ${team2Full}?`,
    options: [
      { key: "team1", label: team1Full,        points: oddsToPoints(2.0) },
      { key: "team2", label: team2Full,        points: oddsToPoints(2.0) },
      { key: ALL_CORRECT_OPTION, label: "Tied", points: oddsToPoints(15.0) },
    ],
  });

  // 11. Balls per boundary (dots ÷ boundaries) — which team is MORE wasteful.
  //     Higher ratio = the answer ("wastes more").
  out.push({
    matchId, category: "punter_card", round: 0,
    templateKey: "punter_balls_per_boundary",
    question: `Which team wastes more balls per boundary: ${team1Full} or ${team2Full}?`,
    options: [
      { key: "team1", label: team1Full,        points: oddsToPoints(2.0) },
      { key: "team2", label: team2Full,        points: oddsToPoints(2.0) },
      { key: ALL_CORRECT_OPTION, label: "Tied", points: oddsToPoints(15.0) },
    ],
  });

  return out;
}

// ---- Player-pool helpers ----
// All three helpers work on Player[] so role-based filtering can decide
// who's eligible. Within each pool, order = expected likelihood (top-of-list
// = most likely → lowest points; tail-of-list = most unlikely → highest
// points). Punter Card pools cap around 24 entries (≈12 per team).

type Option = { key: string; label: string; points: number };

// Interleave two arrays so neither team dominates the front of the list.
// Keeps point-difficulty fair across both sides for the user.
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

function uniqueByName(players: Player[]): Player[] {
  const seen = new Set<string>();
  const out: Player[] = [];
  for (const p of players) {
    const key = p.name.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ---- Role-based player pickers (head-to-head v2 questions) ----
// All pickers respect the squad's current order (front of list = highest
// priority for that role this season — see iplSquads.ts). They never throw;
// returning null lets the question generator skip a card if the squad data
// is too thin to identify the relevant player.

// Canonical "star batter" per IPL franchise — the player whose name draws
// users to the head-to-head card. Sourced from current-season run charts
// (user-curated; refresh per season). Used to override the role-based
// fallback below, since several teams open with a `wk` (DC's KL Rahul) or
// list a non-marquee opener first (KKR's Finn Allen ahead of Rinku in
// the squad order).
const STAR_BATTERS: Record<string, string> = {
  RCB:  "Virat Kohli",
  KKR:  "Rinku Singh",
  DC:   "KL Rahul",
  PBKS: "Shreyas Iyer",
  MI:   "Suryakumar Yadav",
  CSK:  "Ruturaj Gaikwad",
  GT:   "Shubman Gill",
  SRH:  "Abhishek Sharma",
  LSG:  "Mitchell Marsh",
  RR:   "Yashasvi Jaiswal",
};

function pickStarBatter(team: Player[], teamShort?: string | null): Player | null {
  // Prefer the curated marquee name when we know the team. Lets us pin a
  // wk-keyed batter (e.g. KL Rahul opens but is role="wk") or a mid-list
  // batter (e.g. Rinku at KKR position 5) as the question subject.
  if (teamShort) {
    const target = STAR_BATTERS[teamShort.toUpperCase()];
    if (target) {
      const found = team.find((p) => p.name.toLowerCase() === target.toLowerCase());
      if (found) return found;
    }
  }
  // Fallback for non-IPL fixtures or matches whose squad doesn't include
  // the curated star. Keep the original role-priority chain.
  return (
    team.find((p) => p.role === "bat") ||
    team.find((p) => p.role !== "bowl") ||
    null
  );
}

function pickWicketKeeper(team: Player[]): Player | null {
  return team.find((p) => p.role === "wk") || null;
}

// First two non-bowler entries in the squad. By convention these are the
// pair we'd expect to open (a batter or a wk-keeper), since iplSquads.ts
// keeps the playing-XI in batting order at the front.
function pickOpeners(team: Player[]): [Player, Player] | null {
  const nonBowl = team.filter((p) => p.role !== "bowl");
  if (nonBowl.length < 2) return null;
  return [nonBowl[0], nonBowl[1]];
}

// The number-3 batter for the "top order" definition in
// `punter_top_vs_death`. Defined as the third non-bowler in the squad,
// which mirrors how openers are picked.
function pickThreeBatter(team: Player[]): Player | null {
  const nonBowl = team.filter((p) => p.role !== "bowl");
  return nonBowl[2] || null;
}

function pickTopAllrounder(team: Player[]): Player | null {
  return team.find((p) => p.role === "all") || null;
}

// Player of the Match — entire 22-man combined squad (XI from each side,
// with optional impact players if listed in the source). Order interleaved
// for fairness; points scale 7.0 → ~40 across the pool.
function motmOptions(pool: SquadSource): Option[] {
  const t1 = pool.team1Players.slice(0, 12);
  const t2 = pool.team2Players.slice(0, 12);
  const merged = uniqueByName(interleave(t1, t2)).slice(0, 24);
  return merged.map((p, i) => ({
    key: playerKey(p.name),
    label: p.name,
    points: oddsToPoints(7 + i * 1.4),
  }));
}

// Top Batter — exclude pure bowlers. Wicketkeepers, pure bats, and
// all-rounders all qualify. Order preserved from squad listing (top-order
// batters first → lower points; tail batters / all-rounders later).
function topBatterOptions(pool: SquadSource): Option[] {
  const eligible = (xs: Player[]) => xs.filter((p) => p.role !== "bowl");
  const t1 = eligible(pool.team1Players).slice(0, 8);
  const t2 = eligible(pool.team2Players).slice(0, 8);
  const merged = uniqueByName(interleave(t1, t2)).slice(0, 16);
  return merged.map((p, i) => ({
    key: playerKey(p.name),
    label: p.name,
    points: oddsToPoints(4.5 + i * 0.95),
  }));
}

// Top Bowler — only players who can actually bowl (frontline bowlers + all-
// rounders). Pure bats and keepers excluded. Within the pool, frontline
// bowlers come before all-rounders so the most-likely wicket-takers get
// the lowest points.
function topBowlerOptions(pool: SquadSource): Option[] {
  const partition = (xs: Player[]) => {
    const bowl = xs.filter((p) => p.role === "bowl");
    const all = xs.filter((p) => p.role === "all");
    return [...bowl, ...all];
  };
  const t1 = partition(pool.team1Players).slice(0, 8);
  const t2 = partition(pool.team2Players).slice(0, 8);
  // Cap at 16 to mirror topBatterOptions — keeps the option pool size
  // symmetric across the two pick categories and ensures all-rounders that
  // sit at the back of the bowlable partition (e.g. KKR's Anukul Roy) make
  // it into the option list rather than being silently cut.
  const merged = uniqueByName(interleave(t1, t2)).slice(0, 16);
  return merged.map((p, i) => ({
    key: playerKey(p.name),
    label: p.name,
    points: oddsToPoints(4.5 + i * 0.85),
  }));
}

// ---- Persistence ----

export async function ensurePunterCard(match: Match): Promise<{ created: number; existing: number }> {
  if (!match.startTime) return { created: 0, existing: 0 };

  // Repair pass: pre-existing rows may have been created with the OLD
  // (server-local) midnight calculation, so opensAt could be 5h30m late on a
  // UTC host. Snap any over-late opensAt down to the correct IST-midnight
  // value before counting / responding.
  const correctOpensAt = punterOpensAt(match);
  await Prediction.update(
    { opensAt: correctOpensAt },
    {
      where: {
        matchId: match.id,
        category: "punter_card",
        opensAt: { [Op.gt]: correctOpensAt },
      },
    }
  );

  const existing = await Prediction.count({
    where: { matchId: match.id, category: "punter_card" },
  });
  if (existing > 0) {
    // If only the team-level 7 exist (player pool was missing earlier), backfill the player 3.
    const playerSet = await Prediction.count({
      where: {
        matchId: match.id,
        category: "punter_card",
        templateKey: { [Op.in]: ["punter_motm", "punter_top_batter", "punter_top_bowler"] },
      },
    });
    if (playerSet >= 3) return { created: 0, existing };
    const pool = await resolveSquadPool(match);
    if (!pool) return { created: 0, existing };
    const all = buildPunterCardQuestions(match, pool);
    const playerOnly = all.filter(q =>
      q.templateKey === "punter_motm" ||
      q.templateKey === "punter_top_batter" ||
      q.templateKey === "punter_top_bowler"
    );
    const opensAt = punterOpensAt(match);
    const expiresAt = new Date(match.startTime);
    let created = 0;
    for (const q of playerOnly) {
      await Prediction.create({ ...q, opensAt, expiresAt } as any);
      created += 1;
    }
    return { created, existing };
  }

  const pool = await resolveSquadPool(match);
  const questions = buildPunterCardQuestions(match, pool);
  const opensAt = punterOpensAt(match);
  const expiresAt = new Date(match.startTime);
  let created = 0;
  for (const q of questions) {
    await Prediction.create({ ...q, opensAt, expiresAt } as any);
    created += 1;
  }
  return { created, existing: 0 };
}

// "Midnight on match day" — IST midnight, computed explicitly so this works
// on a UTC EC2 host. Without the explicit IST math, `setHours(0,0,0,0)` on
// a UTC server gives midnight UTC = 5:30 AM IST, and the lobby would refuse
// to open the card until then. IST-only product so the offset is hardcoded.
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

export function punterOpensAt(match: Match): Date {
  const start = new Date(match.startTime);
  // Shift to IST wall-clock, snap to the IST date's start-of-day, shift back.
  const istWall = new Date(start.getTime() + IST_OFFSET_MS);
  istWall.setUTCHours(0, 0, 0, 0);
  return new Date(istWall.getTime() - IST_OFFSET_MS);
}

// ---- Resolver ----

// Resolve all 10 punter-card questions for a finished match. Reads
// match.scoreData / final scorecard to pick correct options. Idempotent —
// skips already-resolved rows.
// Early-resolver: resolve only the templateKeys whose answer is known at the
// caller's current moment. The match-end `resolvePunterCard` later picks up
// whatever's still unresolved. Each call is idempotent — already-resolved
// rows are skipped via the status filter.
//
// Usage:
//   - At toss detection:   { tossWinnerShort: "RR" }
//   - At innings break:    { inn1AnyHit50, inn1AnyHit100 } (boolean each)
export async function resolvePunterCardEarly(
  matchId: string,
  opts: {
    tossWinnerShort?: string | null;
    inn1AnyHit50?: boolean | null;
    inn1AnyHit100?: boolean | null;
  },
  io?: SocketIOServer | null,
): Promise<{ resolved: number }> {
  const match = await Match.findByPk(matchId);
  if (!match) return { resolved: 0 };

  // Build a map of (templateKey → correctOption) for the templates we can
  // answer right now. Anything not in the map is left for the next caller.
  const correctByTemplate = new Map<PunterTemplate, string>();

  if (opts.tossWinnerShort) {
    if (opts.tossWinnerShort === match.team1Short) correctByTemplate.set("punter_toss_winner", "team1");
    else if (opts.tossWinnerShort === match.team2Short) correctByTemplate.set("punter_toss_winner", "team2");
  }
  if (opts.inn1AnyHit50 != null) {
    correctByTemplate.set("punter_inn1_50", opts.inn1AnyHit50 ? "yes" : "no");
  }
  if (opts.inn1AnyHit100 != null) {
    correctByTemplate.set("punter_inn1_100", opts.inn1AnyHit100 ? "yes" : "no");
  }

  if (correctByTemplate.size === 0) return { resolved: 0 };

  const cards = await Prediction.findAll({
    where: {
      matchId,
      category: "punter_card",
      status: { [Op.ne]: "resolved" },
      templateKey: { [Op.in]: Array.from(correctByTemplate.keys()) },
    },
  });

  let resolved = 0;
  for (const pred of cards) {
    const tk = (pred as any).templateKey as PunterTemplate | null;
    if (!tk) continue;
    const correct = correctByTemplate.get(tk);
    if (!correct) continue;
    await pred.update({ correctOption: correct, status: "resolved" });
    await scorePunterUserAnswers(pred.id, correct, pred.options, io);
    resolved += 1;
  }
  return { resolved };
}

// Match-end resolver. Computes every templateKey from raw fixture + balls
// data — does NOT trust `match.scoreData.innings1.batsmen[]` etc. because
// those fields are never reliably populated by the poll. fixture/balls are
// passed in by the caller (sportsmonkApi finalizeMatch).
export async function resolvePunterCard(
  matchId: string,
  fixture?: any,
  allBalls?: any[],
  io?: SocketIOServer | null,
): Promise<{ resolved: number }> {
  const match = await Match.findByPk(matchId);
  if (!match) return { resolved: 0 };
  const cards = await Prediction.findAll({
    where: { matchId, category: "punter_card", status: { [Op.ne]: "resolved" } },
  });
  if (cards.length === 0) return { resolved: 0 };

  const balls: any[] = Array.isArray(allBalls) ? allBalls : [];
  const fix: any = fixture || {};

  // Hydrate the in-memory learned-alias cache for this match's two teams.
  // SquadOverride rows written by past matches' syncSquadFromMatch carry
  // (canonicalName → playerName) pairs that resolveBallName can short-
  // circuit through ahead of the fuzzy fallback. Cleared first so a stale
  // cache from a different match's resolution can't bleed in.
  try {
    const { SquadOverride } = await import("../models");
    const teamShorts = [match.team1Short, match.team2Short]
      .filter((s): s is string => !!s)
      .map((s) => s.toUpperCase());
    if (teamShorts.length > 0) {
      const rows = await SquadOverride.findAll({
        where: { team: { [Op.in]: teamShorts }, removedAt: null },
        attributes: ["playerName", "canonicalName"],
      });
      clearLearnedAliases();
      for (const r of rows) {
        if (r.canonicalName) addLearnedAlias(r.canonicalName, r.playerName);
      }
    }
  } catch (err) {
    // Table may not exist on a fresh deploy before sequelize.sync creates
    // it. Resolver still works via the static + alias + fuzzy tiers.
    console.warn("[PunterCard] could not load learned aliases:", err);
  }

  // Load the squad pool once for the whole batch — v2 head-to-head templates
  // (openers, top-vs-death, overs 16–20, balls/boundary) need it to map
  // batsman names to teams. Cheap (one DB read or hardcoded lookup) so we
  // always pay the cost; v1 templates ignore the arg.
  const pool = await resolveSquadPool(match);

  let resolved = 0;
  for (const pred of cards) {
    const tk = (pred as any).templateKey as PunterTemplate | null;
    if (!tk) continue;
    const correct = computeCorrectFromBalls(
      { templateKey: tk, options: pred.options as { key: string; label: string }[] },
      fix,
      balls,
      match,
      pool,
    );
    if (!correct) continue;
    if (correct === VOID_OPTION) {
      // Close the prediction without crediting or debiting anyone. We DON'T
      // touch UserPredictions — leaving isCorrect=null marks them as
      // "settled, no result". Frontend can detect a void by matching
      // correctOption against VOID_OPTION (or "__void__"). No socket
      // emissions either: nothing changed on the leaderboard.
      await pred.update({ correctOption: VOID_OPTION, status: "resolved" });
      resolved += 1;
      continue;
    }
    await pred.update({ correctOption: correct, status: "resolved" });
    await scorePunterUserAnswers(pred.id, correct, pred.options, io);
    resolved += 1;
  }
  return { resolved };
}

// New signature accepts the full prediction (so v2 head-to-head templates can
// extract the player names baked into option labels) plus optional match +
// squad pool (so the team-vs-team templates can map scoreboard ↔ team without
// guessing). All new args are optional so legacy v1 templates keep working
// unchanged.
export function computeCorrectFromBalls(
  pred: { templateKey: string; options: { key: string; label: string }[] },
  fixture: any,
  allBalls: any[],
  match?: Match | null,
  pool?: SquadSource | null,
): string | null {
  const tk = pred.templateKey as PunterTemplate;
  switch (tk) {
    // -------- v1 templates retained for already-generated cards --------
    case "punter_match_winner": {
      const wid = fixture?.winner_team_id;
      if (wid == null) return null;
      if (wid === fixture.localteam_id) return "team1";
      if (wid === fixture.visitorteam_id) return "team2";
      return null;
    }
    case "punter_toss_winner": {
      const tid = fixture?.toss_won_team_id;
      if (tid == null) return null;
      if (tid === fixture.localteam_id) return "team1";
      if (tid === fixture.visitorteam_id) return "team2";
      return null;
    }
    case "punter_inn1_50":  return anyBatsmanReached(allBalls, "S1", 50)  ? "yes" : "no";
    case "punter_inn1_100": return anyBatsmanReached(allBalls, "S1", 100) ? "yes" : "no";
    case "punter_inn2_50":  return anyBatsmanReached(allBalls, "S2", 50)  ? "yes" : "no";
    case "punter_inn2_100": return anyBatsmanReached(allBalls, "S2", 100) ? "yes" : "no";
    case "punter_highest_at_1st_dismissal": {
      const t1Score = scoreAtFirstWicketFromBalls(allBalls, "S1");
      const t2Score = scoreAtFirstWicketFromBalls(allBalls, "S2");
      if (t1Score == null || t2Score == null) return null;
      if (t1Score > t2Score) return "team1";
      if (t2Score > t1Score) return "team2";
      return "draw";
    }
    case "punter_motm": {
      // Sportsmonk reports man_of_match_id post-game. Try to map the id back
      // to a name from balls. Fall back to the top batter winners (already
      // tie-broken). Single winner only — no multi-MoM in cricket.
      const motmId = fixture?.man_of_match_id;
      if (motmId) {
        const name = nameForPlayerId(allBalls, Number(motmId));
        if (name) return playerKey(name);
        const fixtureName = playerNameById(fixture, Number(motmId));
        if (fixtureName) return playerKey(fixtureName);
      }
      const winners = topBatterWinners(allBalls);
      if (winners.length === 0) {
        const fixtureWinners = topBatterWinnersFromFixture(fixture);
        if (fixtureWinners.length === 0) return null;
        return playerKey(fixtureWinners[0]);
      }
      return playerKey(winners[0]);
    }
    case "punter_top_batter": {
      // Tie-break: most runs, then fewer balls, then award all tied. Encoded
      // as a comma-joined list of player keys; scorePunterUserAnswers grants
      // points to anyone who picked any winner.
      const winners = topBatterWinners(allBalls);
      if (winners.length === 0) {
        const fixtureWinners = topBatterWinnersFromFixture(fixture);
        if (fixtureWinners.length === 0) return null;
        return fixtureWinners.map(playerKey).join(",");
      }
      return winners.map(playerKey).join(",");
    }
    case "punter_top_bowler": {
      // Tie-break: most wickets, then fewer runs conceded, then award all tied.
      const winners = topBowlerWinners(allBalls);
      if (winners.length === 0) {
        const fixtureWinners = topBowlerWinnersFromFixture(fixture);
        if (fixtureWinners.length === 0) return null;
        return fixtureWinners.map(playerKey).join(",");
      }
      return winners.map(playerKey).join(",");
    }

    // -------- v2 head-to-head templates --------
    case "punter_star_batter_lower": {
      // Two player options + a "Tie" sentinel. If either named player isn't
      // in today's actual XI (announced at toss → match.team1Players /
      // team2Players), VOID the question — the head-to-head premise is
      // broken.
      //
      // Name resolution is fuzzy (see playerNameMatch.ts) because squad-
      // side spellings like "Prabhsimran Singh" don't always exact-match
      // Sportsmonk's "Prabh Simran Singh". A previous bug here returned
      // ALL_CORRECT ("Tie") whenever the lookup silently fell back to 0
      // for both players, even when one clearly outscored the other.
      const players = pred.options.filter((o) => o.key !== ALL_CORRECT_OPTION);
      if (players.length !== 2) return null;
      const p1 = players[0], p2 = players[1];
      const p1Name = playerNameForOption(p1, pool);
      const p2Name = playerNameForOption(p2, pool);
      const lineup = match?.team1Players || match?.team2Players
        ? [...(match?.team1Players || []), ...(match?.team2Players || [])]
        : null;
      if (lineup && lineup.length > 0) {
        if (!isInLineup(p1Name, lineup) || !isInLineup(p2Name, lineup)) {
          return VOID_OPTION;
        }
      }
      const r1 = runsByBatterName(allBalls, p1Name, fixture);
      const r2 = runsByBatterName(allBalls, p2Name, fixture);
      // Once the XI check has confirmed both players are in today's
      // announced lineup, a null from runsByBatterName is no longer
      // ambiguous — it means "didn't face a ball", which is genuinely a 0.
      // The "Tied" sentinel option exists precisely for this case (e.g.
      // both batters got out before scoring, both never came in). Only
      // VOID when XI couldn't be checked AND we still have a null —
      // that's the unresolvable case where we'd otherwise fabricate a tie.
      const xiConfirmed = lineup && lineup.length > 0;
      if (xiConfirmed) {
        const a = r1 ?? 0;
        const b = r2 ?? 0;
        if (a < b) return p1.key;
        if (b < a) return p2.key;
        return ALL_CORRECT_OPTION;
      }
      if (r1 == null || r2 == null) return VOID_OPTION;
      if (r1 < r2) return p1.key;
      if (r2 < r1) return p2.key;
      return ALL_CORRECT_OPTION;
    }
    case "punter_wk_better_sr": {
      // Higher strike rate wins. SR = runs / legal balls faced * 100.
      // Promote the same XI void check + fuzzy lookup pattern as
      // star_batter_lower above. Previously, a name mismatch produced
      // null+null → "Neither bats" — the exact bug that surfaced in the
      // PBKS-vs-RR match (Prabhsimran "Neither bats" despite scoring 59).
      const players = pred.options.filter((o) => o.key !== ALL_CORRECT_OPTION);
      if (players.length !== 2) return null;
      const p1 = players[0], p2 = players[1];
      const p1Name = playerNameForOption(p1, pool);
      const p2Name = playerNameForOption(p2, pool);
      const lineup = match?.team1Players || match?.team2Players
        ? [...(match?.team1Players || []), ...(match?.team2Players || [])]
        : null;
      if (lineup && lineup.length > 0) {
        if (!isInLineup(p1Name, lineup) || !isInLineup(p2Name, lineup)) {
          return VOID_OPTION;
        }
      }
      const sr1 = strikeRateForBatter(allBalls, p1Name, fixture);
      const sr2 = strikeRateForBatter(allBalls, p2Name, fixture);
      // XI-confirmed both → null means "never faced a legal ball" which
      // makes the ALL_CORRECT_OPTION sentinel (literally labelled
      // "Neither bats" for this template) the right answer. Only VOID
      // when XI wasn't populated and we can't tell whether a null is
      // "didn't play" or "name didn't resolve".
      const xiConfirmed = lineup && lineup.length > 0;
      if (xiConfirmed) {
        if (sr1 == null && sr2 == null) return ALL_CORRECT_OPTION;
        if (sr1 == null) return p2.key;
        if (sr2 == null) return p1.key;
        if (sr1 > sr2) return p1.key;
        if (sr2 > sr1) return p2.key;
        return ALL_CORRECT_OPTION;
      }
      if (sr1 == null || sr2 == null) return VOID_OPTION;
      if (sr1 > sr2) return p1.key;
      if (sr2 > sr1) return p2.key;
      return ALL_CORRECT_OPTION;
    }
    case "punter_openers_more_boundaries": {
      // Need pool to map each team to its batting scoreboard (S1/S2). The
      // openers themselves are detected from ball-by-ball data — the first
      // two unique batters seen on each scoreboard. Picking from the squad
      // list (the previous approach) was fragile because Sportsmonk's
      // `batsman.fullname` occasionally differs from squad names (e.g.
      // "Faf du Plessis" vs "Faf Du Plessis", "KL Rahul" vs "Lokesh Rahul"),
      // which could leave both teams' boundary count at 0 and force a Tie
      // even when the actual scoreboard had a clear winner.
      if (!pool) return null;
      const t1Sb = scoreboardForTeam(allBalls, pool.team1Players);
      const t2Sb = scoreboardForTeam(allBalls, pool.team2Players);
      if (!t1Sb || !t2Sb) return null;
      const t1Op = detectOpenersFromBalls(allBalls, t1Sb);
      const t2Op = detectOpenersFromBalls(allBalls, t2Sb);
      if (!t1Op || !t2Op) return null;
      const t1Bnd = boundariesByBatterNames(allBalls, t1Op);
      const t2Bnd = boundariesByBatterNames(allBalls, t2Op);
      if (t1Bnd > t2Bnd) return "team1";
      if (t2Bnd > t1Bnd) return "team2";
      return ALL_CORRECT_OPTION;
    }
    case "punter_allrounder_impact": {
      // Impact index = batting runs + wickets taken (excl run-outs) +
      // catches taken. Same XI-void + fuzzy-resolve treatment as the other
      // head-to-heads. If a player simply didn't bat / bowl / field a
      // dismissal, impactIndexForPlayer returns null — that's a real "no
      // data" signal, not a 0, so VOID rather than fake-comparing zeros.
      const players = pred.options.filter((o) => o.key !== ALL_CORRECT_OPTION);
      if (players.length !== 2) return null;
      const p1 = players[0], p2 = players[1];
      const p1Name = playerNameForOption(p1, pool);
      const p2Name = playerNameForOption(p2, pool);
      const lineup = match?.team1Players || match?.team2Players
        ? [...(match?.team1Players || []), ...(match?.team2Players || [])]
        : null;
      if (lineup && lineup.length > 0) {
        if (!isInLineup(p1Name, lineup) || !isInLineup(p2Name, lineup)) {
          return VOID_OPTION;
        }
      }
      const v1 = impactIndexForPlayer(allBalls, p1Name, fixture);
      const v2 = impactIndexForPlayer(allBalls, p2Name, fixture);
      // XI-confirmed both → null impact = "didn't bat / bowl / take a
      // catch" which is a genuine 0. Two zeros → ALL_CORRECT (Tied),
      // not a fabricated VOID. Only VOID when XI wasn't populated.
      const xiConfirmed = lineup && lineup.length > 0;
      if (xiConfirmed) {
        const a = v1 ?? 0;
        const b = v2 ?? 0;
        if (a > b) return p1.key;
        if (b > a) return p2.key;
        return ALL_CORRECT_OPTION;
      }
      if (v1 == null || v2 == null) return VOID_OPTION;
      if (v1 > v2) return p1.key;
      if (v2 > v1) return p2.key;
      return ALL_CORRECT_OPTION;
    }
    case "punter_first_event": {
      // Chronological scan from innings 1 ball 0.1 forwards. The FIRST ball
      // that is either a six OR a wicket (run-outs included — they're part
      // of the scoreboard story even if no bowler credit) decides the
      // answer. If the match has neither in any innings → null.
      const ev = firstSixOrWicketEvent(allBalls);
      return ev; // "six" | "wicket" | null
    }
    case "punter_top_vs_death": {
      // team1 top order = runs by team1 openers + #3 batter (across both
      // innings — they only bat in their team's batting innings anyway).
      // team2 death bowling = runs given by team2 bowlers in overs 16–20
      // of team1's batting innings.
      // Whichever side's number is HIGHER is the bigger letdown:
      //   - If team2 bowlers leaked more than team1 top order scored → team2.
      //   - If team1 top order scored less than team2 bowlers gave up → team1
      //     (their batting let everyone down).
      // (User's spec, paraphrased: "if bowling runs > batsmen runs, GT
      //  (the bowling side) is the answer".)
      if (!pool) return null;
      const t1Op = pickOpeners(pool.team1Players);
      const t1Three = pickThreeBatter(pool.team1Players);
      if (!t1Op || !t1Three) return null;
      const topOrderRuns = runsForBatterNames(allBalls, [t1Op[0].name, t1Op[1].name, t1Three.name]);
      // Scoreboard team1 batted in:
      const t1Sb = scoreboardForTeam(allBalls, pool.team1Players);
      if (!t1Sb) return null;
      const deathBowlingRuns = bowlerRunsConcededInRange(allBalls, t1Sb, 16, 20, pool.team2Players);
      if (topOrderRuns === 0 && deathBowlingRuns === 0) return null;
      if (deathBowlingRuns > topOrderRuns) return "team2";
      if (topOrderRuns > deathBowlingRuns) return "team1";
      return ALL_CORRECT_OPTION;
    }
    case "punter_overs_16_20_runs": {
      // Sum total ball runs (incl. extras) in overs 16–20 of EACH team's
      // batting innings. Higher total = the answer.
      const t1Sb = pool ? scoreboardForTeam(allBalls, pool.team1Players) : null;
      const t2Sb = pool ? scoreboardForTeam(allBalls, pool.team2Players) : null;
      // Fallback: assume team1 batted S1 if pool missing or detection failed.
      const sb1: "S1" | "S2" = t1Sb ?? "S1";
      const sb2: "S1" | "S2" = t2Sb ?? (sb1 === "S1" ? "S2" : "S1");
      const r1 = totalRunsInOverRange(allBalls, sb1, 16, 20);
      const r2 = totalRunsInOverRange(allBalls, sb2, 16, 20);
      if (r1 === 0 && r2 === 0) return null;
      if (r1 > r2) return "team1";
      if (r2 > r1) return "team2";
      return ALL_CORRECT_OPTION;
    }
    case "punter_balls_per_boundary": {
      // dots ÷ boundaries per innings. Higher ratio = more wasteful = answer.
      // Zero boundaries → ratio = +∞ (that team wins the "wasteful" title).
      const t1Sb = pool ? scoreboardForTeam(allBalls, pool.team1Players) : null;
      const t2Sb = pool ? scoreboardForTeam(allBalls, pool.team2Players) : null;
      const sb1: "S1" | "S2" = t1Sb ?? "S1";
      const sb2: "S1" | "S2" = t2Sb ?? (sb1 === "S1" ? "S2" : "S1");
      const r1 = dotsPerBoundary(allBalls, sb1);
      const r2 = dotsPerBoundary(allBalls, sb2);
      if (r1 == null && r2 == null) return null;
      if (r1 == null) return "team2";
      if (r2 == null) return "team1";
      if (r1 > r2) return "team1";
      if (r2 > r1) return "team2";
      return ALL_CORRECT_OPTION;
    }
  }
  return null;
}

// ==== v2 helpers — single-player + per-team computations =====================

// Total batting runs across BOTH innings for a named batter. Resolves the
// squad-side `name` to the actual fullname Sportsmonk uses on this match's
// balls (via the alias + fuzzy matcher in playerNameMatch.ts) before doing
// the per-ball comparison — so a "Prabhsimran Singh" squad name lands on a
// "Prabh Simran Singh" ball entry. Returns null if the player never faced a
// ball — distinguishes "we don't know" from "scored 0".
function cleanOptionPlayerLabel(label: string): string {
  return String(label || "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function playerNameForOption(
  option: { key: string; label: string },
  pool?: SquadSource | null,
): string {
  const clean = cleanOptionPlayerLabel(option.label);
  if (pool) {
    const all = [...pool.team1Players, ...pool.team2Players];
    const byKey = all.find((p) => playerKey(p.name) === option.key);
    if (byKey) return byKey.name;
    const fuzzy = findFuzzyMatch(clean, all.map((p) => p.name));
    if (fuzzy) return fuzzy;
  }
  return clean;
}

function fixtureArray(fixture: any, key: "batting" | "bowling" | "lineup"): any[] {
  const raw = fixture?.[key];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function playerNameById(fixture: any, id: unknown): string | null {
  if (id == null) return null;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return null;
  for (const p of fixtureArray(fixture, "lineup")) {
    if (Number(p?.id) === numeric) return p.fullname || p.name || null;
  }
  return null;
}

function fixtureBattingRow(fixture: any, name: string): any | null {
  const rows = fixtureArray(fixture, "batting");
  const names = rows
    .map((r) => playerNameById(fixture, r?.player_id))
    .filter((n): n is string => !!n);
  const matchedName = findFuzzyMatch(name, names);
  if (!matchedName) return null;
  return rows.find((r) => playerNameById(fixture, r?.player_id) === matchedName) || null;
}

function fixtureBowlingRow(fixture: any, name: string): any | null {
  const rows = fixtureArray(fixture, "bowling");
  const names = rows
    .map((r) => playerNameById(fixture, r?.player_id))
    .filter((n): n is string => !!n);
  const matchedName = findFuzzyMatch(name, names);
  if (!matchedName) return null;
  return rows.find((r) => playerNameById(fixture, r?.player_id) === matchedName) || null;
}

function topBatterWinnersFromFixture(fixture: any): string[] {
  const rows = fixtureArray(fixture, "batting")
    .map((row) => ({
      name: playerNameById(fixture, row?.player_id),
      runs: Number(row?.score ?? 0),
      balls: Number(row?.ball ?? Number.POSITIVE_INFINITY),
    }))
    .filter((row) => !!row.name);
  if (rows.length === 0) return [];
  const bestRuns = Math.max(...rows.map((row) => row.runs));
  const runLeaders = rows.filter((row) => row.runs === bestRuns);
  const bestBalls = Math.min(...runLeaders.map((row) => row.balls));
  return runLeaders.filter((row) => row.balls === bestBalls).map((row) => row.name!) ;
}

function topBowlerWinnersFromFixture(fixture: any): string[] {
  const rows = fixtureArray(fixture, "bowling")
    .map((row) => ({
      name: playerNameById(fixture, row?.player_id),
      wickets: Number(row?.wickets ?? 0),
      runs: Number(row?.runs ?? Number.POSITIVE_INFINITY),
    }))
    .filter((row) => !!row.name);
  if (rows.length === 0) return [];
  const bestWickets = Math.max(...rows.map((row) => row.wickets));
  const wicketLeaders = rows.filter((row) => row.wickets === bestWickets);
  const bestRuns = Math.min(...wicketLeaders.map((row) => row.runs));
  return wicketLeaders.filter((row) => row.runs === bestRuns).map((row) => row.name!);
}

function playerMatchesAny(name: string, players: Player[]): boolean {
  return findFuzzyMatch(name, players.map((p) => p.name)) !== null;
}

function runsByBatterName(allBalls: any[], name: string, fixture?: any): number | null {
  const resolved = resolveBallName(name, allBalls, "batsman");
  if (resolved) {
    const target = resolved.toLowerCase().trim();
    let total = 0;
    let appeared = false;
    for (const b of allBalls) {
      const bname = b.batsman?.fullname?.toLowerCase().trim();
      if (bname !== target) continue;
      appeared = true;
      total += batRunsOnBall(b);
    }
    if (appeared) return total;
  }
  const row = fixtureBattingRow(fixture, name);
  return row ? Number(row.score ?? 0) : null;
}

// Same shape as runsByBatterName but sums across multiple players (used for
// the openers + #3 collective in the top-vs-death template).
function runsForBatterNames(allBalls: any[], names: string[]): number {
  const set = new Set(
    names
      .map((n) => resolveBallName(n, allBalls, "batsman") || n)
      .map((n) => n.toLowerCase().trim())
  );
  let total = 0;
  for (const b of allBalls) {
    const bname = b.batsman?.fullname?.toLowerCase().trim();
    if (!bname || !set.has(bname)) continue;
    total += batRunsOnBall(b);
  }
  return total;
}

// Strike rate for a single batter across both innings. Resolves squad-side
// names to the actual Sportsmonk fullname before comparing per-ball.
// Returns null if they never faced a legal ball.
function strikeRateForBatter(allBalls: any[], name: string, fixture?: any): number | null {
  const resolved = resolveBallName(name, allBalls, "batsman");
  if (resolved) {
    const target = resolved.toLowerCase().trim();
    let runs = 0;
    let legalBalls = 0;
    for (const b of allBalls) {
      const bname = b.batsman?.fullname?.toLowerCase().trim();
      if (bname !== target) continue;
      if (b.score?.ball === false) continue;
      legalBalls += 1;
      runs += batRunsOnBall(b);
    }
    if (legalBalls > 0) return (runs / legalBalls) * 100;
  }
  const row = fixtureBattingRow(fixture, name);
  const balls = Number(row?.ball ?? 0);
  if (!row || balls <= 0) return null;
  const rate = Number(row.rate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  return (Number(row.score ?? 0) / balls) * 100;
}

// Counts boundaries (4s + 6s) across both innings for any batter in `names`.
// Prefers Sportsmonk's `score.four`/`score.six` flags; falls back to the
// runs-on-ball check (matches the same `isFour`/`isSix` semantics used
// elsewhere in the resolver pipeline).
function boundariesByBatterNames(allBalls: any[], names: string[]): number {
  const set = new Set(names.map((n) => n.toLowerCase().trim()));
  let count = 0;
  for (const b of allBalls) {
    const bname = b.batsman?.fullname?.toLowerCase().trim();
    if (!bname || !set.has(bname)) continue;
    if (b.score?.four || b.score?.six) {
      count += 1;
      continue;
    }
    const r = batRunsOnBall(b);
    if (r === 4 || r === 6) count += 1;
  }
  return count;
}

// Impact index = total batting runs + wickets taken (excl. run-outs) +
// catches taken. Resolves the squad-side name against the union of
// batsman + bowler fullnames seen in the match (an all-rounder by
// definition could appear in either pool). Returns null only if the
// player never appeared on any ball.
function impactIndexForPlayer(allBalls: any[], name: string, fixture?: any): number | null {
  const resolved = resolveBallName(name, allBalls, "any");
  const fixtureBat = fixtureBattingRow(fixture, name);
  const fixtureBowl = fixtureBowlingRow(fixture, name);
  if (!resolved && !fixtureBat && !fixtureBowl) return null;
  const target = (resolved || playerNameById(fixture, fixtureBat?.player_id) || playerNameById(fixture, fixtureBowl?.player_id) || name)
    .toLowerCase()
    .trim();
  let runs = 0, wickets = 0, catches = 0;
  let appeared = false;
  for (const b of allBalls) {
    const bat = b.batsman?.fullname?.toLowerCase().trim();
    const bowl = b.bowler?.fullname?.toLowerCase().trim();
    const fielder = b.catchstump?.fullname?.toLowerCase().trim();

    if (bat === target) {
      appeared = true;
      runs += batRunsOnBall(b);
    }
    if (bowl === target) {
      appeared = true;
      if (b.score?.is_wicket || b.batsmanout_id) {
        const dismissalName = (b.score?.name || "").toLowerCase();
        if (!dismissalName.includes("run out")) wickets += 1;
      }
    }
    if (fielder === target) {
      const dismissalName = (b.score?.name || "").toLowerCase();
      if (dismissalName.includes("caught") || dismissalName === "catch out" || dismissalName.includes("c & b")) {
        appeared = true;
        catches += 1;
      }
    }
  }
  if (fixtureBat) {
    appeared = true;
    runs = Math.max(runs, Number(fixtureBat.score ?? 0));
  }
  if (fixtureBowl) {
    appeared = true;
    wickets = Math.max(wickets, Number(fixtureBowl.wickets ?? 0));
  }
  if (!appeared) return null;
  return runs + wickets + catches;
}

// First two unique batters to face a ball on a given scoreboard. These are
// the actual openers — robust against squad-name mismatches between our
// roster data and Sportsmonk's `batsman.fullname`.
function detectOpenersFromBalls(
  allBalls: any[],
  scoreboard: "S1" | "S2",
): [string, string] | null {
  const seen: string[] = [];
  const innBalls = allBalls
    .filter((b) => b.scoreboard === scoreboard)
    .sort((a, b) => parseFloat(String(a.ball || "0")) - parseFloat(String(b.ball || "0")));
  for (const b of innBalls) {
    const name = b.batsman?.fullname;
    if (!name) continue;
    if (seen.includes(name)) continue;
    seen.push(name);
    if (seen.length === 2) return [seen[0], seen[1]];
  }
  return null;
}

// Walk balls in chronological order (innings 1 first, then innings 2),
// looking for the FIRST ball that's either a six or a wicket. Returns the
// matching event keyword, or null if neither happened in either innings.
function firstSixOrWicketEvent(allBalls: any[]): "six" | "wicket" | null {
  for (const sb of ["S1", "S2"] as const) {
    const innBalls = allBalls
      .filter((b) => b.scoreboard === sb)
      .sort((a, b) => parseFloat(String(a.ball || "0")) - parseFloat(String(b.ball || "0")));
    for (const b of innBalls) {
      const wicket = b.score?.is_wicket || b.batsmanout_id;
      const six = b.score?.six || batRunsOnBall(b) === 6;
      // If both happen on the same ball (extremely rare — e.g. six followed
      // by run-out attempt off the same delivery — Sportsmonk usually splits
      // these), prefer the wicket since it's the more decisive event.
      if (wicket) return "wicket";
      if (six) return "six";
    }
  }
  return null;
}

// Detect which scoreboard (S1 / S2) a team batted in by counting how often
// their squad members appear as batsmen on each scoreboard. Robust against
// a stray substitute: the team's actual batting innings will dominate.
export function scoreboardForTeam(allBalls: any[], teamPlayers: Player[]): "S1" | "S2" | null {
  if (!teamPlayers?.length) return null;
  let s1 = 0, s2 = 0;
  for (const b of allBalls) {
    const bn = b.batsman?.fullname;
    if (!bn || !playerMatchesAny(bn, teamPlayers)) continue;
    if (b.scoreboard === "S1") s1 += 1;
    else if (b.scoreboard === "S2") s2 += 1;
  }
  if (s1 === 0 && s2 === 0) return null;
  return s1 >= s2 ? "S1" : "S2";
}

// Sum of total ball runs (Sportsmonk's `score.runs` is already the team
// total for that ball, including extras) in a scoreboard's overs [from..to]
// inclusive. T20 over numbering: over N corresponds to ball.ball values in
// [N-1, N) — i.e. floor(b.ball) === N - 1.
function totalRunsInOverRange(
  allBalls: any[],
  scoreboard: "S1" | "S2",
  fromOver: number,
  toOver: number,
): number {
  const fromIdx = fromOver - 1;
  const toIdx = toOver - 1;
  let total = 0;
  for (const b of allBalls) {
    if (b.scoreboard !== scoreboard) continue;
    const ov = Math.floor(parseFloat(String(b.ball || "0")));
    if (ov < fromIdx || ov > toIdx) continue;
    total += Number(b.score?.runs || 0);
  }
  return total;
}

// Runs given by a SET of bowlers in a specific scoreboard's over range.
// Used for "team B's death bowling damage in team A's innings 16–20".
function bowlerRunsConcededInRange(
  allBalls: any[],
  scoreboard: "S1" | "S2",
  fromOver: number,
  toOver: number,
  bowlers: Player[],
): number {
  const fromIdx = fromOver - 1;
  const toIdx = toOver - 1;
  let total = 0;
  for (const b of allBalls) {
    if (b.scoreboard !== scoreboard) continue;
    const ov = Math.floor(parseFloat(String(b.ball || "0")));
    if (ov < fromIdx || ov > toIdx) continue;
    const bowlName = b.bowler?.fullname;
    if (!bowlName || !playerMatchesAny(bowlName, bowlers)) continue;
    total += Number(b.score?.runs || 0);
  }
  return total;
}

// Dots ÷ boundaries for a team's batting innings.
// Dot ball = legal delivery that produced 0 runs total (incl. extras). Wides
// and no-balls are not "faced" so they never count as dots either way.
// Returns null if the innings has zero balls at all (no data).
function dotsPerBoundary(allBalls: any[], scoreboard: "S1" | "S2"): number | null {
  let dots = 0;
  let boundaries = 0;
  let any = false;
  for (const b of allBalls) {
    if (b.scoreboard !== scoreboard) continue;
    any = true;
    const isLegal = b.score?.ball !== false;
    if (!isLegal) continue;
    const isBoundary = b.score?.four || b.score?.six || batRunsOnBall(b) === 4 || batRunsOnBall(b) === 6;
    if (isBoundary) boundaries += 1;
    else if (Number(b.score?.runs || 0) === 0) dots += 1;
  }
  if (!any) return null;
  if (boundaries === 0) return Number.POSITIVE_INFINITY;
  return dots / boundaries;
}

// ---- Ball-level helpers ----

// Sum of batsman runs from a single ball (extras stripped out).
function batRunsOnBall(b: any): number {
  const s = b?.score || {};
  const extras = Number(s.bye || 0) + Number(s.leg_bye || 0) + Number(s.noball_runs || 0);
  return Math.max(0, Number(s.runs || 0) - extras);
}

// Builds {name -> total runs} for a given innings's striker-faced balls.
function runsByBatsman(allBalls: any[], scoreboard: "S1" | "S2"): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of allBalls) {
    if (b.scoreboard !== scoreboard) continue;
    const name = b.batsman?.fullname;
    if (!name) continue;
    m.set(name, (m.get(name) || 0) + batRunsOnBall(b));
  }
  return m;
}

function anyBatsmanReached(allBalls: any[], scoreboard: "S1" | "S2", threshold: number): boolean {
  for (const r of runsByBatsman(allBalls, scoreboard).values()) {
    if (r >= threshold) return true;
  }
  return false;
}

// Count legal balls each batsman faced in an innings (no-ball / wide are
// not faced; bye / leg-bye ARE faced legal balls).
function ballsFacedByBatsman(allBalls: any[], scoreboard: "S1" | "S2"): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of allBalls) {
    if (b.scoreboard !== scoreboard) continue;
    const name = b.batsman?.fullname;
    if (!name) continue;
    if (b.score?.ball === false) continue; // not a legal delivery
    m.set(name, (m.get(name) || 0) + 1);
  }
  return m;
}

// Top batter winners across BOTH innings — applies the strike-rate tie-break
// rule: highest runs wins; tie on runs → fewer balls faced wins; tie on
// both → award all tied batters. Returns the list of winning names (1+).
function topBatterWinners(allBalls: any[]): string[] {
  // Aggregate per-batsman across both innings.
  const runs = new Map<string, number>();
  const balls = new Map<string, number>();
  for (const sb of ["S1", "S2"] as const) {
    for (const [n, r] of runsByBatsman(allBalls, sb).entries()) {
      runs.set(n, (runs.get(n) || 0) + r);
    }
    for (const [n, b] of ballsFacedByBatsman(allBalls, sb).entries()) {
      balls.set(n, (balls.get(n) || 0) + b);
    }
  }
  if (runs.size === 0) return [];
  let bestRuns = -1;
  for (const r of runs.values()) if (r > bestRuns) bestRuns = r;
  const runLeaders = Array.from(runs.entries()).filter(([, r]) => r === bestRuns).map(([n]) => n);
  if (runLeaders.length <= 1) return runLeaders;
  let bestBalls = Infinity;
  for (const n of runLeaders) {
    const bf = balls.get(n) ?? Infinity;
    if (bf < bestBalls) bestBalls = bf;
  }
  return runLeaders.filter((n) => (balls.get(n) ?? Infinity) === bestBalls);
}

// Sum of total runs (incl. extras) conceded by each bowler in an innings.
function runsConcededByBowler(allBalls: any[], scoreboard: "S1" | "S2"): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of allBalls) {
    if (b.scoreboard !== scoreboard) continue;
    const bowlerName = b.bowler?.fullname;
    if (!bowlerName) continue;
    m.set(bowlerName, (m.get(bowlerName) || 0) + Number(b.score?.runs || 0));
  }
  return m;
}

// Wickets per bowler. Run-outs excluded — bowler doesn't get credit.
function wicketsByBowler(allBalls: any[], scoreboard: "S1" | "S2"): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of allBalls) {
    if (b.scoreboard !== scoreboard) continue;
    if (!b.score?.is_wicket && !b.batsmanout_id) continue;
    const wicketName = (b.score?.name || "").toLowerCase();
    if (wicketName.includes("run out")) continue;
    const bowlerName = b.bowler?.fullname;
    if (!bowlerName) continue;
    m.set(bowlerName, (m.get(bowlerName) || 0) + 1);
  }
  return m;
}

// Top bowler winners across BOTH innings — most wickets wins; tie on
// wickets → fewer runs conceded wins; tie on both → award all tied.
function topBowlerWinners(allBalls: any[]): string[] {
  const wkts = new Map<string, number>();
  const conceded = new Map<string, number>();
  for (const sb of ["S1", "S2"] as const) {
    for (const [n, w] of wicketsByBowler(allBalls, sb).entries()) {
      wkts.set(n, (wkts.get(n) || 0) + w);
    }
    for (const [n, r] of runsConcededByBowler(allBalls, sb).entries()) {
      conceded.set(n, (conceded.get(n) || 0) + r);
    }
  }
  if (wkts.size === 0) return [];
  let bestWkts = -1;
  for (const w of wkts.values()) if (w > bestWkts) bestWkts = w;
  const wktLeaders = Array.from(wkts.entries()).filter(([, w]) => w === bestWkts).map(([n]) => n);
  if (wktLeaders.length <= 1) return wktLeaders;
  let bestRuns = Infinity;
  for (const n of wktLeaders) {
    const r = conceded.get(n) ?? Infinity;
    if (r < bestRuns) bestRuns = r;
  }
  return wktLeaders.filter((n) => (conceded.get(n) ?? Infinity) === bestRuns);
}

// Team's running total at the moment the first wicket fell. We walk balls
// in order, summing total ball runs (Sportsmonk's `score.runs` already
// includes extras for the team total). First ball with `is_wicket` ends the
// scan. Returns null if the innings never lost a wicket and never started.
function scoreAtFirstWicketFromBalls(allBalls: any[], scoreboard: "S1" | "S2"): number | null {
  const innBalls = allBalls
    .filter((b) => b.scoreboard === scoreboard)
    .sort((a, b) => parseFloat(String(a.ball || "0")) - parseFloat(String(b.ball || "0")));
  if (innBalls.length === 0) return null;
  let total = 0;
  for (const b of innBalls) {
    total += Number(b.score?.runs || 0);
    if (b.score?.is_wicket || b.batsmanout_id) return total;
  }
  // No wicket in this innings — return final total (rare but possible).
  return total;
}

// Look up a player's display name from any ball where they appear as
// batsman, non-striker, bowler, or dismissed. Used to map fixture's
// numeric man_of_match_id to a name.
function nameForPlayerId(allBalls: any[], id: number): string | null {
  for (const b of allBalls) {
    if (b.batsman_id === id && b.batsman?.fullname) return b.batsman.fullname;
    if (b.bowler_id === id && b.bowler?.fullname) return b.bowler.fullname;
    if (b.batsmanout_id === id && b.catchstump?.fullname) return b.catchstump.fullname;
  }
  return null;
}

async function scorePunterUserAnswers(
  predictionId: string,
  correctOption: string,
  options: { key: string; label: string; points: number }[],
  io?: SocketIOServer | null,
): Promise<void> {
  // correctOption may be a comma-joined list of keys when multiple players
  // tied (e.g. two batters on the same runs+balls); award points to anyone
  // who picked any of them.
  const correctSet = new Set(correctOption.split(",").map((k) => k.trim()).filter(Boolean));
  const userAnswers = await UserPrediction.findAll({ where: { predictionId } });

  // Track per-user outcomes so we can fire one socket event per affected
  // user / venue+match AFTER the DB transactions commit. Without this the
  // Match leaderboard appears frozen — totalPoints is updated in the DB,
  // but no `leaderboardUpdate` is broadcast so connected clients never
  // re-fetch (regular resolvePrediction in pointsEngine emits both
  // `leaderboardUpdate` and `myPredictionWin`; punter card had neither).
  const winners: Array<{
    userId: string;
    matchId: string;
    venueId: string;
    pointsEarned: number;
    selectedOption: string;
  }> = [];
  const venueMatchPairs = new Set<string>();

  for (const ua of userAnswers) {
    const isCorrect = correctSet.has(ua.selectedOption);
    const opt = options.find(o => o.key === ua.selectedOption);
    const pointsEarned = isCorrect && opt ? opt.points : 0;

    // Idempotency: if this UserPrediction already has a non-null isCorrect,
    // it's already been scored and counted toward participant totals. Skip.
    if (ua.isCorrect !== null && ua.isCorrect !== undefined) continue;

    // Atomically (a) write isCorrect + pointsEarned on the UserPrediction,
    // and (b) bump MatchParticipant.totalPoints + correctPredictions so the
    // Punter Card points flow into the match leaderboard. Punter-card
    // predictions use round=0 so no round{N}Points column gets updated.
    await sequelize.transaction(async (t) => {
      await ua.update({ isCorrect, pointsEarned }, { transaction: t });
      const participant = await MatchParticipant.findOne({
        where: { userId: ua.userId, matchId: ua.matchId, venueId: ua.venueId, roomId: ua.roomId ?? null },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!participant) return;
      const updateData: Record<string, unknown> = {
        totalPredictions: participant.totalPredictions + 1,
      };
      if (isCorrect) {
        updateData.totalPoints = participant.totalPoints + pointsEarned;
        updateData.correctPredictions = participant.correctPredictions + 1;
      }
      await participant.update(updateData as any, { transaction: t });

      // Mirror pointsEngine.resolvePrediction: punter_card wins must also
      // accrue to User.weeklyPoints + lifetimePoints so the bottom-nav
      // weekly badge and /profile lifetime stats include them. Without
      // this update, points show on the leaderboard (MatchParticipant)
      // but silently drop out of the user-scoped totals.
      if (isCorrect && pointsEarned > 0) {
        const user = await User.findByPk(ua.userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (user) {
          const currentWeek = getYearWeekNumber();
          const currentWeeklyPoints = user.weekNumber !== currentWeek ? 0 : user.weeklyPoints;
          await user.update(
            {
              weeklyPoints: Math.max(0, currentWeeklyPoints + pointsEarned),
              weekNumber: currentWeek,
              lifetimePoints: Math.max(0, (user.lifetimePoints || 0) + pointsEarned),
            },
            { transaction: t },
          );
        }
      }
    });

    if (isCorrect && pointsEarned > 0) {
      winners.push({
        userId: ua.userId,
        matchId: ua.matchId,
        venueId: ua.venueId,
        pointsEarned,
        selectedOption: ua.selectedOption,
      });
    }
    venueMatchPairs.add(`${ua.venueId}:${ua.matchId}`);
  }

  // Push the live updates after the loop so all DB writes are durable
  // before clients hear about them. Skip silently if no io was supplied
  // (e.g. the admin re-resolve endpoint passes null — leaderboards there
  // get rebuilt by recomputeParticipantScores afterwards).
  if (!io) return;

  for (const w of winners) {
    io.to(`user:${w.userId}`).emit("myPredictionWin", {
      predictionId,
      pointsEarned: w.pointsEarned,
      selectedOption: w.selectedOption,
    });
  }
  for (const pair of venueMatchPairs) {
    const [venueId, matchId] = pair.split(":");
    io.to(`venue:${venueId}:${matchId}`).emit("leaderboardUpdate", {
      matchId,
    });
  }
}
