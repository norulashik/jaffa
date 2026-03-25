import { Router, Response } from "express";
import { Match, Prediction, MatchParticipant, Venue, User, Reward } from "../models";
import { authenticateVenue, AuthRequest } from "../middleware/auth";
import {
  generatePreMatchPredictions,
  generatePerOverPredictions,
  generateHotTake,
  generateRivalryCalls,
  getCurrentRound,
} from "../services/predictionEngine";
import { resolvePrediction, generateRoundRewards } from "../services/pointsEngine";
import { fetchTodayFixtures, fetchSportsmonkLiveScores, resolveOverPredictionFromStats } from "../services/sportsmonkApi";

const router = Router();

// Create a match (admin/dev endpoint)
router.post("/match", async (req: any, res: Response): Promise<void> => {
  try {
    const { team1, team2, team1Short, team2Short, team1Players, team2Players, startTime } = req.body;

    const match = await Match.create({
      team1,
      team2,
      team1Short,
      team2Short,
      team1Players: team1Players || [],
      team2Players: team2Players || [],
      startTime: new Date(startTime),
    });

    // Auto-generate pre-match predictions
    const preMatchQuestions = generatePreMatchPredictions(
      match.id,
      team1,
      team2,
      team1Short,
      team2Short,
      team1Players || [],
      team2Players || []
    );

    for (const q of preMatchQuestions) {
      await Prediction.create(q as any);
    }

    res.status(201).json({ match, predictionsGenerated: preMatchQuestions.length });
  } catch (error) {
    console.error("Create match error:", error);
    res.status(500).json({ error: "Failed to create match" });
  }
});

// Start match — generates Over 1 predictions so users can answer during the first over
router.post("/match/:matchId/start", async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { currentBatter } = req.body;

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const io = req.app.get("io");

    await match.update({
      status: "live",
      currentOver: 1,
      currentInnings: 1,
      currentPhase: "innings1_powerplay",
    });

    // Generate Over 1 predictions (locked when 1st ball is bowled)
    const round = 1;
    const overPreds = generatePerOverPredictions(matchId, 1, round, currentBatter);
    for (const p of overPreds) {
      await Prediction.create(p as any);
    }

    // Generate Round 1 hot take
    const hotTakeExpiresAt = new Date(Date.now() + 120_000);
    const hotTake = generateHotTake(matchId, round, match.team1Short, match.team2Short);
    if (hotTake) {
      await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
    }

    io.emit("newPrediction", { matchId, type: "per_over", overNumber: 1, round });
    io.emit("matchStarted", { matchId });

    res.json({
      message: "Match started! Over 1 predictions are live.",
      predictionsGenerated: overPreds.length + (hotTake ? 1 : 0),
      currentPhase: "innings1_powerplay",
    });
  } catch (error) {
    console.error("Start match error:", error);
    res.status(500).json({ error: "Failed to start match" });
  }
});

