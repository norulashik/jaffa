import dotenv from "dotenv";
dotenv.config();

import { sequelize, Match } from "../models";
import { syncSquadFromMatch } from "../services/squadSync";
import { fetchLiveFixtureForTracker } from "../services/sportsmonkApi";

// Seed the SquadOverride table from historical match data. Walks every
// completed match in the DB, fetches its full ball-by-ball, and runs the
// same syncSquadFromMatch the live finalizeMatch hook now calls. Idempotent:
// re-running it just bumps lastSeenAt and adds nothing new.
//
// Run via: jaffa-deploy --script seedSquadOverrides
//          (or: npx ts-node backend/src/scripts/seedSquadOverrides.ts)

async function main() {
  await sequelize.authenticate();
  // Make sure the new squad_overrides table exists before we write to it.
  await sequelize.sync({ alter: true });

  const matches = await Match.findAll({
    where: { status: "completed" },
    order: [["startTime", "ASC"]],
  });
  console.log(`[SeedSquadOverrides] processing ${matches.length} completed matches`);

  let totalAdded = 0;
  let totalUpdated = 0;
  let skipped = 0;

  for (const m of matches) {
    if (!m.externalId) {
      skipped += 1;
      continue;
    }
    let fixture: any = null;
    let allBalls: any[] = [];
    try {
      fixture = await fetchLiveFixtureForTracker(Number(m.externalId), true);
      allBalls = fixture?.balls?.data || [];
    } catch (err) {
      console.error(`[SeedSquadOverrides] failed to fetch fixture for match=${m.id}:`, err);
      skipped += 1;
      continue;
    }
    if (allBalls.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      const r = await syncSquadFromMatch(m, fixture, allBalls);
      totalAdded += r.added.length;
      totalUpdated += r.updated;
      if (r.added.length > 0) {
        console.log(`[SeedSquadOverrides] match=${m.id} ${m.team1Short}vs${m.team2Short} added=${r.added.join(", ")}`);
      }
    } catch (err) {
      console.error(`[SeedSquadOverrides] sync error for match=${m.id}:`, err);
    }
  }

  console.log(
    `[SeedSquadOverrides] complete — added=${totalAdded} updated=${totalUpdated} skipped=${skipped}/${matches.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[SeedSquadOverrides] fatal:", err);
  process.exit(1);
});
