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

    // Real match from CricAPI: ERD vs WPR
    const match = await Match.create({
      externalId: "e18a6774-05fc-4382-822c-552105cd025e",
      team1: "North West Dragons",
      team2: "Western Province",
      team1Short: "ERD",
      team2Short: "WPR",
      team1Players: [
        "Nicky van den Bergh", "Raynard van Tonder", "Senuran Muthusamy",
        "Zakhele Qwabe", "Lesego Senokwane",
      ],
      team2Players: [
        "Tony de Zorzi", "Zubayr Hamza", "Kyle Verreynne",
        "George Linde", "Dane Paterson",
      ],
      startTime: new Date(),
      status: "live",
      currentInnings: 1,
      currentOver: 1,
      currentPhase: "innings1_powerplay",
      scoreData: {
        venue: "Senwes Park, Potchefstroom",
        series: "CSA Provincial One-Day Challenge 2026",
        team1Img: "https://h.cricapi.com/img/icon512.png",
        team2Img: "https://g.cricapi.com/iapi/104-637987555401464222.webp?w=48",
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
    const over1Preds = generatePerOverPredictions(match.id, 1, 1, "Nicky van den Bergh");
    for (const p of over1Preds) {
      await Prediction.create(p as any);
    }

    // Round 1 hot take
    const hotTake = generateHotTake(match.id, 1, match.team1Short, match.team2Short);
    if (hotTake) {
      await Prediction.create(hotTake as any);
    }

    console.log("\n=== LIVE MATCH SEED (Real CricAPI Data) ===");
    console.log(`Venue ID: ${venue.id}`);
    console.log(`Match ID: ${match.id}`);
    console.log(`Match: ERD vs WPR, CSA Provincial`);
    console.log(`Status: LIVE (Over 1, Innings 1)`);
    console.log(`Team logos from CricAPI: Yes`);
    console.log(`\nPlayer App: http://localhost:3000/?v=${venue.id}&m=${match.id}`);
    console.log(`Admin: http://localhost:3000/admin`);
    console.log(`TV: http://localhost:3000/tv?v=${venue.id}&m=${match.id}`);
    console.log(`\nOTP: 123456`);
    console.log(`Admin login: +919999999999 / demo123`);
    console.log(`\nAdvance over 1:`);
    console.log(`curl -X POST http://localhost:3001/api/admin/match/${match.id}/advance-over -H "Content-Type: application/json" -d '{"overNumber":1,"innings":1,"currentBatter":"Finn Allen","overResults":{"runs":14,"wickets":0,"sixes":1,"boundaries":2,"dots":2,"wides":0,"noballs":0,"lastBallRuns":4,"lastBallWicket":false,"firstBallBoundary":true}}'`);

    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
}

seed();
