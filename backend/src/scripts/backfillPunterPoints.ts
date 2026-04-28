import dotenv from "dotenv";
dotenv.config();

import { Op } from "sequelize";
import { sequelize, User, UserPrediction, WeeklyRedemption } from "../models";
import { getYearWeekNumber } from "../utils/weekHelper";

// One-time recompute for User.weeklyPoints + User.lifetimePoints. Needed
// because scorePunterUserAnswers (punterCard.ts) historically updated only
// UserPrediction.pointsEarned and MatchParticipant.totalPoints, never the
// User row — so punter-card winnings silently dropped out of the bottom-nav
// weekly badge and /profile lifetime stat.
//
// Strategy — both fields are recomputed from authoritative sources, so the
// script is fully idempotent and safe to re-run:
//   - lifetimePoints  = SUM(UserPrediction.pointsEarned WHERE isCorrect)
//   - weeklyPoints    = max(0, weeklyEarned - weeklyRedeemed) where
//       weeklyEarned   = SUM(UserPrediction.pointsEarned WHERE isCorrect
//                            AND updatedAt >= start-of-current-ISO-week)
//       weeklyRedeemed = SUM(WeeklyRedemption.pointsSpent WHERE
//                            weekNumber = current)
// Re-running yields identical numbers because both summands are derived
// from event tables that the script never modifies.

function startOfCurrentIsoWeek(): Date {
  const now = new Date();
  const day = now.getUTCDay() || 7; // Sun=0 → 7
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - (day - 1),
    0, 0, 0, 0,
  ));
}

async function main() {
  await sequelize.authenticate();

  const users = await User.findAll({
    attributes: ["id", "displayName", "weeklyPoints", "weekNumber", "lifetimePoints"],
  });
  console.log(`[BackfillPunterPoints] processing ${users.length} users`);

  const currentWeek = getYearWeekNumber();
  const weekStart = startOfCurrentIsoWeek();

  let lifetimeChanged = 0;
  let weeklyChanged = 0;
  let unchanged = 0;
  const BATCH = 100;

  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    await Promise.all(batch.map(async (user) => {
      // Lifetime: sum every win this user has ever scored (any category).
      const lifetimeRow = await UserPrediction.findAll({
        where: { userId: user.id, isCorrect: true },
        attributes: [[sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("pointsEarned")), 0), "total"]],
        raw: true,
      }) as unknown as Array<{ total: string | number }>;
      const trueLifetime = Number(lifetimeRow[0]?.total || 0);

      // Weekly earned: every win whose UserPrediction was scored this week.
      // updatedAt is set by ua.update() on the scoring path, so it tracks
      // the resolution moment regardless of category.
      const weekEarnedRow = await UserPrediction.findAll({
        where: {
          userId: user.id,
          isCorrect: true,
          updatedAt: { [Op.gte]: weekStart },
        },
        attributes: [[sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("pointsEarned")), 0), "total"]],
        raw: true,
      }) as unknown as Array<{ total: string | number }>;
      const weeklyEarned = Number(weekEarnedRow[0]?.total || 0);

      // Weekly redeemed: spend total against the current week bucket.
      const redemptionRow = await WeeklyRedemption.findAll({
        where: { userId: user.id, weekNumber: currentWeek },
        attributes: [[sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("pointsSpent")), 0), "total"]],
        raw: true,
      }) as unknown as Array<{ total: string | number }>;
      const weeklyRedeemed = Number(redemptionRow[0]?.total || 0);

      const newWeekly = Math.max(0, weeklyEarned - weeklyRedeemed);

      // Capture pre-update values; user.update mutates the instance.
      const oldLifetime = user.lifetimePoints || 0;
      const oldWeekly = user.weeklyPoints;
      const oldWeekNumber = user.weekNumber;

      const lifetimeDiff = trueLifetime - oldLifetime;
      const weeklyDiff = newWeekly - oldWeekly;

      if (lifetimeDiff === 0 && weeklyDiff === 0 && oldWeekNumber === currentWeek) {
        unchanged += 1;
        return;
      }

      await user.update({
        lifetimePoints: trueLifetime,
        weeklyPoints: newWeekly,
        weekNumber: currentWeek,
      });

      if (lifetimeDiff !== 0) lifetimeChanged += 1;
      if (weeklyDiff !== 0) weeklyChanged += 1;

      console.log(
        `[BackfillPunterPoints] user=${user.id} (${user.displayName || "?"}) ` +
        `lifetime ${oldLifetime} → ${trueLifetime} (${lifetimeDiff >= 0 ? "+" : ""}${lifetimeDiff}), ` +
        `weekly ${oldWeekly} → ${newWeekly} (earned=${weeklyEarned}, redeemed=${weeklyRedeemed}, ` +
        `diff=${weeklyDiff >= 0 ? "+" : ""}${weeklyDiff})`,
      );
    }));
    console.log(`[BackfillPunterPoints] processed ${Math.min(i + BATCH, users.length)}/${users.length}`);
  }

  console.log(
    `[BackfillPunterPoints] complete — ` +
    `${lifetimeChanged} lifetime updated, ${weeklyChanged} weekly updated, ${unchanged} unchanged`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[BackfillPunterPoints] error:", err);
  process.exit(1);
});
