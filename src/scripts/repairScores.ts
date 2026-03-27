import { sequelize } from "../models";
import { recomputeParticipantScores } from "../services/pointsEngine";

function getArg(flag: string): string | undefined {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const matchId = getArg("--matchId");
  const venueId = getArg("--venueId");
  const userId = getArg("--userId");

  await sequelize.authenticate();
  console.log("Database connected");

  const summary = await recomputeParticipantScores({ matchId, venueId, userId });

  console.log(
    `Recomputed ${summary.participantsRecomputed} participants and ${summary.userPredictionsRecomputed} user prediction rows`
  );
}

main()
  .catch((error) => {
    console.error("Score repair failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
  });
