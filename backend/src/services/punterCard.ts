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

// "Midnight on match day" — use the local-time start of match.startTime's day.
// We compute it as startTime minus its time-of-day, in UTC. Good enough for
// IST-only operation; switch to a tz-aware library if we expand regions.
export function punterOpensAt(match: Match): Date {
  const start = new Date(match.startTime);
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---- Resolver ----

// Resolve all 10 punter-card questions for a finished match. Reads
// match.scoreData / final scorecard to pick correct options. Idempotent —
// skips already-resolved rows.
export async function resolvePunterCard(matchId: string): Promise<{ resolved: number }> {
  const match = await Match.findByPk(matchId);
  if (!match) return { resolved: 0 };
  const cards = await Prediction.findAll({
    where: { matchId, category: "punter_card", status: { [Op.ne]: "resolved" } },
  });
  if (cards.length === 0) return { resolved: 0 };

  const sd: any = match.scoreData || {};
  const inn1 = sd.innings1 || {};
  const inn2 = sd.innings2 || {};

  let resolved = 0;
  for (const pred of cards) {
    const tk = (pred as any).templateKey as PunterTemplate | null;
    if (!tk) continue;
    const correct = computeCorrect(tk, match, inn1, inn2);
    if (!correct) continue;
    await pred.update({ correctOption: correct, status: "resolved" });
    await scorePunterUserAnswers(pred.id, correct, pred.options);
    resolved += 1;
  }
  return { resolved };
}

function computeCorrect(
  tk: PunterTemplate,
  match: Match,
  inn1: any,
  inn2: any
): string | null {
  const t1 = match.team1Short;
  const t2 = match.team2Short;
  const sd: any = match.scoreData || {};

  switch (tk) {
    case "punter_match_winner": {
      const winner = sd.winnerTeamShort || sd.winner;
      if (winner === t1) return "team1";
      if (winner === t2) return "team2";
      return null;
    }
    case "punter_toss_winner": {
      const tossWinner = sd.tossWinnerShort || sd.tossWinner;
      if (tossWinner === t1) return "team1";
      if (tossWinner === t2) return "team2";
      return null;
    }
    case "punter_inn1_50":  return anyPlayerReached(inn1, 50)  ? "yes" : "no";
    case "punter_inn1_100": return anyPlayerReached(inn1, 100) ? "yes" : "no";
    case "punter_inn2_50":  return anyPlayerReached(inn2, 50)  ? "yes" : "no";
    case "punter_inn2_100": return anyPlayerReached(inn2, 100) ? "yes" : "no";
    case "punter_highest_at_1st_dismissal": {
      // Highest team score at the moment the first dismissal happened in EITHER innings.
      // We approximate using runs at fall-of-1st-wicket in each innings.
      const t1Score = scoreAtFirstWicket(inn1);
      const t2Score = scoreAtFirstWicket(inn2);
      if (t1Score == null || t2Score == null) return null;
      if (t1Score > t2Score) return "team1";
      if (t2Score > t1Score) return "team2";
      return "draw";
    }
    case "punter_motm": {
      const motm = sd.manOfTheMatch || sd.motm;
      if (!motm) return null;
      return playerKey(motm);
    }
    case "punter_top_batter": {
      const name = topScorerFromInnings([inn1, inn2]);
      return name ? playerKey(name) : null;
    }
    case "punter_top_bowler": {
      const name = topWicketTakerFromInnings([inn1, inn2]);
      return name ? playerKey(name) : null;
    }
  }
  return null;
}

function anyPlayerReached(innings: any, threshold: number): boolean {
  const batsmen: any[] = innings?.batsmen || innings?.batting || [];
  for (const b of batsmen) {
    const r = Number(b?.runs ?? b?.score ?? 0);
    if (r >= threshold) return true;
  }
  return false;
}

function scoreAtFirstWicket(innings: any): number | null {
  // Sportsmonk scorecard: each batsman row has a `dismissal` block when out,
  // including `team_score` snapshot (varies by plan). Fall back: take the
  // smallest team_score value across dismissed batsmen — that's the first wicket.
  const batsmen: any[] = innings?.batsmen || innings?.batting || [];
  let minScore: number | null = null;
  for (const b of batsmen) {
    const ts = Number(b?.team_score ?? b?.dismissalScore ?? NaN);
    if (Number.isFinite(ts)) {
      if (minScore == null || ts < minScore) minScore = ts;
    }
  }
  if (minScore != null) return minScore;
  // No reliable signal — return total score if no dismissals at all
  if (Number(innings?.wickets ?? 0) === 0) return Number(innings?.score ?? 0);
  return null;
}

function topScorerFromInnings(innings: any[]): string | null {
  let best: { name: string; runs: number } | null = null;
  for (const inn of innings) {
    const batsmen: any[] = inn?.batsmen || inn?.batting || [];
    for (const b of batsmen) {
      const name = b?.fullname || b?.name || b?.batsman?.fullname;
      const runs = Number(b?.runs ?? b?.score ?? 0);
      if (!name) continue;
      if (!best || runs > best.runs) best = { name, runs };
    }
  }
  return best?.name || null;
}

function topWicketTakerFromInnings(innings: any[]): string | null {
  let best: { name: string; wkts: number } | null = null;
  for (const inn of innings) {
    const bowlers: any[] = inn?.bowlers || inn?.bowling || [];
    for (const b of bowlers) {
      const name = b?.fullname || b?.name || b?.bowler?.fullname;
      const wkts = Number(b?.wickets ?? 0);
      if (!name) continue;
      if (!best || wkts > best.wkts) best = { name, wkts };
    }
  }
  return best?.name || null;
}

async function scorePunterUserAnswers(
  predictionId: string,
  correctOption: string,
  options: { key: string; label: string; points: number }[]
): Promise<void> {
  const userAnswers = await UserPrediction.findAll({ where: { predictionId } });
  for (const ua of userAnswers) {
    const isCorrect = ua.selectedOption === correctOption;
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
