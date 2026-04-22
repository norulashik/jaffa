import dotenv from "dotenv";
dotenv.config();

import { sequelize, Prediction } from "../models";
import { writePredictionAggregates } from "../services/pointsEngine";

async function main() {
  try {
    await sequelize.authenticate();
    // Ensure the new table exists before we try to upsert into it.
    await sequelize.sync({ alter: true });

    const resolved = await Prediction.findAll({ where: { status: "resolved" } });
    console.log(`[Backfill] ${resolved.length} resolved predictions to process`);

    let ok = 0;
    for (const prediction of resolved) {
      await writePredictionAggregates(prediction);
      ok += 1;
      if (ok % 50 === 0) console.log(`[Backfill] ${ok}/${resolved.length} done`);
    }

    console.log(`[Backfill] complete — ${ok} predictions aggregated`);
    process.exit(0);
  } catch (err) {
    console.error("[Backfill] error:", err);
    process.exit(1);
  }
}

main();
