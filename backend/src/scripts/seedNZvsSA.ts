import dotenv from "dotenv";
dotenv.config();

import { sequelize, Venue, Match } from "../models";
import bcrypt from "bcryptjs";
import {
  generatePreMatchPredictions,
  generatePerOverPredictions,
  generateHotTake,
} from "../services/predictionEngine";
import Prediction from "../models/Prediction";

async function seed() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database");

    await sequelize.sync({ force: true });
    console.log("Tables created");

    // Demo venue
    const hashedPassword = await bcrypt.hash("demo123", 10);
    const venue = await Venue.create({
      name: "The Cricket Cafe",
      ownerPhone: "+919999999999",
      ownerName: "Demo Owner",
      password: hashedPassword,
      latitude: 12.9716,
      longitude: 77.5946,
      radiusMeters: 500,
      rewardConfig: {
        roundReward: {
          top1: "Free drink of your choice",
          top2: "20% off your next order",
          top3: "Free fries or starter",
        },
        grandPrize: {
          top1: "Free meal for 2 (up to Rs 1000)",
          top2: "Free meal (up to Rs 500)",
          top3: "30% off total bill",
        },
      },
    });

    // NZ vs SA 3rd T20I — Sportmonks fixture ID 67087
    const match = await Match.create({
      externalId: "67087",
      team1: "New Zealand",
      team2: "South Africa",
      team1Short: "NZ",
      team2Short: "SA",
      team1Players: [
        "Finn Allen", "Devon Conway", "Kane Williamson",
        "Glenn Phillips", "Daryl Mitchell",
      ],
      team2Players: [
        "Tony de Zorzi", "Reeza Hendricks", "Aiden Markram",
        "Heinrich Klaasen", "David Miller",
      ],
      startTime: new Date("2026-03-20T06:15:00.000Z"),
      status: "live",
      currentInnings: 1,
      currentOver: 1,
      currentPhase: "innings1_powerplay",
      scoreData: {
        venue: "Seddon Park, Hamilton",
        series: "NZ vs SA 3rd T20I 2026",
        team1Img: "https://cdn.sportmonks.com/images/cricket/teams/10/42.png",
        team2Img: "https://cdn.sportmonks.com/images/cricket/teams/8/40.png",
        tossWonTeamId: 42,
        elected: "bowling",
      },
    });

    // Pre-match predictions
    const preMatchQuestions = generatePreMatchPredictions(
      match.id, match.team1, match.team2,
      match.team1Short, match.team2Short,
      match.team1Players, match.team2Players
    );
    for (const q of preMatchQuestions) {
      await Prediction.create(q as any);
    }

    // Over 1 predictions
    const over1Preds = generatePerOverPredictions(match.id, 1, 1, "Tony de Zorzi");
    for (const p of over1Preds) {
      await Prediction.create(p as any);
    }

    // Round 1 hot take
    const hotTake = generateHotTake(match.id, 1, match.team1Short, match.team2Short);
    if (hotTake) {
      await Prediction.create(hotTake as any);
    }

    console.log("\n=== NZ vs SA 3rd T20I — LIVE MATCH SEED ===");
    console.log(`Venue ID: ${venue.id}`);
    console.log(`Match ID: ${match.id}`);
    console.log(`Sportmonks Fixture ID: 67087`);
    console.log(`Match: NZ vs SA, 3rd T20I`);
    console.log(`Status: LIVE (polling Sportmonks every 30s)`);
    console.log(`\nPlayer App: http://localhost:3000/?v=${venue.id}&m=${match.id}`);
    console.log(`Admin: http://localhost:3000/admin`);
    console.log(`TV: http://localhost:3000/tv?v=${venue.id}&m=${match.id}`);
    console.log(`\nOTP: 123456`);
    console.log(`Admin login: +919999999999 / demo123`);

    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
}

seed();
