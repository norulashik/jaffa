// Self-healing squad data: after each match completes, walk the actual
// ball-by-ball feed, derive who actually played for each team, and reconcile
// against our static IPL_SQUADS_2026 + existing SquadOverride rows.
//
// Why this exists: the static squad in backend/src/data/iplSquads.ts drifts
// fast — transfers, injuries, impact-substitute rotations. When the punter
// card generator runs at midnight on match day, it picks players from the
// stale squad, so head-to-head questions can name a player who isn't even
// in the announced XI. This service writes a SquadOverride row per actual
// player seen, so the next match's punter card pulls from a fresher list.

import { Op } from "sequelize";
import { Match, SquadOverride } from "../models";
import { IPL_SQUADS_2026, type Player } from "../data/iplSquads";
import { scoreboardForTeam } from "./punterCard";
import { findFuzzyMatch } from "./playerNameMatch";

interface SyncResult {
  added: string[];     // new SquadOverride rows just inserted
  updated: number;     // existing rows whose lastSeenAt was bumped
  skipped: string[];   // unique fullnames we couldn't assign to a team
}

interface PlayerActivity {
  fullname: string;
  batted: boolean;
  bowled: boolean;
  battedBalls: number;
}

// Walk allBalls and produce, per scoreboard, the activity record for every
// unique fullname seen as either batsman or bowler.
function activityByScoreboard(allBalls: any[]): {
  S1: Map<string, PlayerActivity>;  // batsmen on S1, bowlers on S1
  S2: Map<string, PlayerActivity>;
} {
  const empty = (): Map<string, PlayerActivity> => new Map();
  const out = { S1: empty(), S2: empty() };

  const upsert = (
    map: Map<string, PlayerActivity>,
    fullname: string,
    field: "batted" | "bowled",
    incrementBalls = false,
  ) => {
    const key = fullname.trim();
    if (!key) return;
    let rec = map.get(key);
    if (!rec) {
      rec = { fullname: key, batted: false, bowled: false, battedBalls: 0 };
      map.set(key, rec);
    }
    rec[field] = true;
    if (incrementBalls && field === "batted") rec.battedBalls += 1;
  };

  for (const b of allBalls) {
    const sb: "S1" | "S2" | undefined = b?.scoreboard;
    if (sb !== "S1" && sb !== "S2") continue;
    if (typeof b?.batsman?.fullname === "string") {
      upsert(out[sb], b.batsman.fullname, "batted", true);
    }
    if (typeof b?.bowler?.fullname === "string") {
      upsert(out[sb], b.bowler.fullname, "bowled", false);
    }
  }
  return out;
}

// Combine the team's batting scoreboard activity with the OPPOSING
// scoreboard's bowler activity to assemble a per-team played roster.
//   batting on Sx → batsmen on Sx are "this team"
//   bowling in S(other) → bowlers on S(other) are "this team"
function rosterForTeam(
  battingSb: "S1" | "S2",
  activity: { S1: Map<string, PlayerActivity>; S2: Map<string, PlayerActivity> },
): Map<string, PlayerActivity> {
  const otherSb: "S1" | "S2" = battingSb === "S1" ? "S2" : "S1";
  const out = new Map<string, PlayerActivity>();
  // Batsmen of this team's batting innings.
  for (const [name, rec] of activity[battingSb]) {
    if (rec.batted) out.set(name, { ...rec });
  }
  // Bowlers in the opponent's batting innings (i.e. when this team was
  // bowling). Merge — an all-rounder will already be present from batting.
  for (const [name, rec] of activity[otherSb]) {
    if (!rec.bowled) continue;
    const existing = out.get(name);
    if (existing) {
      existing.bowled = true;
    } else {
      out.set(name, { fullname: rec.fullname, batted: false, bowled: true, battedBalls: 0 });
    }
  }
  return out;
}

// Heuristic role inference for a brand-new player we've never seen before.
// V1 keeps it simple — wicket-keeper detection is deferred (needs Sportsmonk's
// wk_id from the fixture payload, which we can wire in later). Default to
// `bat` for a player who only batted; `bowl` for bowl-only; `all` for both.
function inferRole(activity: PlayerActivity): "bat" | "wk" | "all" | "bowl" {
  if (activity.batted && activity.bowled) return "all";
  if (activity.bowled) return "bowl";
  return "bat";
}

