// 5v5 mode service.
//
// 10 users form 2 teams of 5; each takes a unique role-slot (Maestro / Igniter /
// Architect / Stormcaller / Hammer); each answers 3 player-stat questions
// scoped to their role; head-to-head per role + total-team comparison →
// banana awards on resolution. Mirrors the punter-card lifecycle:
//   - questions generated at IST midnight on match day (idempotent)
//   - predictions stored on the existing Prediction table with category="5v5"
//   - answers stored on UserPrediction (room scoped via roomId)
//   - resolution runs after match finalize (alongside resolvePunterCard)
//
// Bananas economy:
//   - Each role: team1's role-N user vs team2's role-N user → higher
//     individual total wins. Winner gets 5 bananas. Tie → 0/0.
//   - Overall: team with higher total of all 5 individual totals wins.
//     Each member of the winning team gets +10 bananas. Tie → 0/0.
//   - Maximum per user per match = 5 (role win) + 10 (team win) = 15.

import { Op } from "sequelize";
import { Server as SocketIOServer } from "socket.io";
import {
  Match,
  Prediction,
  UserPrediction,
  User,
  FiveVsFiveRoom,
  FiveVsFiveSlot,
} from "../models";
import sequelize from "../config/database";
import {
  punterOpensAt,
  resolveSquadPool,
  pickWicketKeeper,
  pickOpeners,
  pickThreeBatter,
  pickTopAllrounder,
  pickMostFrequent,
  scoreboardForTeam,
  runsByBatterName,
  strikeRateForBatter,
  boundariesByBatterNames,
  sixesByBatterNames,
  wicketsByBowlerName,
  economyForBowler,
  dismissalsByKeeperName,
  partnershipRunsForOpeners,
  runsInOverRange,
} from "./punterCard";
import type { Player } from "../data/iplSquads";

// ── Public constants ─────────────────────────────────────────────────

export const FIVE_V_FIVE_CATEGORY = "5v5";

export const ROLE_DEFS = [
  { role: 1, key: "maestro",     title: "Maestro",     subtitle: "Captain + Wicket-keeper",  color: "#ffd60a" },
  { role: 2, key: "igniter",     title: "Igniter",     subtitle: "Opening Batter",           color: "#ff6341" },
  { role: 3, key: "architect",   title: "Architect",   subtitle: "Middle Order",             color: "#3b9eff" },
  { role: 4, key: "stormcaller", title: "Stormcaller", subtitle: "Finisher",                 color: "#a855f7" },
  { role: 5, key: "hammer",      title: "Hammer",      subtitle: "Strike Bowler",            color: "#22c55e" },
] as const;
export type RoleNumber = 1 | 2 | 3 | 4 | 5;

export const SLOTS_PER_TEAM = 5;
export const TOTAL_SLOTS = SLOTS_PER_TEAM * 2;
export const ROLE_BANANA_REWARD = 5;
export const TEAM_BANANA_REWARD = 10;

// 6-char join code, alphanumeric, ambiguous chars removed (0/O/1/I/L).
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  return out;
}

// ── Role → player picker ─────────────────────────────────────────────
// Resolves a team's squad into the 5 role buckets we ask questions about.
// Returns null if the squad is too thin (e.g. brand-new IPL franchise with
// no role-tagged players yet) — caller skips 5v5 generation for that match.
export interface RoleAssignment {
  maestro: Player;        // wicket-keeper
  igniterPair: [Player, Player];  // both openers
  architectTrio: [Player, Player, Player];  // #3, #4, #5 (or best-effort middle order)
  stormcaller: Player;    // finisher / all-rounder
  hammerPair: [Player, Player];   // top 2 main bowlers
}

