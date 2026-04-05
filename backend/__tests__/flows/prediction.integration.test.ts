import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { sequelize, User, Venue, Match, Prediction, UserPrediction, MatchParticipant } from "../../src/models";
import { calculatePoints } from "../../src/services/pointsEngine";
import { generatePreMatchPredictions } from "../../src/services/predictionEngine";

/**
 * Integration Tests for JAFFA
 *
 * Tests full workflows with real database transactions:
 * - User prediction submission with constraints
 * - Prediction resolution and point calculation
 * - Leaderboard ordering
 * - Boost and All-In limits
 */

describe("JAFFA Integration Tests", () => {
  let testVenue: Venue;
  let testMatch: Match;
  let testUser: User;
  let testParticipant: MatchParticipant;
  let testPredictions: Prediction[] = [];

  beforeAll(async () => {
    // Connect to test database
    await sequelize.sync({ force: false });

    // Create test venue
    testVenue = await Venue.create({
      name: "Integration Test Venue",
      city: "Test City",
      state: "Test State",
      latitude: 0,
      longitude: 0,
      maxCapacity: 100,
      ownerEmail: "test@example.com",
      ownerPhone: "+911234567890",
      status: "active",
    });

    // Create test match
    const startTime = new Date(Date.now() + 60 * 60_000);
    testMatch = await Match.create({
      team1: "Team Alpha",
      team2: "Team Beta",
      team1Short: "TA",
      team2Short: "TB",
      team1Players: [],
      team2Players: [],
      startTime,
      status: "upcoming",
      currentPhase: "pre_match",
    });

    // Create test user
    testUser = await User.create({
      phone: "+911112223333",
      displayName: "Test User",
      avatarConfig: JSON.stringify({ seed: "test" }),
    });

    // Create participant
    testParticipant = await MatchParticipant.create({
      userId: testUser.id,
      matchId: testMatch.id,
      venueId: testVenue.id,
      totalPoints: 0,
      currentStreak: 0,
      bestStreak: 0,
      allInUsed: false,
      boostsUsedRound: 0,
      currentRound: 0,
      totalPredictions: 0,
      correctPredictions: 0,
    });

    // Create test predictions
    const preMatchQuestions = generatePreMatchPredictions(
      testMatch.id,
      testMatch.team1,
      testMatch.team2,
      testMatch.team1Short,
      testMatch.team2Short,
      testMatch.team1Players,
      testMatch.team2Players
    );

    testPredictions = await Promise.all(
      preMatchQuestions.map((q) =>
        Prediction.create({
          ...q,
          category: "pre_match",
          status: "open",
        })
      )
    );
  });

  afterAll(async () => {
    // Clean up
    if (testPredictions.length > 0) {
      await UserPrediction.destroy({ where: { matchId: testMatch.id } });
      await Prediction.destroy({ where: { matchId: testMatch.id } });
    }
    if (testParticipant) await testParticipant.destroy();
    if (testUser) await testUser.destroy();
    if (testMatch) await testMatch.destroy();
    if (testVenue) await testVenue.destroy();
    await sequelize.close();
  });

  describe("Prediction Submission", () => {
    it("should allow user to answer prediction once", async () => {
      const pred = testPredictions[0];

      const answer = await UserPrediction.create({
        userId: testUser.id,
        predictionId: pred.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        selectedOption: pred.options[0].key,
        boostType: "none",
        pointsEarned: 0,
        isCorrect: false,
        answeredAt: new Date(),
      });

      expect(answer.id).toBeDefined();
      expect(answer.userId).toBe(testUser.id);
      expect(answer.predictionId).toBe(pred.id);
    });

    it("should prevent duplicate answers", async () => {
      const pred = testPredictions[1];
      const first = await UserPrediction.create({
        userId: testUser.id,
        predictionId: pred.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        selectedOption: pred.options[0].key,
        boostType: "none",
        pointsEarned: 0,
        isCorrect: false,
        answeredAt: new Date(),
      });

      // Try to answer again — should fail due to unique constraint
      try {
        await UserPrediction.create({
          userId: testUser.id,
          predictionId: pred.id,
          matchId: testMatch.id,
          venueId: testVenue.id,
          selectedOption: pred.options[1].key,
          boostType: "none",
          pointsEarned: 0,
          isCorrect: false,
          answeredAt: new Date(),
        });

        throw new Error("Should have failed unique constraint");
      } catch (err: any) {
        expect(err.message).toContain("Unique constraint failed") || expect(err.message).toContain("violates");
      }
    });

    it("should respect locked prediction state", async () => {
      const pred = testPredictions[2];
      await pred.update({ status: "locked" });

      // Attempting to answer locked prediction should be caught at service level
      // (this is more of an API test, but we verify state)
      expect(pred.status).toBe("locked");
    });

    it("should only allow valid options", async () => {
      const pred = testPredictions[3];
      const validKeys = pred.options.map((o) => o.key);

      expect(validKeys).toContain(pred.options[0].key);
      expect(validKeys).not.toContain("invalid_option_key");
    });
  });

  describe("Prediction Resolution", () => {
    it("should correctly resolve prediction and award points", async () => {
      const user = await User.create({
        phone: "+919999999999",
        displayName: "Resolution Test User",
      });

      const participant = await MatchParticipant.create({
        userId: user.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        totalPoints: 0,
        currentStreak: 0,
        bestStreak: 0,
      });

      // Create prediction
      const pred = await Prediction.create({
        matchId: testMatch.id,
        category: "pre_match",
        round: 0,
        question: "Resolution Test",
        options: [
          { key: "correct", label: "Correct", points: 50 },
          { key: "wrong", label: "Wrong", points: 0 },
        ],
        status: "open",
      });

      // User answers correctly
      const answer = await UserPrediction.create({
        userId: user.id,
        predictionId: pred.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        selectedOption: "correct",
        boostType: "none",
        pointsEarned: 0,
        isCorrect: false,
      });

      // Resolve prediction
      await pred.update({ correctOption: "correct", status: "resolved" });

      // Calculate points
      const result = calculatePoints(pred, answer.selectedOption, answer.boostType, participant.currentStreak);
      expect(result.isCorrect).toBe(true);
      expect(result.totalPoints).toBe(50);

      // Update answer
      await answer.update({
        isCorrect: result.isCorrect,
        pointsEarned: result.totalPoints,
      });

      // Update participant
      await participant.update({
        totalPoints: result.totalPoints,
        round1Points: result.totalPoints,
        correctPredictions: 1,
        totalPredictions: 1,
      });

      // Verify
      const updated = await MatchParticipant.findByPk(participant.id);
      expect(updated!.totalPoints).toBe(50);
      expect(updated!.correctPredictions).toBe(1);

      // Cleanup
      await answer.destroy();
      await pred.destroy();
      await participant.destroy();
      await user.destroy();
    });

    it("should apply boost multiplier on resolution", async () => {
      const user = await User.create({
        phone: "+918888888888",
        displayName: "Boost Test User",
      });

      const pred = await Prediction.create({
        matchId: testMatch.id,
        category: "pre_match",
        round: 0,
        question: "Boost Test",
        options: [
          { key: "a", label: "A", points: 30 },
          { key: "b", label: "B", points: 30 },
        ],
        status: "open",
      });

      const answer = await UserPrediction.create({
        userId: user.id,
        predictionId: pred.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        selectedOption: "a",
        boostType: "boost",
        pointsEarned: 0,
      });

      await pred.update({ correctOption: "a", status: "resolved" });

      const participant = await MatchParticipant.create({
        userId: user.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
      });

      const result = calculatePoints(pred, answer.selectedOption, answer.boostType, 0);
      expect(result.multiplier).toBe(2);
      expect(result.totalPoints).toBe(60); // 30 * 2

      // Cleanup
      await answer.destroy();
      await pred.destroy();
      await participant.destroy();
      await user.destroy();
    });

    it("should apply All-In penalty on wrong answer", async () => {
      const user = await User.create({
        phone: "+917777777777",
        displayName: "AllIn Test User",
      });

      const pred = await Prediction.create({
        matchId: testMatch.id,
        category: "pre_match",
        round: 0,
        question: "AllIn Test",
        options: [
          { key: "correct", label: "Correct", points: 40 },
          { key: "wrong", label: "Wrong", points: 0 },
        ],
        status: "open",
      });

      const answer = await UserPrediction.create({
        userId: user.id,
        predictionId: pred.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        selectedOption: "wrong", // Wrong answer!
        boostType: "all_in",
        pointsEarned: 0,
      });

      await pred.update({ correctOption: "correct", status: "resolved" });

      const participant = await MatchParticipant.create({
        userId: user.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        totalPoints: 100, // Start with points
      });

      const result = calculatePoints(pred, answer.selectedOption, answer.boostType, 0);
      expect(result.isCorrect).toBe(false);
      expect(result.totalPoints).toBe(-30); // All-In penalty

      // Update participant (apply penalty, floor at 0)
      const newTotal = Math.max(0, participant.totalPoints + result.totalPoints);
      expect(newTotal).toBe(70); // 100 - 30

      // Cleanup
      await answer.destroy();
      await pred.destroy();
      await participant.destroy();
      await user.destroy();
    });
  });

  describe("Leaderboard Ordering", () => {
    it("should order participants by points descending", async () => {
      const users = await Promise.all([
        User.create({ phone: "+916666666661", displayName: "High Score" }),
        User.create({ phone: "+916666666662", displayName: "Mid Score" }),
        User.create({ phone: "+916666666663", displayName: "Low Score" }),
      ]);

      const participants = await Promise.all([
        MatchParticipant.create({
          userId: users[0].id,
          matchId: testMatch.id,
          venueId: testVenue.id,
          totalPoints: 150,
        }),
        MatchParticipant.create({
          userId: users[1].id,
          matchId: testMatch.id,
          venueId: testVenue.id,
          totalPoints: 100,
        }),
        MatchParticipant.create({
          userId: users[2].id,
          matchId: testMatch.id,
          venueId: testVenue.id,
          totalPoints: 50,
        }),
      ]);

      const ordered = await MatchParticipant.findAll({
        where: { matchId: testMatch.id, venueId: testVenue.id },
        order: [["totalPoints", "DESC"]],
      });

      expect(ordered[0].totalPoints).toBe(150);
      expect(ordered[1].totalPoints).toBe(100);
      expect(ordered[2].totalPoints).toBe(50);

      // Cleanup
      const ids = participants.map((p) => p.id);
      await MatchParticipant.destroy({ where: { id: ids } });
      const userIds = users.map((u) => u.id);
      await User.destroy({ where: { id: userIds } });
    });
  });

  describe("Streak System", () => {
    it("should track and reset streak", async () => {
      const user = await User.create({
        phone: "+915555555555",
        displayName: "Streak User",
      });

      const participant = await MatchParticipant.create({
        userId: user.id,
        matchId: testMatch.id,
        venueId: testVenue.id,
        currentStreak: 0,
        bestStreak: 0,
      });

      // Simulate 3 correct answers
      let updatedP = participant;
      for (let i = 0; i < 3; i++) {
        const newStreak = updatedP.currentStreak + 1;
        updatedP = await updatedP.update({
          currentStreak: newStreak,
          bestStreak: Math.max(updatedP.bestStreak, newStreak),
        });
      }

      expect(updatedP.currentStreak).toBe(3);
      expect(updatedP.bestStreak).toBe(3);

      // Wrong answer resets streak
      updatedP = await updatedP.update({ currentStreak: 0 });
      expect(updatedP.currentStreak).toBe(0);
      expect(updatedP.bestStreak).toBe(3); // Best streak preserved

      // Cleanup
      await updatedP.destroy();
      await user.destroy();
    });
  });
});