// Advance match state — called when an over is COMPLETED
// Resolves current over predictions, generates next over predictions
router.post("/match/:matchId/advance-over", async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { overNumber, innings, overResults, currentBatter } = req.body;

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const io = req.app.get("io");
    const round = getCurrentRound(innings, overNumber);

    const nextOver = overNumber + 1;

    // Update match state — phase reflects the NEXT over being bowled, not the completed one
    const newPhase = innings === 1
      ? nextOver <= 6 ? "innings1_powerplay" : nextOver <= 15 ? "innings1_middle" : "innings1_death"
      : nextOver <= 6 ? "innings2_powerplay" : nextOver <= 15 ? "innings2_middle" : "innings2_death";
    await match.update({
      status: "live",
      currentOver: nextOver,
      currentInnings: innings,
      currentPhase: newPhase,
      scoreData: {
        ...match.scoreData,
        [`innings${innings}_over${overNumber}`]: overResults,
      },
    });

    // Resolve per-over predictions for this over (filter by round to avoid cross-innings collision)
    const overPredictions = await Prediction.findAll({
      where: { matchId, overNumber, round, category: "per_over" },
    });

    // Lock & resolve predictions for the completed over
    for (const pred of overPredictions) {
      if (pred.status === "open") await pred.update({ status: "locked" });
    }
    for (const pred of overPredictions) {
      const correctOption = resolveOverPredictionFromStats(pred, overResults as any);
      if (correctOption) {
        await resolvePrediction(pred, correctOption, io);
      } else {
        console.warn(`[Admin] Could not resolve prediction "${pred.question}" (id=${pred.id}) — no matching rule`);
      }
    }

    // Lock next over's predictions (users were answering these during the completed over)
    const nextOverPreds = await Prediction.findAll({
      where: { matchId, overNumber: nextOver, category: "per_over", status: "open" },
    });
    for (const pred of nextOverPreds) {
      await pred.update({ status: "locked" });
    }
    if (nextOverPreds.length > 0) {
      io.emit("predictionsLocked", { matchId, overNumber: nextOver });
    }

    // Generate next over's predictions
    const nextRound = getCurrentRound(innings, nextOver);

    // Check if round changed — generate hot take + round rewards
    const prevRound = getCurrentRound(innings, overNumber);
    if (nextRound !== prevRound && prevRound > 0) {
      // End of round — generate rewards
      const venues = await MatchParticipant.findAll({
        where: { matchId },
        attributes: ["venueId"],
        group: ["venueId"],
      });

      for (const v of venues) {
        // Reset boosts for new round
        await MatchParticipant.update(
          { boostsUsedRound: 0, currentRound: nextRound },
          { where: { matchId, venueId: v.venueId } }
        );

        await generateRoundRewards(matchId, v.venueId, prevRound, io);
      }

      // Generate hot take for new round (with dedup check)
      const existingHotTake = await Prediction.findOne({
        where: { matchId, category: "hot_take", round: nextRound },
      });
      if (!existingHotTake) {
        const roundHotTakeExpiresAt = new Date(Date.now() + 120_000);
        const hotTake = generateHotTake(matchId, nextRound, match.team1Short, match.team2Short);
        if (hotTake) {
          await Prediction.create({ ...hotTake, expiresAt: roundHotTakeExpiresAt } as any);
          io.emit("newPrediction", { matchId, type: "hot_take", round: nextRound });
        }
      }
    }

    // Generate per-over predictions TWO overs ahead (to be answered during the next over)
    const twoAhead = nextOver + 1;
    const twoAheadRound = getCurrentRound(innings, twoAhead);
    if (twoAhead <= 20) {
      // Sum total wickets from all stored over results for this innings
      const sd = match.scoreData as Record<string, any> || {};
      let totalWickets = 0;
      let totalScore = 0;
      for (let ov = 1; ov <= overNumber; ov++) {
        const ovData = sd[`innings${innings}_over${ov}`];
        if (ovData) {
          totalWickets += ovData.wickets || 0;
          totalScore += ovData.runs || 0;
        }
      }
      const isAllOut = totalWickets >= 10;

      // For 2nd innings, check if target is chased using innings1Final or Sportsmonk data
      const inn1Final = sd.innings1Final || sd.innings1;
      const inn1Score = inn1Final?.runs ?? inn1Final?.score ?? 0;
      const targetChased = innings === 2 && inn1Score > 0 && totalScore >= (inn1Score + 1);

      if (!isAllOut && !targetChased) {
        // Deduplication: check if predictions for this over+round already exist
        const existingPreds = await Prediction.findAll({
          where: { matchId, overNumber: twoAhead, round: twoAheadRound, category: "per_over" },
        });

        if (existingPreds.length === 0) {
          const newPredictions = generatePerOverPredictions(matchId, twoAhead, twoAheadRound, currentBatter);
          for (const p of newPredictions) {
            await Prediction.create(p as any);
          }
          io.emit("newPrediction", { matchId, type: "per_over", overNumber: twoAhead, round: twoAheadRound });
        }
      }
    }

    res.json({
      message: `Over ${overNumber} completed`,
      resolvedPredictions: overPredictions.length,
      currentPhase: newPhase,
      nextRound,
    });
  } catch (error) {
    console.error("Advance over error:", error);
    res.status(500).json({ error: "Failed to advance over" });
  }
});

// Resolve a specific prediction manually
router.post("/prediction/:predictionId/resolve", async (req: any, res: Response): Promise<void> => {
  try {
    const { predictionId } = req.params;
    const { correctOption } = req.body;

    const prediction = await Prediction.findByPk(predictionId);
    if (!prediction) { res.status(404).json({ error: "Prediction not found" }); return; }

    const io = req.app.get("io");
    await resolvePrediction(prediction, correctOption, io);

    res.json({ message: "Prediction resolved" });
  } catch (error) {
    console.error("Resolve prediction error:", error);
    res.status(500).json({ error: "Failed to resolve prediction" });
  }
});