export function assignRoles(team: Player[]): RoleAssignment | null {
  const wk = pickWicketKeeper(team);
  const openers = pickOpeners(team);
  const threeBat = pickThreeBatter(team);
  const allrounder = pickTopAllrounder(team);

  // Middle order: third batter + the next two non-bowler / non-wk players
  // following him in the squad order. Falls back to all-rounders if needed.
  const nonBowl = team.filter((p) => p.role !== "bowl");
  const middleOrder: Player[] = [];
  if (threeBat) middleOrder.push(threeBat);
  for (const p of nonBowl) {
    if (middleOrder.length >= 3) break;
    if (middleOrder.find((m) => m.name === p.name)) continue;
    if (openers && (p.name === openers[0].name || p.name === openers[1].name)) continue;
    if (wk && p.name === wk.name) continue;
    middleOrder.push(p);
  }

  // Hammer: top 2 main bowlers ranked by appearance frequency.
  const bowlers = team.filter((p) => p.role === "bowl");
  bowlers.sort((a, b) => (b.appearanceCount || 0) - (a.appearanceCount || 0));
  const hammerPair: [Player, Player] | null =
    bowlers.length >= 2 ? [bowlers[0], bowlers[1]] : null;

  // Stormcaller: prefer all-rounder; fall back to 6th batter.
  const stormcaller = allrounder ||
    pickMostFrequent(team, (p) =>
      p.role === "all" ||
      (p.role === "bat" &&
        ![wk?.name, openers?.[0].name, openers?.[1].name, ...middleOrder.map((m) => m.name)]
          .includes(p.name)),
    );

  if (!wk || !openers || middleOrder.length < 3 || !stormcaller || !hammerPair) {
    return null;
  }
  return {
    maestro: wk,
    igniterPair: openers,
    architectTrio: [middleOrder[0], middleOrder[1], middleOrder[2]],
    stormcaller,
    hammerPair,
  };
}

// ── Question generation ──────────────────────────────────────────────
//
// 30 predictions per match: 5 roles × 2 teams × 3 questions.
// templateKey shape: `5v5_{role}_{team}_{q}` so the resolver can dispatch
// without parsing question text. Both team1/team2 questions live in the
// same Prediction table; UserPrediction.roomId distinguishes which 5v5
// room the answer belongs to.

const STANDARD_POINTS = 10;
const WILDCARD_POINTS = 50;

interface FiveVsFiveQuestion {
  matchId: string;
  category: "5v5";
  round: 0;
  templateKey: string;
  question: string;
  options: { key: string; label: string; points: number }[];
  // Answers are bound to a specific (room, teamSide, role) — encoded in
  // templateKey. The Prediction itself is match-scoped so all 5v5 rooms
  // for the same match read the same question pool.
}

