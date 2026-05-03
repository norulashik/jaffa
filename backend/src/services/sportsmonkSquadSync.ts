// Nightly pull of each IPL franchise's official squad from Sportmonks.
//
// Why this exists: the static squad in iplSquads.ts uses our hand-curated
// spellings ("Ryan Rickleton"), while Sportmonks's ball-by-ball feed uses
// its own ("Ryan Rickelton"). The runtime alias table in playerNameMatch.ts
// papers over this for known cases, but every new mismatch we discover is
// an at-bat where a punter card question voids on the user.
//
// Approach: once a day, fetch /teams/{teamId}?include=squad for each known
// IPL franchise. For every player Sportmonks lists, write a SquadOverride
// row with playerName = the Sportmonks fullname (the canonical spelling
// that will appear in ball feeds). When the merge in
// squadWithRolesForTeam() runs, those rows take precedence — so the punter
// card generator bakes Sportmonks-spelling names into questions, and the
// resolver finds them on first lookup with no fuzzy fallback needed.
//
// Throttling: at most one full sync per 24 h, gated in-process. The poll
// loop calls maybeSyncIplSquads() every tick; the gate makes it cheap.

import { Op } from "sequelize";
import { SquadOverride } from "../models";
import { getCachedIplTeamIds, sportsmonkConfig } from "./sportsmonkApi";
import { findFuzzyMatch } from "./playerNameMatch";
import { IPL_SQUADS_2026, type Player, type PlayerRole } from "../data/iplSquads";

interface SmonksSquadPlayer {
  id: number;
  fullname: string;
  position?: { resource?: string; name?: string } | null;
  battingstyle?: string | null;
  bowlingstyle?: string | null;
}

interface SyncTeamResult {
  team: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

let lastFullSyncAt = 0;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Gate the daily Sportmonks squad sync. The poll loop calls this on every
// tick (~5s); the in-process timestamp keeps the actual fetch to once per
// 24 h. On boot, fires once after a 30 s warm-up so teamCache has had at
// least one round of fixture fetches to populate IDs.
let bootedAt = Date.now();
const BOOT_DELAY_MS = 30_000;

export async function maybeSyncIplSquads(): Promise<{ ran: boolean; results?: SyncTeamResult[] }> {
  if (Date.now() - bootedAt < BOOT_DELAY_MS) return { ran: false };
  if (Date.now() - lastFullSyncAt < ONE_DAY_MS) return { ran: false };
  lastFullSyncAt = Date.now();
  try {
    const results = await syncAllIplSquads();
    return { ran: true, results };
  } catch (err) {
    console.error("[SmonksSquadSync] full sync failed:", err);
    // Roll the timestamp back so a transient failure doesn't lock us out
    // for the full 24 h. Next tick will try again.
    lastFullSyncAt = 0;
    return { ran: false };
  }
}

// Hit /teams/{teamId}?include=squad for every IPL franchise we have an ID
// for. Teams whose ID we haven't observed yet (cold start, etc.) are
// silently skipped — the next match import will populate teamCache and
// the next nightly run will pick them up.
export async function syncAllIplSquads(): Promise<SyncTeamResult[]> {
  const teams = getCachedIplTeamIds();
  if (teams.length === 0) {
    console.log("[SmonksSquadSync] no IPL teams in cache yet — deferring");
    return [];
  }
  const results: SyncTeamResult[] = [];
  for (const t of teams) {
    try {
      const r = await syncTeamSquadFromSportmonks(t.teamShort, t.teamId);
      results.push(r);
    } catch (err) {
      console.error(`[SmonksSquadSync] ${t.teamShort} sync error:`, err);
    }
  }
  console.log(`[SmonksSquadSync] synced ${results.length} teams`);
  return results;
}

async function fetchTeamSquad(teamId: number): Promise<SmonksSquadPlayer[]> {
  const { base, token, headers } = sportsmonkConfig();
  if (!token) return [];
  const url = `${base}/teams/${teamId}?api_token=${token}&include=squad`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`[SmonksSquadSync] /teams/${teamId} HTTP ${res.status}`);
    return [];
  }
  const json: any = await res.json();
  const squad = json?.data?.squad?.data;
  return Array.isArray(squad) ? squad : [];
}

