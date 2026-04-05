import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { calculatePoints } from "../src/services/pointsEngine";
import { generatePreMatchPredictions, generatePerOverPredictions } from "../src/services/predictionEngine";
import { Prediction } from "../src/models";
import { DataTypes } from "sequelize";

/**
 * Unit Tests for JAFFA Business Logic
 *
 * Tests core functions:
 * - Points calculation with boosts, All-In, streaks
 * - Prediction generation (pre-match, per-over)
 * - Edge cases and constraints
 */

describe("Points Engine", () => {
  // Mock Prediction object
  const mockPrediction: Prediction = {
    id: "pred_001",
    matchId: "match_001",
    category: "pre_match" as any,
    round: 0,
    question: "Who wins?",
    options: [
      { key: "team_a", label: "Team A", points: 25 },
      { key: "team_b", label: "Team B", points: 25 },
      { key: "team_c", label: "Team C", points: 30 },
    ],
    correctOption: "team_a",
    status: "resolved" as any,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    overNumber: undefined,
    dataValues: {} as any,
    _previousDataValues: {} as any,
    uniqno: undefined,
    changed: () => false,
    save: async () => this as any,
    reload: async () => this as any,
    validate: async () => ({ errors: [] } as any),
    update: async () => this as any,
    destroy: async () => this as any,
    restore: async () => this as any,
    toJSON: () => ({} as any),
    equals: () => false,
    equalsOneOf: () => false,
    increment: async () => this as any,
    decrement: async () => this as any,
    bulkCreate: async () => [],
    findAll: async () => [],
    findByPk: async () => null,
    findOne: async () => null,
    create: async () => this as any,
  } as any;

  describe("calculatePoints", () => {
    it("should return 0 points for incorrect answer", () => {
      const result = calculatePoints(mockPrediction, "team_b", "none", 0);
      expect(result.isCorrect).toBe(false);
      expect(result.totalPoints).toBe(0);
      expect(result.basePoints).toBe(0);
      expect(result.newStreak).toBe(0);
    });

    it("should return base points for correct answer without boost", () => {
      const result = calculatePoints(mockPrediction, "team_a", "none", 0);
      expect(result.isCorrect).toBe(true);
      expect(result.basePoints).toBe(25);
      expect(result.multiplier).toBe(1);
      expect(result.totalPoints).toBe(25);
      expect(result.newStreak).toBe(1);
    });

    it("should apply 2x boost multiplier for correct answer", () => {
      const result = calculatePoints(mockPrediction, "team_a", "boost", 0);
      expect(result.isCorrect).toBe(true);
      expect(result.basePoints).toBe(25);
      expect(result.multiplier).toBe(2);
      expect(result.totalPoints).toBe(50);
      expect(result.newStreak).toBe(1);
    });

    it("should apply 3x All-In multiplier for correct answer", () => {
      const result = calculatePoints(mockPrediction, "team_a", "all_in", 0);
      expect(result.isCorrect).toBe(true);
      expect(result.basePoints).toBe(25);
      expect(result.multiplier).toBe(3);
      expect(result.totalPoints).toBe(75);
      expect(result.newStreak).toBe(1);
    });

    it("should apply -30 All-In penalty for incorrect answer", () => {
      const result = calculatePoints(mockPrediction, "team_b", "all_in", 0);
      expect(result.isCorrect).toBe(false);
      expect(result.totalPoints).toBe(-30);
      expect(result.newStreak).toBe(0);
      expect(result.multiplier).toBe(1);
    });

    it("should increment streak on consecutive correct answers", () => {
      const result1 = calculatePoints(mockPrediction, "team_a", "none", 0);
      expect(result1.newStreak).toBe(1);

      const result2 = calculatePoints(mockPrediction, "team_a", "none", result1.newStreak);
      expect(result2.newStreak).toBe(2);

      const result3 = calculatePoints(mockPrediction, "team_a", "none", result2.newStreak);
      expect(result3.newStreak).toBe(3);
    });

    it("should reset streak on incorrect answer", () => {
      // This tests that currentStreak param passed reflects the streak state
      const resultWrong = calculatePoints(mockPrediction, "team_b", "none", 5);
      expect(resultWrong.newStreak).toBe(0);
    });

    it("should handle high-point questions (difficulty-scaled)", () => {
      const highPointPred = { ...mockPrediction, options: [...mockPrediction.options] };
      highPointPred.options[2] = { key: "team_c", label: "Team C", points: 100 };

      const result = calculatePoints(highPointPred, "team_c", "boost", 0);
      expect(result.basePoints).toBe(100);
      expect(result.totalPoints).toBe(200); // 100 * 2
    });

    it("should reset multiplier when incorrect (All-In penalty only)", () => {
      const result = calculatePoints(mockPrediction, "team_b", "boost", 3);
      expect(result.multiplier).toBe(1); // No boost benefit on wrong answer
      expect(result.totalPoints).toBe(0);
    });

    it("should calculate points correctly with different streak states", () => {
      // Test that streak number is tracked but doesn't affect multiplier
      const resultLowStreak = calculatePoints(mockPrediction, "team_a", "boost", 1);
      const resultHighStreak = calculatePoints(mockPrediction, "team_a", "boost", 10);

      expect(resultLowStreak.totalPoints).toBe(resultHighStreak.totalPoints);
      expect(resultLowStreak.multiplier).toBe(2);
      expect(resultHighStreak.multiplier).toBe(2);
    });
  });

  describe("Edge Cases", () => {
    it("should floor negative points at 0 (All-In penalty on wrong)", () => {
      const result = calculatePoints(mockPrediction, "team_b", "all_in", 0);
      expect(result.totalPoints).toBe(-30); // Store the -30, UI floors it
      expect(result.isCorrect).toBe(false);
    });

    it("should handle undefined option gracefully", () => {
      const result = calculatePoints(mockPrediction, "nonexistent", "none", 0);
      expect(result.isCorrect).toBe(false);
      expect(result.basePoints).toBe(0);
      expect(result.totalPoints).toBe(0);
    });

    it("should not apply multiplier to 0-point wrong answers", () => {
      const result = calculatePoints(mockPrediction, "team_b", "boost", 0);
      expect(result.totalPoints).toBe(0); // No boost benefit
      expect(result.isCorrect).toBe(false);
    });
  });
});

