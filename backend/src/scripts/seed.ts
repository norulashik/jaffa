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
    console.log("Demo venue created:", venue.id);

    const today = new Date();
    today.setHours(19, 30, 0, 0);

    const match = await Match.create({
      team1: "Chennai Super Kings",
      team2: "Royal Challengers Bengaluru",
      team1Short: "CSK",
      team2Short: "RCB",
      team1Players: ["MS Dhoni", "Ruturaj Gaikwad", "Devon Conway", "Shivam Dube", "Ravindra Jadeja"],
      team2Players: ["Virat Kohli", "Faf du Plessis", "Glenn Maxwell", "Dinesh Karthik", "Mohammed Siraj"],
      startTime: today,
      // Match is already LIVE for demo — users join mid-match
      status: "live",
      currentInnings: 1,
      currentOver: 1,
      currentPhase: "innings1_powerplay",
    });
    console.log("Demo match created:", match.id);

    // Generate pre-match predictions
    const preMatchQuestions = generatePreMatchPredictions(
      match.id, match.team1, match.team2,
      match.team1Short, match.team2Short,
      match.team1Players, match.team2Players
    );
    for (const q of preMatchQuestions) {
      await Prediction.create(q as any);
    }
    console.log("Pre-match predictions created:", preMatchQuestions.length);

    // Generate Over 1 predictions (so they're ready when user finishes pre-match cards)
    const over1Preds = generatePerOverPredictions(match.id, 1, 1, "Ruturaj Gaikwad");
    for (const p of over1Preds) {
      await Prediction.create(p as any);
    }
    console.log("Over 1 predictions created:", over1Preds.length);

    // Generate Round 1 hot take
    const hotTake = generateHotTake(match.id, 1, match.team1Short, match.team2Short);
    if (hotTake) {
      await Prediction.create(hotTake as any);
      console.log("Round 1 hot take created");
    }

    console.log("\n=== SEED DATA CREATED ===");
    console.log(`Venue ID: ${venue.id}`);
    console.log(`Match ID: ${match.id}`);
    console.log(`Match status: LIVE (Over 1, Innings 1)`);
    console.log(`\nVenue Admin Login:`);
    console.log(`  Phone: +919999999999`);
    console.log(`  Password: demo123`);
    console.log(`\nUser App URL: http://localhost:3000/?v=${venue.id}&m=${match.id}`);
    console.log(`Admin URL: http://localhost:3000/admin`);
    console.log(`TV URL: http://localhost:3000/tv?v=${venue.id}&m=${match.id}`);
    console.log(`\nOTP for testing: 123456 (mock mode)`);
    console.log(`\nTo advance overs after users answer:`);
    console.log(`curl -X POST http://localhost:3001/api/admin/match/${match.id}/advance-over -H "Content-Type: application/json" -d '{"overNumber":1,"innings":1,"currentBatter":"Devon Conway","overResults":{"runs":8,"wickets":0,"sixes":1,"boundaries":1,"dots":3,"wides":0,"noballs":0,"lastBallRuns":1,"firstBallBoundary":false}}'`);

    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
}

seed();