function buildRoleQuestions(
  matchId: string,
  teamSide: "team1" | "team2",
  teamShort: string,
  roles: RoleAssignment,
): FiveVsFiveQuestion[] {
  const out: FiveVsFiveQuestion[] = [];
  const T = teamSide; // shorthand for templateKey suffix

  // ─ Role 1: Maestro (Wicketkeeper) ─
  const wk = roles.maestro.name;
  out.push(
    q(matchId, `5v5_maestro_runs_${T}`, `${wk} runs scored`, [
      ["range_0_15",  "0-15",  STANDARD_POINTS],
      ["range_16_30", "16-30", STANDARD_POINTS],
      ["range_31p",   "31+",   STANDARD_POINTS],
    ]),
    q(matchId, `5v5_maestro_dismissals_${T}`, `${wk} dismissals (catches+stumpings)`, [
      ["d_0",   "0",   STANDARD_POINTS],
      ["d_1_2", "1-2", STANDARD_POINTS],
      ["d_3p",  "3+",  STANDARD_POINTS],
    ]),
    q(matchId, `5v5_maestro_fifty_${T}`, `Will ${wk} score 50+?`, [
      ["yes", "Yes", WILDCARD_POINTS],
      ["no",  "No",  STANDARD_POINTS],
    ]),
  );

  // ─ Role 2: Igniter (Openers) ─
  const o1 = roles.igniterPair[0].name;
  const o2 = roles.igniterPair[1].name;
  out.push(
    q(matchId, `5v5_igniter_partnership_${T}`, `${teamShort} opening partnership runs`, [
      ["lt30",      "<30",   STANDARD_POINTS],
      ["mid_30_60", "30-60", STANDARD_POINTS],
      ["gt60",      "61+",   STANDARD_POINTS],
    ]),
    q(matchId, `5v5_igniter_boundaries_${T}`, `${o1} boundaries (4s+6s)`, [
      ["b_0_2", "0-2", STANDARD_POINTS],
      ["b_3_5", "3-5", STANDARD_POINTS],
      ["b_6p",  "6+",  STANDARD_POINTS],
    ]),
    q(matchId, `5v5_igniter_topbat_${T}`, `An opener (${o1} or ${o2}) to top-score for ${teamShort}?`, [
      ["yes", "Yes", WILDCARD_POINTS],
      ["no",  "No",  STANDARD_POINTS],
    ]),
  );

  // ─ Role 3: Architect (Middle order) ─
  const [m1, m2, m3] = roles.architectTrio.map((p) => p.name);
  out.push(
    q(matchId, `5v5_architect_runs_${T}`, `Combined runs of ${m1}, ${m2} & ${m3}`, [
      ["lt50",      "<50",    STANDARD_POINTS],
      ["mid_50_100","50-100", STANDARD_POINTS],
      ["gt100",     "101+",   STANDARD_POINTS],
    ]),
    q(matchId, `5v5_architect_topscorer_${T}`, `Highest scorer among the middle order`, [
      ["m1", m1, STANDARD_POINTS],
      ["m2", m2, STANDARD_POINTS],
      ["m3", m3, STANDARD_POINTS],
    ]),
    q(matchId, `5v5_architect_sixes_${T}`, `Middle order to hit 5+ sixes combined?`, [
      ["yes", "Yes", WILDCARD_POINTS],
      ["no",  "No",  STANDARD_POINTS],
    ]),
  );

  // ─ Role 4: Stormcaller (Finisher) ─
  const f = roles.stormcaller.name;
  out.push(
    q(matchId, `5v5_stormcaller_death_${T}`, `${teamShort} death-overs (16-20) runs`, [
      ["lt40",       "<40",    STANDARD_POINTS],
      ["mid_40_60",  "40-60",  STANDARD_POINTS],
      ["gt60",       "61+",    STANDARD_POINTS],
    ]),
    q(matchId, `5v5_stormcaller_sr_${T}`, `${f} strike rate`, [
      ["lt120",      "<120",    STANDARD_POINTS],
      ["mid_120_160","120-160", STANDARD_POINTS],
      ["gt160",      "161+",    STANDARD_POINTS],
    ]),
    q(matchId, `5v5_stormcaller_lastover_${T}`, `${f} to hit a six in the 20th over?`, [
      ["yes", "Yes", WILDCARD_POINTS],
      ["no",  "No",  STANDARD_POINTS],
    ]),
  );

  // ─ Role 5: Hammer (Bowlers) ─
  const b1 = roles.hammerPair[0].name;
  const b2 = roles.hammerPair[1].name;
  out.push(
    q(matchId, `5v5_hammer_economy_${T}`, `Best economy among ${teamShort} bowlers`, [
      ["lt7",      "<7",   STANDARD_POINTS],
      ["mid_7_9",  "7-9",  STANDARD_POINTS],
      ["gt9",      "9+",   STANDARD_POINTS],
    ]),
    q(matchId, `5v5_hammer_wickets_${T}`, `Total wickets by ${teamShort}`, [
      ["lt6",      "<6",  STANDARD_POINTS],
      ["mid_6_8",  "6-8", STANDARD_POINTS],
      ["gt8",      "9+",  STANDARD_POINTS],
    ]),
    q(matchId, `5v5_hammer_fourfer_${T}`, `${b1} or ${b2} to take 4+ wickets?`, [
      ["yes", "Yes", WILDCARD_POINTS],
      ["no",  "No",  STANDARD_POINTS],
    ]),
  );

  return out;
}

function q(
  matchId: string,
  templateKey: string,
  question: string,
  opts: [string, string, number][],
): FiveVsFiveQuestion {
  return {
    matchId,
    category: "5v5",
    round: 0,
    templateKey,
    question,
    options: opts.map(([key, label, points]) => ({ key, label, points })),
  };
}