// Build the merged "currently known" roster for a team, including any prior
// SquadOverride rows. Used to answer "is this fullname new, or did we
// already record it?" — via fuzzy match so spelling variants don't double-add.
async function knownNamesForTeam(team: string): Promise<string[]> {
  const baseStatic = IPL_SQUADS_2026[team] || [];
  const baseNames = baseStatic.map((p: Player) => p.name);
  const overrides = await SquadOverride.findAll({
    where: { team, removedAt: null },
    attributes: ["playerName"],
  });
  return [...baseNames, ...overrides.map((o) => o.playerName)];
}

async function syncTeam(
  team: string,
  matchId: string,
  roster: Map<string, PlayerActivity>,
): Promise<{ added: string[]; updated: number }> {
  const known = await knownNamesForTeam(team);
  const added: string[] = [];
  let updated = 0;

  for (const [fullname, activity] of roster) {
    const matched = findFuzzyMatch(fullname, known);
    if (matched) {
      // We already know this player. Bump lastSeenAt on the override row if
      // one exists; if they're only in the static squad, create a "match"
      // override anchored on this match so future audits can see when we
      // last confirmed them.
      const existing = await SquadOverride.findOne({
        where: { team, playerName: { [Op.iLike]: matched } },
      });
      if (existing) {
        await existing.update({ lastSeenAt: new Date(), removedAt: null });
        updated += 1;
      } else {
        // Player is in the static squad but has no override row yet. Insert
        // a match-sourced row to start tracking lastSeenAt. Role is inferred
        // from this match's activity — overrides the static role only when
        // the new role is more permissive (e.g. static says "bat" but they
        // bowled today → upgrade to "all"). Don't downgrade.
        // For simplicity: just record a match row keeping the static role
        // (we can't know it from here without re-importing the static map).
        // Use inferred role; static merge happens in iplSquads.ts read path.
        await SquadOverride.create({
          team,
          playerName: matched,
          role: inferRole(activity),
          source: "match",
          addedFromMatchId: matchId,
          lastSeenAt: new Date(),
          removedAt: null,
        });
        updated += 1;
      }
      continue;
    }

    // Brand-new player: insert a SquadOverride row.
    await SquadOverride.create({
      team,
      playerName: fullname,
      role: inferRole(activity),
      source: "match",
      addedFromMatchId: matchId,
      lastSeenAt: new Date(),
      removedAt: null,
    });
    added.push(fullname);
  }

  return { added, updated };
}

export async function syncSquadFromMatch(
  match: Match,
  _fixture: any,
  allBalls: any[],
): Promise<SyncResult> {
  const team1 = (match.team1Short || "").toUpperCase();
  const team2 = (match.team2Short || "").toUpperCase();
  if (!team1 || !team2) {
    return { added: [], updated: 0, skipped: [] };
  }

  // Use the static squad ONLY to detect which scoreboard each team batted
  // on. Even a partial squad (6+ matching names per team) is enough — we
  // just need majority detection.
  const t1Static = IPL_SQUADS_2026[team1] || [];
  const t2Static = IPL_SQUADS_2026[team2] || [];

  const t1Sb = scoreboardForTeam(allBalls, t1Static);
  const t2Sb = scoreboardForTeam(allBalls, t2Static);
  if (!t1Sb || !t2Sb || t1Sb === t2Sb) {
    // Couldn't reliably split the two innings between the two teams — bail.
    // This happens for matches with too few static-squad overlap (e.g. a
    // brand-new team) or before any balls have been recorded.
    return { added: [], updated: 0, skipped: [] };
  }

  const activity = activityByScoreboard(allBalls);
  const r1 = rosterForTeam(t1Sb, activity);
  const r2 = rosterForTeam(t2Sb, activity);

  const a = await syncTeam(team1, match.id, r1);
  const b = await syncTeam(team2, match.id, r2);

  return {
    added: [...a.added, ...b.added],
    updated: a.updated + b.updated,
    skipped: [],
  };
}