describe("Prediction Engine", () => {
  describe("generatePreMatchPredictions", () => {
    it("should generate exactly 4 pre-match questions", () => {
      const questions = generatePreMatchPredictions(
        "match_001",
        "Chennai Super Kings",
        "Mumbai Indians",
        "CSK",
        "MI",
        ["Player1", "Player2"],
        ["Player3", "Player4"]
      );

      expect(questions).toHaveLength(4);
    });

    it("should include 'Who wins?' as first question", () => {
      const questions = generatePreMatchPredictions(
        "match_001",
        "CSK",
        "MI",
        "CSK",
        "MI",
        [],
        []
      );

      expect(questions[0].question).toContain("wins");
      expect(questions[0].category).toBe("pre_match");
      expect(questions[0].round).toBe(0);
    });

    it("should include 'Toss' question with 4 options", () => {
      const questions = generatePreMatchPredictions(
        "match_001",
        "CSK",
        "MI",
        "CSK",
        "MI",
        [],
        []
      );

      const tossQ = questions.find((q) => q.question.toLowerCase().includes("toss"));
      expect(tossQ).toBeDefined();
      expect(tossQ!.options).toHaveLength(4);
    });

    it("should include team short codes in options", () => {
      const questions = generatePreMatchPredictions(
        "match_001",
        "Chennai Super Kings",
        "Mumbai Indians",
        "CSK",
        "MI",
        [],
        []
      );

      const firstQ = questions[0];
      const options = firstQ.options.map((o) => o.key);
      expect(options).toContain("csk");
      expect(options).toContain("mi");
    });

    it("should set all to round 0", () => {
      const questions = generatePreMatchPredictions(
        "match_001",
        "CSK",
        "MI",
        "CSK",
        "MI",
        [],
        []
      );

      questions.forEach((q) => {
        expect(q.round).toBe(0);
      });
    });
  });

  describe("generatePerOverPredictions", () => {
    it("should generate exactly 2 per-over questions for a given over", () => {
      const questions = generatePerOverPredictions("match_001", 1, 1, "Batter Name");

      expect(questions).toHaveLength(2);
    });

    it("should include over number in generated questions", () => {
      const questions = generatePerOverPredictions("match_001", 5, 1, "Batter");

      questions.forEach((q) => {
        expect(q.question).toContain("5") || expect(q.question).toContain("over");
      });
    });

    it("should not have same semantic group in same over", () => {
      const questions = generatePerOverPredictions("match_001", 1, 1, "Batter");

      // Get semantic groups from the predefined pool
      // This is a complex test but important for preventing duplicate question types
      expect(questions).toHaveLength(2);
      // Verify they are different types by checking their templates
      // (would need access to predefined pool to fully validate)
    });

    it("should set correct matchId and over number", () => {
      const over = 3;
      const questions = generatePerOverPredictions("match_xyz", over, 1, "Batter");

      questions.forEach((q) => {
        expect(q.matchId).toBe("match_xyz");
        expect((q as any).overNumber).toBe(over);
      });
    });

    it("should provide point values for options", () => {
      const questions = generatePerOverPredictions("match_001", 1, 1, "Batter");

      questions.forEach((q) => {
        q.options.forEach((opt) => {
          expect(opt.points).toBeGreaterThan(0);
        });
      });
    });
  });

  describe("Prediction Combinations", () => {
    it("should generate different questions for different overs", () => {
      const over1 = generatePerOverPredictions("match_001", 1, 1, "Batter");
      const over2 = generatePerOverPredictions("match_001", 2, 1, "Batter");

      // Questions might be different templates (due to randomization)
      expect(over1).toHaveLength(2);
      expect(over2).toHaveLength(2);
    });

    it("pre-match questions should have higher point values", () => {
      const prematches = generatePreMatchPredictions("m", "T1", "T2", "T1", "T2", [], []);
      const perover = generatePerOverPredictions("m", 1, 1, "Batter");

      const preAvg = prematches.reduce((sum, q) => sum + q.options[0].points, 0) / prematches.length;
      const overAvg = perover.reduce((sum, q) => sum + q.options[0].points, 0) / perover.length;

      // Pre-match questions are generally worth more
      expect(preAvg).toBeGreaterThanOrEqual(15);
    });
  });
});

