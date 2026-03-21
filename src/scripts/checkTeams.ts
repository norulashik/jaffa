import dotenv from "dotenv";
dotenv.config();

const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

async function check() {
  const teamIds = [42, 40, 13, 3060, 16, 12, 79, 73, 75, 77];
  for (const id of teamIds) {
    const res = await fetch(`${API_BASE}/teams/${id}?api_token=${API_TOKEN}`);
    const data: any = await res.json();
    const team = data.data;
    if (team) {
      console.log(`  ${id} = ${team.name} (${team.code})`);
    } else {
      console.log(`  ${id} = not found`);
    }
  }
  process.exit(0);
}
check().catch((e) => { console.error(e); process.exit(1); });
