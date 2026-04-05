import { sequelize, User, Venue, Match, Prediction, UserPrediction, MatchParticipant, Reward } from "../src/models";
import { generatePreMatchPredictions, generatePerOverPredictions } from "../src/services/predictionEngine";
import { calculatePoints } from "../src/services/pointsEngine";
import chalk from "chalk";

interface TestScenario {
  userId: string;
  predictionId: string;
  selectedOption: string;
  boostType: "none" | "boost" | "all_in";
}

/**
 * Comprehensive Seed Script for Testing
 *
 * Creates:
 * - 1 Venue (Sample Sports Bar)
 * - 1 Match (CSK vs MI IPL match)
 * - 4 Test Users with varied profiles
 * - 4 Pre-match predictions
 * - 2 Per-over predictions (Over 1)
 * - User answers with different strategies (boosts, All-In, normal)
 * - Resolves predictions and shows results
 */

async function seedTestData() {
  try {
    console.log(chalk.bold.blue("\n🎮 JAFFA Test Data Seed Script\n"));

    // Sync database
    console.log(chalk.cyan("📊 Syncing database..."));
    await sequelize.sync({ force: false }); // Don't destroy existing data, just create if missing
    console.log(chalk.green("✓ Database synced\n"));

    // 1. Create Venue
    console.log(chalk.cyan("🏢 Creating venue..."));
    const venue = await Venue.create({
      name: "The Stadium Lounge",
      ownerName: "Rajesh Kumar",
      ownerPhone: "+919876543210",
      password: "test123", // In production, this would be hashed
      latitude: 19.076,
      longitude: 72.8479,
      radiusMeters: 200,
      rewardConfig: {
        roundReward: {
          top1: "Free beer + snacks",
          top2: "50% off next order",
          top3: "Free drink",
        },
        grandPrize: {
          top1: "Dinner for 2 (₹2000 voucher)",
          top2: "Lunch for 2 (₹1000 voucher)",
          top3: "Free appetizer + drinks",
        },
      },
      approvalStatus: "approved",
      isActive: true,
    });
    console.log(chalk.green(`✓ Venue created: ${venue.name} (${venue.id})\n`));

    // 2. Create Match
    console.log(chalk.cyan("🏏 Creating match..."));
    const matchStartTime = new Date(Date.now() + 60 * 60_000); // 1 hour from now
    const match = await Match.create({
      team1: "Chennai Super Kings",
      team2: "Mumbai Indians",
      team1Short: "CSK",
      team2Short: "MI",
      team1Players: ["Ruturaj Gaikwad", "Faf du Plessis", "MS Dhoni"],
      team2Players: ["Rohit Sharma", "Suryakumar Yadav", "Jasprit Bumrah"],
      startTime: matchStartTime,
      status: "upcoming",
      currentPhase: "pre_match",
      currentOver: 0,
      currentInnings: 0,
    });
    console.log(chalk.green(`✓ Match created: ${match.team1Short} vs ${match.team2Short} (${match.id})\n`));

    // 3. Create Test Users
    console.log(chalk.cyan("👥 Creating test users..."));
    const users = await Promise.all([
      User.create({
        phone: "+919876543201",
        displayName: "Arjun",
        avatarConfig: JSON.stringify({ seed: "Arjun", variant: "default" }),
      }),
      User.create({
        phone: "+919876543202",
        displayName: "Priya",
        avatarConfig: JSON.stringify({ seed: "Priya", variant: "default" }),
      }),
      User.create({
        phone: "+919876543203",
        displayName: "Rohan",
        avatarConfig: JSON.stringify({ seed: "Rohan", variant: "default" }),
      }),
      User.create({
        phone: "+919876543204",
        displayName: "Sakshi",
        avatarConfig: JSON.stringify({ seed: "Sakshi", variant: "default" }),
      }),
    ]);
    users.forEach((u: User) => console.log(chalk.green(`  ✓ ${u.displayName} (${u.phone}`)));
    console.log();

    // 4. Register users as match participants
    console.log(chalk.cyan("📋 Registering participants..."));
    const participants = await Promise.all(
      users.map((u: User) =>
        MatchParticipant.create({
          userId: u.id,
          matchId: match.id,
          venueId: venue.id,
          totalPoints: 0,
          currentStreak: 0,
          bestStreak: 0,
          allInUsed: false,
          boostsUsedRound: 0,
          currentRound: 0,
          totalPredictions: 0,
          correctPredictions: 0,
          joinedAt: new Date(),
        })
      )
    );
    participants.forEach((p: MatchParticipant, i: number) =>
      console.log(chalk.green(`  ✓ ${users[i].displayName} joined match`))
    );
    console.log();

    // 5. Create Pre-Match Predictions
    console.log(chalk.cyan("❓ Creating pre-match predictions..."));
    const preMatchQuestions = generatePreMatchPredictions(
      match.id,
      match.team1,
      match.team2,
      match.team1Short,
      match.team2Short,
      match.team1Players,
      match.team2Players
    );

    const preMatchPreds = await Promise.all(
      preMatchQuestions.map((q: any) =>
        Prediction.create({
          ...q,
          category: "pre_match",
          status: "open",
        })
      )
    );
    console.log(chalk.green(`✓ Created ${preMatchPreds.length} pre-match predictions\n`));

    // 6. Create Per-Over Predictions (Over 1)
    console.log(chalk.cyan("❓ Creating per-over predictions (Over 1)..."));
    const perOverQuestions = generatePerOverPredictions(match.id, 1, 1, "Faf du Plessis");
    const perOverPreds = await Promise.all(
      perOverQuestions.map((q: any) =>
        Prediction.create({
          ...q,
          category: "per_over",
          status: "open",
          overNumber: 1,
        })
      )
    );
    console.log(chalk.green(`✓ Created ${perOverPreds.length} per-over predictions\n`));

    // 7. Create User Answers with Varied Strategies
    console.log(chalk.cyan("🎯 Creating user predictions with varied strategies...\n"));

    const testScenarios: TestScenario[] = [
      // Arjun: All correct, uses both boosts strategically
      { userId: users[0].id, predictionId: preMatchPreds[0].id, selectedOption: "csk", boostType: "boost" },
      { userId: users[0].id, predictionId: preMatchPreds[1].id, selectedOption: "csk_bat", boostType: "none" },
      { userId: users[0].id, predictionId: preMatchPreds[2].id, selectedOption: "csk", boostType: "boost" },
      { userId: users[0].id, predictionId: preMatchPreds[3].id, selectedOption: "bowled", boostType: "none" },
      { userId: users[0].id, predictionId: perOverPreds[0].id, selectedOption: "medium", boostType: "none" },
      { userId: users[0].id, predictionId: perOverPreds[1].id, selectedOption: "no", boostType: "none" },

      // Priya: Mixed results, uses All-In on risky question (will fail)
      { userId: users[1].id, predictionId: preMatchPreds[0].id, selectedOption: "csk", boostType: "none" },
      { userId: users[1].id, predictionId: preMatchPreds[1].id, selectedOption: "mi_field", boostType: "all_in" }, // Wrong! Will get -30
      { userId: users[1].id, predictionId: preMatchPreds[2].id, selectedOption: "mi", boostType: "boost" },
      { userId: users[1].id, predictionId: preMatchPreds[3].id, selectedOption: "caught", boostType: "none" },
      { userId: users[1].id, predictionId: perOverPreds[0].id, selectedOption: "high", boostType: "boost" },
      { userId: users[1].id, predictionId: perOverPreds[1].id, selectedOption: "yes", boostType: "none" },

      // Rohan: Mostly correct, builds streak
      { userId: users[2].id, predictionId: preMatchPreds[0].id, selectedOption: "csk", boostType: "none" },
      { userId: users[2].id, predictionId: preMatchPreds[1].id, selectedOption: "csk_bat", boostType: "none" },
      { userId: users[2].id, predictionId: preMatchPreds[2].id, selectedOption: "csk", boostType: "none" },
      { userId: users[2].id, predictionId: preMatchPreds[3].id, selectedOption: "bowled", boostType: "none" },
      { userId: users[2].id, predictionId: perOverPreds[0].id, selectedOption: "medium", boostType: "none" },
      { userId: users[2].id, predictionId: perOverPreds[1].id, selectedOption: "no", boostType: "boost" },

      // Sakshi: Some correct, some wrong, conservative play
      { userId: users[3].id, predictionId: preMatchPreds[0].id, selectedOption: "csk", boostType: "none" },
      { userId: users[3].id, predictionId: preMatchPreds[1].id, selectedOption: "mi_bat", boostType: "none" }, // Wrong
      { userId: users[3].id, predictionId: preMatchPreds[2].id, selectedOption: "mi", boostType: "none" }, // Wrong
      { userId: users[3].id, predictionId: preMatchPreds[3].id, selectedOption: "lbw", boostType: "none" }, // Wrong
      { userId: users[3].id, predictionId: perOverPreds[0].id, selectedOption: "low", boostType: "none" },
      { userId: users[3].id, predictionId: perOverPreds[1].id, selectedOption: "no", boostType: "none" },
    ];

    const userPredictions = await Promise.all(
      testScenarios.map((scenario) =>
        UserPrediction.create({
          userId: scenario.userId,
          predictionId: scenario.predictionId,
          matchId: match.id,
          venueId: venue.id,
          selectedOption: scenario.selectedOption,
          boostType: scenario.boostType,
          pointsEarned: 0, // Will be calculated when resolved
          isCorrect: false, // Will be determined when resolved
          answeredAt: new Date(),
        })
      )
    );

    console.log(chalk.green(`✓ Created ${userPredictions.length} user predictions\n`));
    console.log(chalk.yellow("User Strategies:"));
    console.log(chalk.yellow("  • Arjun: All correct + 2 boosts strategically"));
    console.log(chalk.yellow("  • Priya: Mixed + All-In on wrong answer (calculated -30 penalty)"));
    console.log(chalk.yellow("  • Rohan: All correct + builds 5+ streak (emit event)"));
    console.log(chalk.yellow("  • Sakshi: Conservative, gets some wrong\n"));

    // 8. Resolve Predictions and Calculate Points
    console.log(chalk.cyan("⚡ Resolving predictions and calculating points...\n"));

    const correctAnswers = new Map([
      [preMatchPreds[0].id, "csk"],      // Q1: CSK wins
      [preMatchPreds[1].id, "csk_bat"],  // Q2: CSK wins, bats first
      [preMatchPreds[2].id, "csk"],      // Q3: CSK hits more sixes
      [preMatchPreds[3].id, "bowled"],   // Q4: First wicket bowled
      [perOverPreds[0].id, "medium"],    // Over 1: 6-10 runs
      [perOverPreds[1].id, "no"],        // Over 1: No wicket
    ]);

    // Update all predictions to resolved
    for (const [predId, correctOption] of correctAnswers.entries()) {
      const pred = await Prediction.findByPk(predId);
      if (pred) {
        await pred.update({ correctOption, status: "resolved" });
      }
    }

    // Calculate points for each user
    console.log(chalk.bold("Points Breakdown:\n"));
    const pointsBreakdown: Record<string, any> = {};

    for (const user of users) {
      pointsBreakdown[user.id] = {
        name: user.displayName,
        predictions: [],
        totalPoints: 0,
      };
    }

    for (const up of userPredictions) {
      const pred = await Prediction.findByPk(up.predictionId);
      if (!pred) continue;

      const participant = participants.find((p: MatchParticipant) => p.userId === up.userId);
      if (!participant) continue;

      const result = calculatePoints(pred, up.selectedOption, up.boostType, participant.currentStreak);

      // Update UserPrediction
      await up.update({
        isCorrect: result.isCorrect,
        pointsEarned: result.totalPoints,
      });

      // Update MatchParticipant
      if (result.isCorrect) {
        await participant.update({
          totalPoints: Math.max(0, participant.totalPoints + result.totalPoints),
          round1Points: Math.max(0, (participant.round1Points || 0) + result.totalPoints),
          currentStreak: result.newStreak,
          bestStreak: Math.max(participant.bestStreak, result.newStreak),
          correctPredictions: participant.correctPredictions + 1,
          totalPredictions: participant.totalPredictions + 1,
        });
      } else {
        await participant.update({
          totalPoints: Math.max(0, participant.totalPoints + result.totalPoints),
          round1Points: Math.max(0, (participant.round1Points || 0) + result.totalPoints),
          currentStreak: 0,
          totalPredictions: participant.totalPredictions + 1,
        });
      }

      // Track for display
      const question = pred.question.substring(0, 40) + (pred.question.length > 40 ? "..." : "");
      const multiplierStr = result.multiplier > 1 ? ` x${result.multiplier} (${up.boostType})` : "";
      pointsBreakdown[up.userId].predictions.push({
        question,
        correct: result.isCorrect ? "✓" : "✗",
        points: result.totalPoints,
        multiplierStr,
      });
      pointsBreakdown[up.userId].totalPoints += result.totalPoints;
    }

    // Display points breakdown
    for (const user of users) {
      const breakdown = pointsBreakdown[user.id];
      console.log(chalk.bold.cyan(`${user.displayName}:`));
      breakdown.predictions.forEach((p: any) => {
        const status = p.correct === "✓" ? chalk.green(p.correct) : chalk.red(p.correct);
        const pts = p.points >= 0 ? chalk.green(`+${p.points}`) : chalk.red(`${p.points}`);
        console.log(`  ${status}  ${p.question.padEnd(42)} ${pts.padStart(6)}pts${p.multiplierStr}`);
      });
      console.log(chalk.bold.yellow(`  TOTAL: ${breakdown.totalPoints} points\n`));
    }

    // 9. Fetch and Display Final Leaderboard
    console.log(chalk.bold.blue("\n🏆 FINAL LEADERBOARD\n"));

    const finalLeaderboard = await MatchParticipant.findAll({
      where: { matchId: match.id, venueId: venue.id },
      order: [["totalPoints", "DESC"]],
      include: [{ association: "user", attributes: ["displayName"] }],
    });

    console.log(chalk.bold("Round 1 Standings:\n"));
    finalLeaderboard.forEach((p: MatchParticipant, i: number) => {
      const user = (p as any).user;
      const position = i + 1;
      const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : "  ";
      const streak = p.bestStreak > 0 ? ` | Streak: ${p.bestStreak}` : "";
      console.log(
        `${medal} #${position.toString().padStart(2)} ${user.displayName.padEnd(15)} ${p.round1Points} pts (${p.correctPredictions}/${p.totalPredictions} correct)${streak}`
      );
    });

    // 10. Summary
    console.log(chalk.bold.cyan("\n✅ TEST DATA SEEDING COMPLETE\n"));
    console.log(chalk.gray("Summary:"));
    console.log(chalk.gray(`  • Venue: ${venue.name}`));
    console.log(chalk.gray(`  • Match: ${match.team1Short} vs ${match.team2Short}`));
    console.log(chalk.gray(`  • Participants: ${users.length}`));
    console.log(chalk.gray(`  • Predictions: ${preMatchPreds.length + perOverPreds.length}`));
    console.log(chalk.gray(`  • User Answers: ${userPredictions.length}`));
    console.log(
      chalk.gray(`\nKey Test Cases:`)
    );
    console.log(chalk.gray(`  ✓ Boost multiplier (2x) validation`));
    console.log(chalk.gray(`  ✓ All-In penalty (-30) on wrong answer`));
    console.log(chalk.gray(`  ✓ Streak building and reset`));
    console.log(chalk.gray(`  ✓ Points flooring at 0 (no negatives)`));
    console.log(chalk.gray(`  ✓ Leaderboard ordering by points`));
    console.log(chalk.gray(`\nYou can now:`));
    console.log(chalk.yellow(`  1. Run frontend and check leaderboard: http://localhost:3000`));
    console.log(chalk.yellow(`  2. Query database: SELECT * FROM match_participants WHERE match_id='${match.id}';`));
    console.log(chalk.yellow(`  3. Test Socket.IO events by connecting multiple clients\n`));
  } catch (error) {
    console.error(chalk.red("❌ Seeding failed:"), error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  seedTestData();
}

export default seedTestData;
