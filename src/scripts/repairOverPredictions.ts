import { sequelize } from "../models";
import { repairPerOverPredictions } from "../services/sportsmonkApi";

function getArg(flag: string): string | undefined {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const matchId = getArg("--matchId");

  await sequelize.authenticate();
  console.log("Database connected");

  const summary = await repairPerOverPredictions({ matchId });

  console.log(
    `Checked ${summary.matchesChecked} matches, validated ${summary.predictionsChecked} per-over predictions, corrected ${summary.predictionsCorrected}, recomputed ${summary.participantsRecomputed} participants and ${summary.userPredictionsRecomputed} user prediction rows`
  );
}

main()
  .catch((error) => {
    console.error("Per-over repair failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
  });