// Start innings break
router.post("/match/:matchId/innings-break", async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { team1Score, team1Wickets, target } = req.body;

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const io = req.app.get("io");

    await match.update({
      currentPhase: "innings_break",
      currentInnings: 2,
      scoreData: {
        ...match.scoreData,
        innings1Final: { runs: team1Score, wickets: team1Wickets },
        target,
      },
    });

    // Determine chasing team from scoreData (who batted first is in innings1)
    // Fallback to team2 if scoreData not yet populated
    const scoreData = match.scoreData as any;
    const innings1TeamShort = scoreData?.innings1?.teamShort;
    const chasingTeamShort = innings1TeamShort
      ? (innings1TeamShort === match.team1Short ? match.team2Short : match.team1Short)
      : match.team2Short;
    const chasingTeamPlayers = innings1TeamShort
      ? (innings1TeamShort === match.team1Short ? match.team2Players : match.team1Players)
      : match.team2Players;

    // Generate rivalry calls for second innings
    const rivalryCalls = generateRivalryCalls(
      matchId,
      target,
      chasingTeamShort,
      chasingTeamPlayers
    );

    const rivalryExpiresAt = new Date(Date.now() + 120_000);
    for (const rc of rivalryCalls) {
      await Prediction.create({ ...rc, expiresAt: rivalryExpiresAt } as any);
    }

    // Generate round 3 rewards
    const venues = await MatchParticipant.findAll({
      where: { matchId },
      attributes: ["venueId"],
      group: ["venueId"],
    });

    for (const v of venues) {
      await generateRoundRewards(matchId, v.venueId, 3, io);
    }

    // Generate Over 1 (2nd innings) per-over predictions — locked when 1st ball of innings 2 is bowled
    const inn2Round = getCurrentRound(2, 1); // = 4
    const inn2OverPreds = generatePerOverPredictions(matchId, 1, inn2Round);
    for (const p of inn2OverPreds) {
      await Prediction.create(p as any);
    }

    // Generate Round 4 hot take (with dedup check)
    const existingHotTake = await Prediction.findOne({
      where: { matchId, category: "hot_take", round: inn2Round },
    });
    if (!existingHotTake) {
      const hotTakeExpiresAt = new Date(Date.now() + 120_000);
      const hotTake = generateHotTake(matchId, inn2Round, match.team1Short, match.team2Short);
      if (hotTake) {
        await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
      }
    }

    io.emit("newPrediction", { matchId, type: "per_over", overNumber: 1, round: inn2Round });
    io.emit("inningsBreak", { matchId, target, team1Score, team1Wickets });

    res.json({ message: "Innings break started", rivalryCallsGenerated: rivalryCalls.length, inn2OverPreds: inn2OverPreds.length });
  } catch (error) {
    console.error("Innings break error:", error);
    res.status(500).json({ error: "Failed to start innings break" });
  }
});

// End match
router.post("/match/:matchId/end", async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { winner, playerOfMatch } = req.body;

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const io = req.app.get("io");

    await match.update({
      status: "completed",
      currentPhase: "completed",
      scoreData: { ...match.scoreData, winner, playerOfMatch },
    });

    // Resolve any remaining open predictions
    const openPreds = await Prediction.findAll({
      where: { matchId, status: "open" },
    });
    for (const pred of openPreds) {
      await pred.update({ status: "resolved" });
    }

    // Generate grand prize for all venues
    const venues = await MatchParticipant.findAll({
      where: { matchId },
      attributes: ["venueId"],
      group: ["venueId"],
    });

    for (const v of venues) {
      // Final round rewards
      await generateRoundRewards(matchId, v.venueId, 6, io);
      // Grand prize (round 0)
      await generateRoundRewards(matchId, v.venueId, 0, io);
    }

    io.emit("matchEnd", { matchId, winner, playerOfMatch });

    res.json({ message: "Match ended" });
  } catch (error) {
    console.error("End match error:", error);
    res.status(500).json({ error: "Failed to end match" });
  }
});