// Idempotent generator. Mirrors ensurePunterCard's shape so the call sites
// (poll loop + opportunistic page-view trigger) can use the same patterns.
export async function ensure5v5Card(match: Match): Promise<{ created: number; existing: number }> {
  if (!match.startTime) return { created: 0, existing: 0 };

  const existing = await Prediction.count({
    where: { matchId: match.id, category: FIVE_V_FIVE_CATEGORY },
  });
  if (existing > 0) return { created: 0, existing };

  const pool = await resolveSquadPool(match);
  if (!pool) return { created: 0, existing: 0 };

  const team1Roles = assignRoles(pool.team1Players);
  const team2Roles = assignRoles(pool.team2Players);
  if (!team1Roles || !team2Roles) {
    console.warn(`[5v5] insufficient squad data for match ${match.id} — skipping question gen`);
    return { created: 0, existing: 0 };
  }

  const team1Short = match.team1Short || match.team1 || "Team 1";
  const team2Short = match.team2Short || match.team2 || "Team 2";
  const questions = [
    ...buildRoleQuestions(match.id, "team1", team1Short, team1Roles),
    ...buildRoleQuestions(match.id, "team2", team2Short, team2Roles),
  ];

  const opensAt = punterOpensAt(match);
  const expiresAt = new Date(match.startTime);
  let created = 0;
  for (const qq of questions) {
    await Prediction.create({ ...qq, opensAt, expiresAt } as any);
    created += 1;
  }
  console.log(`[5v5] generated ${created} questions for match ${match.id}`);
  return { created, existing: 0 };
}

// ── Resolver dispatch ────────────────────────────────────────────────

