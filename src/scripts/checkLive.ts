import dotenv from "dotenv";
dotenv.config();

const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

async function check() {
  // Live matches
  const res = await fetch(`${API_BASE}/livescores?api_token=${API_TOKEN}`);
  const data: any = await res.json();
  const fixtures = data.data || [];
  console.log("Live matches:", fixtures.length);
  for (const f of fixtures) {
    console.log(`  ${f.id} | team ${f.localteam_id} vs team ${f.visitorteam_id} | status: ${f.status} | note: ${f.note || "N/A"}`);
  }

  // Today
  const today = "2026-03-21";
  const res2 = await fetch(`${API_BASE}/fixtures?filter[starts_between]=${today},${today}&api_token=${API_TOKEN}`);
  const data2: any = await res2.json();
  const fixtures2 = data2.data || [];
  console.log(`\nToday (${today}):`, fixtures2.length, "fixtures");
  for (const f of fixtures2) {
    console.log(`  ${f.id} | team ${f.localteam_id} vs team ${f.visitorteam_id} | status: ${f.status} | starts: ${f.starting_at}`);
  }

  // Upcoming 7 days
  const end = "2026-03-28";
  const res3 = await fetch(`${API_BASE}/fixtures?filter[starts_between]=${today},${end}&api_token=${API_TOKEN}`);
  const data3: any = await res3.json();
  const fixtures3 = data3.data || [];
  console.log(`\nUpcoming (${today} to ${end}):`, fixtures3.length, "fixtures");
  for (const f of fixtures3.slice(0, 15)) {
    console.log(`  ${f.id} | team ${f.localteam_id} vs team ${f.visitorteam_id} | status: ${f.status} | starts: ${f.starting_at}`);
  }

  process.exit(0);
}
check().catch((e) => { console.error(e); process.exit(1); });