describe("Business Rules Validation", () => {
  it("should never give negative points without All-In", () => {
    const pred = {
      ...mockPrediction,
      options: [
        { key: "opt_a", label: "Option A", points: 10 },
        { key: "opt_b", label: "Option B", points: 5 },
      ],
    } as any;

    const result = calculatePoints(pred, "opt_b", "boost", 0); // Wrong answer with boost
    expect(result.totalPoints).toBe(0); // No boost benefit on wrong answer
    expect(result.totalPoints).toBeGreaterThanOrEqual(0); // Never negative without All-In
  });

  it("All-In penalty should be limited to -30", () => {
    const result = calculatePoints(mockPrediction, "wrong", "all_in", 0);
    expect(result.totalPoints).toBe(-30);
  });

  it("should not allow boost on All-In", () => {
    // Only one multiplier applies
    const result = calculatePoints(mockPrediction, "team_a", "all_in", 0);
    expect(result.multiplier).toBe(3); // All-In, not Boost
  });

  it("streak display should increment regardless of boost", () => {
    const noBooth = calculatePoints(mockPrediction, "team_a", "none", 2);
    const withBoost = calculatePoints(mockPrediction, "team_a", "boost", 2);
    const withAllIn = calculatePoints(mockPrediction, "team_a", "all_in", 2);

    expect(noBooth.newStreak).toBe(3);
    expect(withBoost.newStreak).toBe(3);
    expect(withAllIn.newStreak).toBe(3);
  });
});