// Map Sportmonks's `position.resource` / `position.name` to our coarse role.
// Sportmonks Cricket positions are usually one of: "Batsman", "Bowler",
// "Wicketkeeper", "Allrounder". We default to "bat" if the field is missing
// — it's the least disruptive default for downstream pickers (a misclassified
// bowler in the batter pool just won't get picked first).
function inferRoleFromPosition(p: SmonksSquadPlayer): PlayerRole {
  const name = (p.position?.name || "").toLowerCase();
  if (name.includes("wicket")) return "wk";
  if (name.includes("all")) return "all";
  if (name.includes("bowl")) return "bowl";
  if (name.includes("bat")) return "bat";
  // Fall back on bowlingstyle as a weak signal: a player with a defined
  // bowling style and no batting style is probably a bowler.
  if (p.bowlingstyle && !p.battingstyle) return "bowl";
  return "bat";
}

// Match a Sportmonks fullname against the static IPL squad (and any prior
// SquadOverride rows for this team) to find what we already know this player
// as. Used to set canonicalName so future resolveBallName lookups can
// short-circuit through the learned-alias map at match-end.
async function resolveCanonical(team: string, fullname: string): Promise<string | null> {
  const baseStatic = IPL_SQUADS_2026[team] || [];
  const baseNames = baseStatic.map((p: Player) => p.name);
  const matched = findFuzzyMatch(fullname, baseNames);
  return matched;
}

async function syncTeamSquadFromSportmonks(teamShort: string, teamId: number): Promise<SyncTeamResult> {
  const players = await fetchTeamSquad(teamId);
  let inserted = 0, updated = 0, skipped = 0;

  for (const p of players) {
    const fullname = (p.fullname || "").trim();
    if (!fullname) { skipped += 1; continue; }
    const role = inferRoleFromPosition(p);
    const canonical = await resolveCanonical(teamShort, fullname);

    // Look up by either (a) the exact Sportmonks spelling or (b) the
    // canonical static-squad name we just resolved. Either is enough to
    // identify "this is the same player as a prior row" — covers the case
    // where a previous match-derived row used a slightly different spelling.
    const existing = await SquadOverride.findOne({
      where: {
        team: teamShort,
        [Op.or]: [
          { playerName: { [Op.iLike]: fullname } },
          ...(canonical ? [{ canonicalName: { [Op.iLike]: canonical } }] : []),
        ],
      },
    });

    if (existing) {
      // Never overwrite an admin-authored "manual" row — those are an
      // explicit human override of whatever Sportmonks would say. Match-
      // sourced rows ARE upgraded to smonks-sourced spellings, since the
      // Sportmonks team feed is closer to the canonical source than what
      // we observed in a single ball-by-ball stream.
      if (existing.source === "manual") { skipped += 1; continue; }
      const patch: Record<string, unknown> = {
        playerName: fullname,
        role,
        source: "smonks",
        lastSeenAt: new Date(),
        removedAt: null,
      };
      if (canonical && existing.canonicalName !== canonical) patch.canonicalName = canonical;
      await existing.update(patch);
      updated += 1;
    } else {
      await SquadOverride.create({
        team: teamShort,
        playerName: fullname,
        canonicalName: canonical,
        role,
        source: "smonks",
        addedFromMatchId: null,
        lastSeenAt: new Date(),
        removedAt: null,
      });
      inserted += 1;
    }
  }

  if (players.length > 0) {
    console.log(`[SmonksSquadSync] ${teamShort}: ${players.length} fetched, ${inserted} new, ${updated} updated, ${skipped} skipped`);
  }
  return { team: teamShort, fetched: players.length, inserted, updated, skipped };
}

// Test hook — lets unit tests reset the boot delay + 24h gate without
// having to wait or mock Date.
export function _resetSmonksSquadSyncGate(): void {
  bootedAt = 0;
  lastFullSyncAt = 0;
}
