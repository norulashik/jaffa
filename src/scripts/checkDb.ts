import dotenv from "dotenv";
dotenv.config();
import { sequelize, Match } from "../models";

async function check() {
  await sequelize.authenticate();
  const matches = await Match.findAll();
  console.log("Total matches:", matches.length);
  for (const m of matches) {
    console.log(m.id, m.team1Short, "vs", m.team2Short, "| status:", m.status);
  }
  process.exit(0);
}
check().catch((e) => { console.error(e); process.exit(1); });
