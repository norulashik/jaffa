import { Op } from "sequelize";
import { Match, Prediction, UserPrediction, MatchParticipant } from "../models";
import sequelize from "../config/database";
import { playerKey } from "./predictionEngine";
import {
  squadWithRolesForTeam,
  getPlayerRole,
  type Player,
  type PlayerRole,
} from "../data/iplSquads";

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
  "punter_motm",
  "punter_top_batter",
  "punter_top_bowler",
  "punter_inn1_50",
  "punter_inn1_100",
  "punter_inn2_50",
  "punter_inn2_100",
  "punter_highest_at_1st_dismissal",
  "punter_match_winner",
  "punter_toss_winner",
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

  // 2. Hardcoded latest XI from the PDF data. Already role-tagged.
  if (short) {
    const known = squadWithRolesForTeam(short);
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

  // 4-7. Innings 1 & 2 — Any player to score 50 / 100 (Yes/No).
  // Odds reference: Yes-50 ≈ 1.25, No-50 ≈ 3.55, Yes-100 ≈ 7.00, No-100 ≈ 1.07
  out.push({
    matchId, category: "punter_card", round: 0, templateKey: "punter_inn1_50",
    question: "1st Innings — Any Player to Score 50",
    options: [
      { key: "yes", label: "Yes", points: oddsToPoints(1.25) },
      { key: "no",  label: "No",  points: oddsToPoints(3.55) },
    ],
  });
  out.push({
    matchId, category: "punter_card", round: 0, templateKey: "punter_inn1_100",
    question: "1st Innings — Any Player to Score 100",
    options: [
      { key: "yes", label: "Yes", points: oddsToPoints(7.00) },
      { key: "no",  label: "No",  points: oddsToPoints(1.07) },
    ],
  });
  out.push({
    matchId, category: "punter_card", round: 0, templateKey: "punter_inn2_50",
    question: "2nd Innings — Any Player to Score 50",
    options: [
      { key: "yes", label: "Yes", points: oddsToPoints(1.40) },
      { key: "no",  label: "No",  points: oddsToPoints(3.10) },
    ],
  });
  out.push({
    matchId, category: "punter_card", round: 0, templateKey: "punter_inn2_100",
    question: "2nd Innings — Any Player to Score 100",
    options: [
      { key: "yes", label: "Yes", points: oddsToPoints(8.00) },
      { key: "no",  label: "No",  points: oddsToPoints(1.05) },
    ],
  });

  // 8. Team with highest score at 1st dismissal.
  out.push({
    matchId, category: "punter_card", round: 0, templateKey: "punter_highest_at_1st_dismissal",
    question: "Team with Highest Score at 1st Dismissal",
    options: [
      { key: "team1", label: team1Full, points: oddsToPoints(1.90) },
      { key: "draw",  label: "Draw",   points: oddsToPoints(50.00) },
      { key: "team2", label: team2Full, points: oddsToPoints(1.75) },
    ],
  });

  // 9. Winner (Incl. Super Over).
  out.push({
    matchId, category: "punter_card", round: 0, templateKey: "punter_match_winner",
    question: "Winner (Incl. Super Over)",
    options: [
      { key: "team1", label: team1Full, points: oddsToPoints(2.15) },
      { key: "team2", label: team2Full, points: oddsToPoints(1.65) },
    ],
  });

  // 10. Toss winner.
  out.push({
    matchId, category: "punter_card", round: 0, templateKey: "punter_toss_winner",
    question: "Which Team Wins the Coin Toss",
    options: [
      { key: "team1", label: team1Full, points: oddsToPoints(1.90) },
      { key: "team2", label: team2Full, points: oddsToPoints(1.90) },
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
  const merged = uniqueByName(interleave(t1, t2)).slice(0, 14);
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
  }
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
    await scorePunterUserAnswers(pred.id, correct, pred.options);
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
  allBalls?: any[]
): Promise<{ resolved: number }> {
  const match = await Match.findByPk(matchId);
  if (!match) return { resolved: 0 };
  const cards = await Prediction.findAll({
    where: { matchId, category: "punter_card", status: { [Op.ne]: "resolved" } },
  });
  if (cards.length === 0) return { resolved: 0 };

  const balls: any[] = Array.isArray(allBalls) ? allBalls : [];
  const fix: any = fixture || {};

  let resolved = 0;
  for (const pred of cards) {
    const tk = (pred as any).templateKey as PunterTemplate | null;
    if (!tk) continue;
    const correct = computeCorrectFromBalls(tk, fix, balls);
    if (!correct) continue;
    await pred.update({ correctOption: correct, status: "resolved" });
    await scorePunterUserAnswers(pred.id, correct, pred.options);
    resolved += 1;
  }
  return { resolved };
}

export function computeCorrectFromBalls(
  tk: PunterTemplate,
  fixture: any,
  allBalls: any[]
): string | null {
  switch (tk) {
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
      }
      const winners = topBatterWinners(allBalls);
      if (winners.length === 0) return null;
      return playerKey(winners[0]);
    }
    case "punter_top_batter": {
      // Tie-break: most runs, then fewer balls, then award all tied. Encoded
      // as a comma-joined list of player keys; scorePunterUserAnswers grants
      // points to anyone who picked any winner.
      const winners = topBatterWinners(allBalls);
      if (winners.length === 0) return null;
      return winners.map(playerKey).join(",");
    }
    case "punter_top_bowler": {
      // Tie-break: most wickets, then fewer runs conceded, then award all tied.
      const winners = topBowlerWinners(allBalls);
      if (winners.length === 0) return null;
      return winners.map(playerKey).join(",");
    }
  }
  return null;
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
  options: { key: string; label: string; points: number }[]
): Promise<void> {
  // correctOption may be a comma-joined list of keys when multiple players
  // tied (e.g. two batters on the same runs+balls); award points to anyone
  // who picked any of them.
  const correctSet = new Set(correctOption.split(",").map((k) => k.trim()).filter(Boolean));
  const userAnswers = await UserPrediction.findAll({ where: { predictionId } });
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
        where: { userId: ua.userId, matchId: ua.matchId, venueId: ua.venueId },
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
    });
  }
}
