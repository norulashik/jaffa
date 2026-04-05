import dotenv from "dotenv";
dotenv.config();

import { sequelize, User, Match, MatchParticipant, Prediction, UserPrediction } from "../models";

async function seedLeaderboard() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database");

    // Get the MOST RECENT match (should be our seeded match)
    const match = await Match.findOne({
      where: { status: "live" },
      order: [["createdAt", "DESC"]],
    });

    if (!match) {
      console.error("No live match found. Run seed.ts first.");
      process.exit(1);
    }

    const venueId = "2877dfd2-1492-461b-b28d-52badb40d73e"; // from seed output
    console.log(`Seeding leaderboard for match: ${match.id}, venue: ${venueId}`);

    // Clear existing participants for this match
    await MatchParticipant.destroy({
      where: { matchId: match.id, venueId },
    });
    console.log("Cleared existing participants");

    // Create test users with simple nicknames
    const testPlayers = [
      { phone: "9999999991", displayName: "Blacky", avatarConfig: { color: "black", pattern: "dark" } },
      { phone: "9999999992", displayName: "Jack", avatarConfig: { color: "blue", pattern: "bold" } },
      { phone: "9999999993", displayName: "Vazhakabhaji", avatarConfig: { color: "green", pattern: "vibe" } },
      { phone: "9999999994", displayName: "Speedy", avatarConfig: { color: "red", pattern: "fast" } },
      { phone: "9999999995", displayName: "Sunny", avatarConfig: { color: "yellow", pattern: "bright" } },
    ];

    const users = [];
    for (const player of testPlayers) {
      let user = await User.findOne({ where: { phone: player.phone } });
      if (user) {
        // Update existing user with new display name
        await user.update({ displayName: player.displayName });
        console.log(`Updated user: ${player.displayName}`);
      } else {
        // Create new user
        user = await User.create({
          phone: player.phone,
          displayName: player.displayName,
          avatarConfig: JSON.stringify(player.avatarConfig),
        });
        console.log(`Created user: ${player.displayName}`);
      }
      users.push(user);
    }

    // Create match participants with varying points
    const pointsScores = [250, 180, 150, 95, 50]; // Varying points for ranking
    const participants = [];

    for (let i = 0; i < users.length; i++) {
      const participant = await MatchParticipant.create({
        matchId: match.id,
        userId: users[i].id,
        venueId,
        totalPoints: pointsScores[i],
        round1Points: Math.floor(pointsScores[i] * 0.4),
        round2Points: Math.floor(pointsScores[i] * 0.3),
        round3Points: Math.floor(pointsScores[i] * 0.3),
        currentRound: 3,
        currentStreak: i % 3, // some with streaks
        bestStreak: Math.floor(Math.random() * 5) + 1,
        correctPredictions: Math.floor(pointsScores[i] / 25),
        totalPredictions: 8,
        boostsUsedRound: 0,
        allInUsed: false,
      });
      participants.push(participant);
      console.log(`Created participant: ${users[i].displayName} - ${pointsScores[i]} points`);
    }

    // Link some user predictions to create realistic answered data
    const predictions = await Prediction.findAll({
      where: { matchId: match.id },
      limit: 5,
    });

    if (predictions.length > 0) {
      for (let i = 0; i < users.length; i++) {
        for (let j = 0; j < Math.min(3, predictions.length); j++) {
          const pred = predictions[j];
          const selectedOption = pred.options?.[j % (pred.options?.length || 1)]?.key || "option_a";
          
          const userPred = await UserPrediction.findOne({
            where: {
              userId: users[i].id,
              predictionId: pred.id,
            },
          });

          if (!userPred) {
            await UserPrediction.create({
              userId: users[i].id,
              predictionId: pred.id,
              matchId: match.id,
              venueId,
              selectedOption,
              isCorrect: j % 2 === 0, // Alternate correct/incorrect for realism
              pointsEarned: j % 2 === 0 ? pred.options?.[j % (pred.options?.length || 1)]?.points || 25 : 0,
              boostType: "none",
            });
          }
        }
      }
      console.log("Seeded user predictions");
    }

    console.log("\n=== LEADERBOARD SEEDED ===");
    console.log(`Players: ${users.length}`);
    console.log(`Match: ${match.team1Short} vs ${match.team2Short}`);
    console.log(`\nLeaderboard (by totalPoints):`);
    for (let i = 0; i < users.length; i++) {
      console.log(`  ${i + 1}. ${users[i].displayName} - ${pointsScores[i]} points`);
    }

    process.exit(0);
  } catch (error) {
    console.error("Seed leaderboard error:", error);
    process.exit(1);
  }
}

seedLeaderboard();