// Venue dashboard stats
router.get("/venue/stats", authenticateVenue, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.venueId!;
    const { matchId } = req.query;

    const matchIdStr = matchId as string | undefined;
    const where: any = { venueId };
    if (matchIdStr) where.matchId = matchIdStr;

    const totalPlayers = await MatchParticipant.count({ where });
    const totalRewards = await Reward.count({ where: { venueId, ...(matchIdStr ? { matchId: matchIdStr } : {}) } as any });
    const redeemedRewards = await Reward.count({
      where: { venueId, status: "redeemed", ...(matchIdStr ? { matchId: matchIdStr } : {}) } as any,
    });

    const participants = await MatchParticipant.findAll({
      where,
      include: [{ model: User, as: "user", attributes: ["displayName"] }],
      order: [["totalPoints", "DESC"]],
      limit: 10,
    });

    res.json({
      totalPlayers,
      totalRewards,
      redeemedRewards,
      topPlayers: participants.map((p, i) => ({
        rank: i + 1,
        displayName: (p as unknown as { user: { displayName: string } }).user?.displayName,
        totalPoints: p.totalPoints,
        accuracy: p.totalPredictions > 0
          ? Math.round((p.correctPredictions / p.totalPredictions) * 100)
          : 0,
      })),
    });
  } catch (error) {
    console.error("Venue stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// ========== SPORTSMONK API ENDPOINTS ==========

// Fetch today's fixtures from Sportsmonk
router.get("/cricket/fixtures", async (_req: any, res: Response): Promise<void> => {
  try {
    const fixtures = await fetchTodayFixtures();
    res.json({ total: fixtures.length, fixtures });
  } catch (error) {
    console.error("Fetch fixtures error:", error);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

// Fetch live scores from Sportsmonk
router.get("/cricket/live", async (_req: any, res: Response): Promise<void> => {
  try {
    const scores = await fetchSportsmonkLiveScores();
    res.json({ total: scores.length, scores });
  } catch (error) {
    console.error("Fetch live scores error:", error);
    res.status(500).json({ error: "Failed to fetch live scores" });
  }
});

// Import a Sportsmonk fixture into our database
router.post("/cricket/import/:fixtureId", async (req: any, res: Response): Promise<void> => {
  try {
    const fixtureId = req.params.fixtureId as string;
    const { team1Players, team2Players } = req.body;

    // Fetch fixture details from Sportsmonk
    const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
    const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

    const fixtureRes = await fetch(`${API_BASE}/fixtures/${fixtureId}?api_token=${API_TOKEN}`);
    const fixtureData: any = await fixtureRes.json();
    const fixture = fixtureData.data;

    if (!fixture) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }

    // Get team names
    const team1Res = await fetch(`${API_BASE}/teams/${fixture.localteam_id}?api_token=${API_TOKEN}`);
    const team1Data: any = await team1Res.json();
    const team2Res = await fetch(`${API_BASE}/teams/${fixture.visitorteam_id}?api_token=${API_TOKEN}`);
    const team2Data: any = await team2Res.json();

    const team1 = team1Data.data;
    const team2 = team2Data.data;

    // Check if already imported
    const existing = await Match.findOne({ where: { externalId: fixtureId } });
    if (existing) {
      res.json({ message: "Match already imported", match: existing });
      return;
    }

    const match = await Match.create({
      externalId: fixtureId,
      team1: team1?.name || `Team ${fixture.localteam_id}`,
      team2: team2?.name || `Team ${fixture.visitorteam_id}`,
      team1Short: team1?.code || "T1",
      team2Short: team2?.code || "T2",
      team1Players: team1Players || [],
      team2Players: team2Players || [],
      startTime: new Date(fixture.starting_at),
      status: fixture.status === "Finished" ? "completed" : fixture.status === "NS" ? "upcoming" : "live",
      scoreData: {
        venue: fixture.venue_id,
        team1Img: team1?.image_path || "",
        team2Img: team2?.image_path || "",
      },
    });

    // Generate pre-match predictions
    const preMatchQuestions = generatePreMatchPredictions(
      match.id, match.team1, match.team2,
      match.team1Short, match.team2Short,
      match.team1Players, match.team2Players
    );
    for (const q of preMatchQuestions) {
      await Prediction.create(q as any);
    }

    res.status(201).json({
      message: "Match imported",
      match: {
        id: match.id,
        externalId: match.externalId,
        team1: match.team1,
        team2: match.team2,
        team1Short: match.team1Short,
        team2Short: match.team2Short,
        status: match.status,
        startTime: match.startTime,
      },
      predictionsGenerated: preMatchQuestions.length,
    });
  } catch (error) {
    console.error("Import fixture error:", error);
    res.status(500).json({ error: "Failed to import fixture" });
  }
});

// Manually trigger Sportsmonk poll
router.post("/cricket/poll", async (req: any, res: Response): Promise<void> => {
  try {
    const { pollSportsmonkUpdates } = await import("../services/sportsmonkApi");
    const io = req.app.get("io");
    await pollSportsmonkUpdates(io);
    res.json({ message: "Sportsmonk poll completed" });
  } catch (error) {
    console.error("Poll error:", error);
    res.status(500).json({ error: "Failed to poll" });
  }
});

export default router;