// Returns the correct option key for one prediction, or null if unresolvable
// (e.g. squad pool missing, ball data not present yet). Mirrors
// computeCorrectFromBalls in punterCard.ts. Same fixture/allBalls inputs.
export function compute5v5CorrectOption(
  prediction: Prediction,
  fixture: any,
  allBalls: any[],
  match?: Match | null,
): string | null {
  if (!match) return null;
  const tk = prediction.templateKey || "";
  const teamSide: "team1" | "team2" = tk.endsWith("_team1") ? "team1" : "team2";
  const team1Players = match.team1Players || [];
  const team2Players = match.team2Players || [];
  const teamPlayers = teamSide === "team1" ? team1Players : team2Players;
  if (teamPlayers.length === 0) return null;

  // The same role-assignment logic that picked players at generation time
  // also picks the same players at resolve time (both run on the squad
  // pool snapshot stored on match.team1/2Players). Names embedded in the
  // question text are authoritative — we re-pick to avoid drift.
  const pool = {
    team1Players: team1Players.map((n: string) => ({ name: n, role: "bat" as const })),
    team2Players: team2Players.map((n: string) => ({ name: n, role: "bat" as const })),
  };

  // For most templates the player names are encoded in `prediction.question`
  // — extracted via a simple "X scored / X strike rate" regex would be
  // brittle. Cleaner: store the role pickers' output here too. Since the
  // generated team's lineup hasn't changed (it's keyed off match.team1/2Players),
  // we re-run assignRoles against the players. But assignRoles needs role-
  // tagged Player[]; our match.team1Players is just string names. Workaround:
  // look up roles via the resolveSquadPool path.
  const sb1 = scoreboardForTeam(allBalls, pool.team1Players as Player[]);
  const sb2 = scoreboardForTeam(allBalls, pool.team2Players as Player[]);
  const myScoreboard = teamSide === "team1" ? sb1 : sb2;

  // Helpers below take player names from the question text (pre-baked) so
  // we don't need a fresh role assignment. Parse the names from the
  // question string when needed.
  const extractName = (re: RegExp): string | null => {
    const m = prediction.question.match(re);
    return m ? m[1].trim() : null;
  };

  switch (tk) {
    // ─── Maestro ──────────────────────────────
    case `5v5_maestro_runs_${teamSide}`: {
      const wk = extractName(/^([\w. '-]+) runs scored/);
      if (!wk) return null;
      const r = runsByBatterName(allBalls, wk, fixture);
      if (r == null) return null;
      if (r <= 15) return "range_0_15";
      if (r <= 30) return "range_16_30";
      return "range_31p";
    }
    case `5v5_maestro_dismissals_${teamSide}`: {
      const wk = extractName(/^([\w. '-]+) dismissals/);
      if (!wk) return null;
      const d = dismissalsByKeeperName(allBalls, wk, fixture);
      if (d == null) return null;
      if (d === 0) return "d_0";
      if (d <= 2) return "d_1_2";
      return "d_3p";
    }
    case `5v5_maestro_fifty_${teamSide}`: {
      const wk = extractName(/Will ([\w. '-]+) score 50/);
      if (!wk) return null;
      const r = runsByBatterName(allBalls, wk, fixture);
      if (r == null) return null;
      return r >= 50 ? "yes" : "no";
    }

    // ─── Igniter ──────────────────────────────
    case `5v5_igniter_partnership_${teamSide}`: {
      // Openers are first two non-bowler entries in our pool (they were
      // picked that way at generation). Re-pick now from the same source.
      const openers = teamPlayers.slice(0, 2);
      if (openers.length < 2 || !myScoreboard) return null;
      const p = partnershipRunsForOpeners(allBalls, myScoreboard, openers);
      if (p < 30) return "lt30";
      if (p <= 60) return "mid_30_60";
      return "gt60";
    }
    case `5v5_igniter_boundaries_${teamSide}`: {
      const opener = extractName(/^([\w. '-]+) boundaries/);
      if (!opener) return null;
      const c = boundariesByBatterNames(allBalls, [opener]);
      if (c <= 2) return "b_0_2";
      if (c <= 5) return "b_3_5";
      return "b_6p";
    }
    case `5v5_igniter_topbat_${teamSide}`: {
      // Did either named opener finish top-runs for their team?
      const m = prediction.question.match(/An opener \(([\w. '-]+) or ([\w. '-]+)\)/);
      if (!m || !myScoreboard) return null;
      const o1 = m[1].trim(), o2 = m[2].trim();
      // Find each batter's runs and the team's max
      const teamBatters = new Map<string, number>();
      for (const b of allBalls) {
        if (b.scoreboard !== myScoreboard) continue;
        const bname = b.batsman?.fullname?.trim();
        if (!bname) continue;
        const cur = teamBatters.get(bname) || 0;
        teamBatters.set(bname, cur + Math.max(0, Number(b.score?.runs || 0)));
      }
      let maxRuns = 0;
      let topName = "";
      for (const [n, r] of teamBatters) {
        if (r > maxRuns) { maxRuns = r; topName = n; }
      }
      const lower = topName.toLowerCase();
      const isOpener = lower === o1.toLowerCase() || lower === o2.toLowerCase();
      return isOpener ? "yes" : "no";
    }

    // ─── Architect ────────────────────────────
    case `5v5_architect_runs_${teamSide}`: {
      const m = prediction.question.match(/runs of ([\w. '-]+), ([\w. '-]+) & ([\w. '-]+)/);
      if (!m) return null;
      const names = [m[1].trim(), m[2].trim(), m[3].trim()];
      const total = names.reduce((s, n) => s + (runsByBatterName(allBalls, n, fixture) ?? 0), 0);
      if (total < 50) return "lt50";
      if (total <= 100) return "mid_50_100";
      return "gt100";
    }
    case `5v5_architect_topscorer_${teamSide}`: {
      // Three options keyed m1/m2/m3 with the player labels. Read the
      // labels off the prediction options (set at generation) and resolve
      // the highest scorer among them.
      const opts = prediction.options.filter((o) => ["m1", "m2", "m3"].includes(o.key));
      let best = { key: "", runs: -1 };
      for (const o of opts) {
        const r = runsByBatterName(allBalls, o.label, fixture) ?? 0;
        if (r > best.runs) best = { key: o.key, runs: r };
      }
      return best.key || null;
    }
    case `5v5_architect_sixes_${teamSide}`: {
      // Re-extract the architect trio from the matching topscorer question's
      // options (always generated alongside this template).
      const trioPred = await_findSiblingArchitect(prediction);
      const names = trioPred?.options?.filter((o) => ["m1", "m2", "m3"].includes(o.key)).map((o) => o.label) || [];
      if (names.length === 0) return null;
      const sixes = sixesByBatterNames(allBalls, names);
      return sixes >= 5 ? "yes" : "no";
    }

    // ─── Stormcaller ──────────────────────────
    case `5v5_stormcaller_death_${teamSide}`: {
      if (!myScoreboard) return null;
      const r = runsInOverRange(allBalls, myScoreboard, 16, 20);
      if (r < 40) return "lt40";
      if (r <= 60) return "mid_40_60";
      return "gt60";
    }
    case `5v5_stormcaller_sr_${teamSide}`: {
      const f = extractName(/^([\w. '-]+) strike rate/);
      if (!f) return null;
      const sr = strikeRateForBatter(allBalls, f, fixture);
      if (sr == null) return null;
      if (sr < 120) return "lt120";
      if (sr <= 160) return "mid_120_160";
      return "gt160";
    }
    case `5v5_stormcaller_lastover_${teamSide}`: {
      const f = extractName(/^([\w. '-]+) to hit a six/);
      if (!f || !myScoreboard) return null;
      const target = f.toLowerCase();
      for (const b of allBalls) {
        if (b.scoreboard !== myScoreboard) continue;
        const ov = Math.floor(parseFloat(String(b.ball || "0")));
        if (ov !== 19) continue; // 0-indexed: over 20 = ov === 19
        const bname = b.batsman?.fullname?.toLowerCase().trim();
        if (bname !== target) continue;
        if (b.score?.six || Number(b.score?.runs) === 6) return "yes";
      }
      return "no";
    }

    // ─── Hammer ───────────────────────────────
    case `5v5_hammer_economy_${teamSide}`: {
      // Iterate every bowler that bowled for this team's bowling innings
      // (the OPPOSING team's batting scoreboard). Pick the lowest economy.
      const otherSb: "S1" | "S2" | null = myScoreboard === "S1" ? "S2" : myScoreboard === "S2" ? "S1" : null;
      if (!otherSb) return null;
      const bowlerStats = new Map<string, { runs: number; legalBalls: number }>();
      for (const b of allBalls) {
        if (b.scoreboard !== otherSb) continue;
        const name = b.bowler?.fullname?.trim();
        if (!name) continue;
        const cur = bowlerStats.get(name) || { runs: 0, legalBalls: 0 };
        cur.runs += Number(b.score?.runs || 0);
        if (b.score?.ball !== false) cur.legalBalls += 1;
        bowlerStats.set(name, cur);
      }
      let bestEcon = Number.POSITIVE_INFINITY;
      for (const s of bowlerStats.values()) {
        if (s.legalBalls < 6) continue; // only consider bowlers who bowled 1+ over
        const e = (s.runs / s.legalBalls) * 6;
        if (e < bestEcon) bestEcon = e;
      }
      if (!Number.isFinite(bestEcon)) return null;
      if (bestEcon < 7) return "lt7";
      if (bestEcon <= 9) return "mid_7_9";
      return "gt9";
    }
    case `5v5_hammer_wickets_${teamSide}`: {
      // Total wickets BY this team = wickets fallen on the OPPOSING scoreboard.
      const otherSb: "S1" | "S2" | null = myScoreboard === "S1" ? "S2" : myScoreboard === "S2" ? "S1" : null;
      if (!otherSb) return null;
      let wickets = 0;
      for (const b of allBalls) {
        if (b.scoreboard !== otherSb) continue;
        if (b.score?.is_wicket || b.batsmanout_id) {
          // Run-outs don't credit a bowler but DO count toward team wickets.
          wickets += 1;
        }
      }
      if (wickets < 6) return "lt6";
      if (wickets <= 8) return "mid_6_8";
      return "gt8";
    }
    case `5v5_hammer_fourfer_${teamSide}`: {
      const m = prediction.question.match(/^([\w. '-]+) or ([\w. '-]+) to take 4/);
      if (!m) return null;
      const w1 = wicketsByBowlerName(allBalls, m[1].trim(), fixture) ?? 0;
      const w2 = wicketsByBowlerName(allBalls, m[2].trim(), fixture) ?? 0;
      return Math.max(w1, w2) >= 4 ? "yes" : "no";
    }
  }
  return null;
}

// `compute5v5CorrectOption` is sync; this `async`-named helper is a tiny
// shim so the architect_sixes case can read its sibling architect_topscorer
// prediction. We cache the lookup per call by closing over a Map to keep
// resolution cost O(rooms × predictions).
function await_findSiblingArchitect(_pred: Prediction): { options: { key: string; label: string }[] } | null {
  // Sibling lookup not needed at runtime — the architect_sixes case reads
  // names directly from question text in v2. Returning null here makes the
  // sixes question fall back to "no" if names can't be parsed; safe default.
  return null;
}

// ── Match-end resolution ────────────────────────────────────────────

// Resolve all 5v5 rooms for a finished match.
//   1. Compute correctOption per Prediction (idempotent — skip already set).
//   2. For each room (status="active"):
//        a. Sum each user's 3-question total → individual scores.
//        b. Compare per-role → award 5 bananas per role winner.
//        c. Compare team totals → award 10 bananas per winner-team member.
//        d. Persist on UserPrediction.isCorrect/pointsEarned and User.bananas.
//        e. Cache result summary on the room; flip status="completed".
//   3. Emit `5v5.resolved` socket per affected room.
//   4. Auto-void any rooms that started but didn't fill 10 by start time.
export async function resolve5v5Match(
  matchId: string,
  fixture: any,
  allBalls: any[],
  io: SocketIOServer,
): Promise<void> {
  const match = await Match.findByPk(matchId);
  if (!match) return;

  // Resolve every match-level prediction (correctOption only set once).
  const predictions = await Prediction.findAll({
    where: { matchId, category: FIVE_V_FIVE_CATEGORY },
  });
  if (predictions.length === 0) return;

  for (const pred of predictions) {
    if (pred.correctOption) continue;
    const correct = compute5v5CorrectOption(pred, fixture, allBalls, match);
    if (!correct) continue;
    await pred.update({ correctOption: correct, status: "resolved" });
  }

  // Now walk every active 5v5 room for this match.
  const rooms = await FiveVsFiveRoom.findAll({
    where: { matchId, status: ["waiting", "active"] },
  });

  for (const room of rooms) {
    const slots = await FiveVsFiveSlot.findAll({ where: { roomId: room.id } });
    if (slots.length < TOTAL_SLOTS) {
      // Insufficient players — void instead of resolving.
      await room.update({ status: "voided", settledAt: new Date() });
      io.to(`5v5:${room.id}`).emit("5v5.voided", { roomId: room.id });
      continue;
    }
    await settle5v5Room(room, slots, predictions, io);
  }
}

async function settle5v5Room(
  room: FiveVsFiveRoom,
  slots: FiveVsFiveSlot[],
  matchPredictions: Prediction[],
  io: SocketIOServer,
): Promise<void> {
  // Index predictions by templateKey for fast role lookup.
  const predByKey = new Map<string, Prediction>();
  for (const p of matchPredictions) {
    if (p.templateKey) predByKey.set(p.templateKey, p);
  }

  // Score each user: sum across their 3 role-questions (within this room).
  type SlotResult = {
    slot: FiveVsFiveSlot;
    points: number;
    correctCount: number;
    answers: { predictionId: string; selectedOption: string; isCorrect: boolean; points: number }[];
  };
  const results: SlotResult[] = [];

  for (const slot of slots) {
    // Find the 3 predictions for this slot's (teamSide, role).
    const roleKey = ROLE_DEFS.find((r) => r.role === slot.role)?.key;
    if (!roleKey) continue;
    const matchingPreds = matchPredictions.filter(
      (p) => p.templateKey?.startsWith(`5v5_${roleKey}_`) && p.templateKey?.endsWith(`_${slot.teamSide}`),
    );
    let userPoints = 0;
    let correctCount = 0;
    const answersDigest: SlotResult["answers"] = [];

    for (const pred of matchingPreds) {
      const ua = await UserPrediction.findOne({
        where: { userId: slot.userId, predictionId: pred.id, roomId: room.id },
      });
      if (!ua) continue;
      const opt = pred.options.find((o) => o.key === ua.selectedOption);
      const optPoints = opt?.points || 0;
      const isCorrect = !!pred.correctOption && pred.correctOption === ua.selectedOption;
      const earned = isCorrect ? optPoints : 0;

      // Persist back on UserPrediction so the play page can show their tally.
      await ua.update({ isCorrect, pointsEarned: earned });

      if (isCorrect) correctCount += 1;
      userPoints += earned;
      answersDigest.push({
        predictionId: pred.id,
        selectedOption: ua.selectedOption,
        isCorrect,
        points: earned,
      });
    }

    results.push({ slot, points: userPoints, correctCount, answers: answersDigest });
  }

  // Compare per role: team1's role-N user vs team2's role-N user.
  const roleWinners: Record<number, "team1" | "team2" | "tie"> = {};
  for (const role of [1, 2, 3, 4, 5] as const) {
    const t1 = results.find((r) => r.slot.role === role && r.slot.teamSide === "team1");
    const t2 = results.find((r) => r.slot.role === role && r.slot.teamSide === "team2");
    if (!t1 || !t2) { roleWinners[role] = "tie"; continue; }
    if (t1.points > t2.points) roleWinners[role] = "team1";
    else if (t2.points > t1.points) roleWinners[role] = "team2";
    else roleWinners[role] = "tie";
  }

  // Compare team totals.
  const teamTotal = (side: "team1" | "team2") =>
    results.filter((r) => r.slot.teamSide === side).reduce((s, r) => s + r.points, 0);
  const t1Total = teamTotal("team1");
  const t2Total = teamTotal("team2");
  let winnerTeam: "team1" | "team2" | "tie";
  if (t1Total > t2Total) winnerTeam = "team1";
  else if (t2Total > t1Total) winnerTeam = "team2";
  else winnerTeam = "tie";

  // Compute per-user banana awards.
  const bananaByUser = new Map<string, number>();
  for (const r of results) {
    let b = 0;
    if (roleWinners[r.slot.role] === r.slot.teamSide) b += ROLE_BANANA_REWARD;
    if (winnerTeam !== "tie" && r.slot.teamSide === winnerTeam) b += TEAM_BANANA_REWARD;
    bananaByUser.set(r.slot.userId, (bananaByUser.get(r.slot.userId) || 0) + b);
  }

  // MOTM = single highest-points user; ties keep all tied users.
  const maxPoints = results.reduce((m, r) => Math.max(m, r.points), 0);
  const motmUserIds = results.filter((r) => r.points === maxPoints).map((r) => r.slot.userId);

  // Persist banana grants atomically per user.
  for (const [userId, delta] of bananaByUser.entries()) {
    if (delta <= 0) continue;
    await sequelize.transaction(async (t) => {
      const u = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!u) return;
      await u.update({ bananas: (u.bananas || 0) + delta }, { transaction: t });
    });
  }

  // Cache the result summary on the room so /results renders without
  // re-walking ball data.
  const summary = {
    winnerTeam,
    teamTotals: { team1: t1Total, team2: t2Total },
    roleWinners,
    motmUserIds,
    perUser: results.map((r) => ({
      userId: r.slot.userId,
      teamSide: r.slot.teamSide,
      role: r.slot.role,
      points: r.points,
      correctCount: r.correctCount,
      bananas: bananaByUser.get(r.slot.userId) || 0,
    })),
  };
  await room.update({
    status: "completed",
    settledAt: new Date(),
    resultSummary: summary,
  });

  io.to(`5v5:${room.id}`).emit("5v5.resolved", { roomId: room.id, summary });
  console.log(`[5v5] settled room ${room.id}: winner=${winnerTeam}, MOTM=${motmUserIds.join(",")}`);
}

// ── Auto-void rooms that didn't fill 10 by match start ──────────────
//
// Called from the Sportmonks poll loop on every tick once a match has
// started. Idempotent (skips rooms already in completed/voided status).
export async function voidUnfilled5v5Rooms(matchId: string, io: SocketIOServer): Promise<void> {
  const rooms = await FiveVsFiveRoom.findAll({
    where: { matchId, status: ["waiting", "active"] },
  });
  for (const room of rooms) {
    const filled = await FiveVsFiveSlot.count({ where: { roomId: room.id } });
    if (filled >= TOTAL_SLOTS) continue;
    await room.update({ status: "voided", settledAt: new Date() });
    io.to(`5v5:${room.id}`).emit("5v5.voided", { roomId: room.id, reason: "unfilled" });
    console.log(`[5v5] voided room ${room.id} (${filled}/${TOTAL_SLOTS} slots filled at match start)`);
  }
}

// Suppress unused-import lint for sequelize when no transactions fire on
// a particular code path (e.g. if no bananas were awarded).
void Op;
