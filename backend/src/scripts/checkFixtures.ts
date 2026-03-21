import dotenv from "dotenv";
dotenv.config();

const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

async function check() {
  const today = "2026-03-20";
  const url = `${API_BASE}/fixtures?filter[starts_between]=${today},${today}&api_token=${API_TOKEN}`;
  console.log("Fetching:", url.replace(API_TOKEN, "***"));
  const res = await fetch(url);
  const data: any = await res.json();
  const fixtures = data.data || [];
  console.log("Fixtures today:", fixtures.length);
  for (const f of fixtures) {
    console.log(`  ${f.id} | ${f.localteam_id} vs ${f.visitorteam_id} | status: ${f.status}`);
  }

  // Also check tomorrow
  const tomorrow = "2026-03-21";
  const url2 = `${API_BASE}/fixtures?filter[starts_between]=${tomorrow},${tomorrow}&api_token=${API_TOKEN}`;
  const res2 = await fetch(url2);
  const data2: any = await res2.json();
  const fixtures2 = data2.data || [];
  console.log("\nFixtures tomorrow:", fixtures2.length);
  for (const f of fixtures2.slice(0, 5)) {
    console.log(`  ${f.id} | ${f.localteam_id} vs ${f.visitorteam_id} | status: ${f.status}`);
  }

  process.exit(0);
}
check().catch((e) => { console.error(e); process.exit(1); });
