import dotenv from "dotenv";
dotenv.config();

const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

// Cache team names to avoid repeated API calls
const teamCache: Map<number, { name: string; code: string }> = new Map();

async function getTeamName(teamId: number): Promise<{ name: string; code: string }> {
  if (teamCache.has(teamId)) return teamCache.get(teamId)!;
  try {
    const res = await fetch(`${API_BASE}/teams/${teamId}?api_token=${API_TOKEN}`);
    const data: any = await res.json();
    const team = { name: data.data?.name || `Team ${teamId}`, code: data.data?.code || "" };
    teamCache.set(teamId, team);
    return team;
  } catch {
    return { name: `Team ${teamId}`, code: "" };
  }
}

async function fetchTodayLive() {
  console.log("=== SPORTMONKS: TODAY'S LIVE & SCHEDULED MATCHES ===\n");
  console.log(`Date: ${new Date().toISOString()}\n`);

  // 1. Fetch live matches
  console.log("--- LIVE MATCHES ---");
  const liveRes = await fetch(`${API_BASE}/livescores?api_token=${API_TOKEN}&include=runs`);
  const liveData: any = await liveRes.json();
  const liveMatches = liveData.data || [];

  if (liveMatches.length === 0) {
    console.log("  No live matches right now.\n");
  } else {
    for (const m of liveMatches) {
      const local = await getTeamName(m.localteam_id);
      const visitor = await getTeamName(m.visitorteam_id);

      console.log(`\n  ${local.name} (${local.code}) vs ${visitor.name} (${visitor.code})`);
      console.log(`  Fixture ID: ${m.id} | Status: ${m.status}`);
      console.log(`  Round: ${m.round} | Season ID: ${m.season_id} | League ID: ${m.league_id}`);
      console.log(`  Starting at: ${m.starting_at}`);
      console.log(`  Note: ${m.note || "N/A"}`);
      if (m.toss_won_team_id) {
        const tossWinner = await getTeamName(m.toss_won_team_id);
        console.log(`  Toss: ${tossWinner.name} won, elected to ${m.elected}`);
      }

      const runs = m.runs?.data || (Array.isArray(m.runs) ? m.runs : []);
      for (const r of runs) {
        const battingTeam = await getTeamName(r.team_id);
        console.log(`  Innings ${r.inning}: ${battingTeam.name} — ${r.score}/${r.wickets} (${r.overs} overs)`);
      }
    }
    console.log();
  }

  // 2. Fetch today's fixtures
  const today = new Date().toISOString().split("T")[0];
  console.log(`--- TODAY'S FIXTURES (${today}) ---`);
  const fixRes = await fetch(
    `${API_BASE}/fixtures?filter[starts_between]=${today},${today}&api_token=${API_TOKEN}&include=runs,venue`
  );
  const fixData: any = await fixRes.json();
  const fixtures = fixData.data || [];

  if (fixtures.length === 0) {
    console.log("  No fixtures scheduled for today.\n");
  } else {
    for (const f of fixtures) {
      const local = await getTeamName(f.localteam_id);
      const visitor = await getTeamName(f.visitorteam_id);
      const venue = f.venue?.data?.name || "Unknown venue";

      console.log(`\n  ${local.name} (${local.code}) vs ${visitor.name} (${visitor.code})`);
      console.log(`  Fixture ID: ${f.id} | Status: ${f.status} | Starts: ${f.starting_at}`);
      console.log(`  Venue: ${venue}`);
      if (f.toss_won_team_id) {
        const tossWinner = await getTeamName(f.toss_won_team_id);
        console.log(`  Toss: ${tossWinner.name} won, elected to ${f.elected}`);
      }

      const runs = f.runs?.data || (Array.isArray(f.runs) ? f.runs : []);
      for (const r of runs) {
        const battingTeam = await getTeamName(r.team_id);
        console.log(`  Innings ${r.inning}: ${battingTeam.name} — ${r.score}/${r.wickets} (${r.overs} overs)`);
      }
    }
    console.log();
  }

  // 3. Also check upcoming few days for context
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 3);
  const end = endDate.toISOString().split("T")[0];
  console.log(`--- UPCOMING FIXTURES (${today} to ${end}) ---`);
  const upRes = await fetch(
    `${API_BASE}/fixtures?filter[starts_between]=${today},${end}&api_token=${API_TOKEN}`
  );
  const upData: any = await upRes.json();
  const upcoming = upData.data || [];

  if (upcoming.length === 0) {
    console.log("  No upcoming fixtures.\n");
  } else {
    for (const f of upcoming.slice(0, 10)) {
      const local = await getTeamName(f.localteam_id);
      const visitor = await getTeamName(f.visitorteam_id);
      console.log(`  ${f.starting_at} | ${local.name} vs ${visitor.name} | Status: ${f.status} | ID: ${f.id}`);
    }
    console.log();
  }

  console.log("=== DONE ===");
  process.exit(0);
}

fetchTodayLive().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
