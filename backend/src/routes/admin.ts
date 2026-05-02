import { Router, Request, Response } from "express";
import { Match, Prediction, MatchParticipant, Venue, User, Reward, MatchCode } from "../models";
import { authenticateVenue, authenticateOwner, authenticateUser, AuthRequest } from "../middleware/auth";
import { UniqueConstraintError, Op } from "sequelize";
import {
  generatePreMatchPredictions,
  generatePerOverPredictions,
  generateHotTake,
  generatePlayerHotTake,
  generateRivalryCalls,
  getCurrentRound,
} from "../services/predictionEngine";
import { resolvePrediction, generateRoundRewards, recomputeParticipantScores } from "../services/pointsEngine";
import { fetchTodayFixtures, fetchSportsmonkLiveScores, resolveOverPredictionFromStats, reResolveMatch } from "../services/sportsmonkApi";
import { overStatsToContext } from "../services/feedback";

const router = Router();

// Delta re-resolution of every prediction in a match. For each row, asks
// the resolver what the answer SHOULD be from fresh fixture+balls and only
// flips the stored correctOption when the new value is non-null AND differs.
// When Sportsmonk has aged out the fixture (no balls returned) the resolver
// returns null and the row is left untouched — so this endpoint is a safe
// no-op rather than a wipe. After delta updates, recomputeParticipantScores
// rebuilds UserPrediction.isCorrect/pointsEarned + MatchParticipant totals
// from the updated correctOptions. Idempotent: second run reports updated=0.
router.post("/re-resolve-match", authenticateOwner, async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.body as { matchId?: string };
    if (!matchId) {
      res.status(400).json({ error: "matchId required" });
      return;
    }
    const io = req.app.get("io");
    const summary = await reResolveMatch(matchId, io);
    res.json(summary);
  } catch (err: any) {
    console.error("Re-resolve match error:", err);
    res.status(500).json({ error: err?.message || "Failed to re-resolve match" });
  }
});

// Wipe all punter-card predictions for a match and regenerate them from the
// current question template + squad data. Use after the punter-card question
// set itself changes (e.g. swapping the v1 yes/no pack for the v2
// head-to-head pack), so existing not-yet-played matches pick up the new
// questions. Refuses to run if anyone already has user-answers — protects
// against accidentally wiping locked picks.
router.post("/regenerate-punter-card", authenticateOwner, async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId, force } = req.body as { matchId?: string; force?: boolean };
    if (!matchId) {
      res.status(400).json({ error: "matchId required" });
      return;
    }
    const { Prediction, UserPrediction, Match } = await import("../models");
    const { ensurePunterCard } = await import("../services/punterCard");

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const existingCards = await Prediction.findAll({
      where: { matchId, category: "punter_card" },
      attributes: ["id"],
    });
    const existingIds = existingCards.map((p) => p.id);

    const userAnswerCount = existingIds.length
      ? await UserPrediction.count({ where: { predictionId: existingIds } })
      : 0;

    if (userAnswerCount > 0 && !force) {
      res.status(409).json({
        error: "Punter card has user answers — won't wipe without { force: true }",
        userAnswerCount,
      });
      return;
    }

    // Hard-delete the old user answers + predictions, then regenerate.
    if (existingIds.length) {
      await UserPrediction.destroy({ where: { predictionId: existingIds } });
      await Prediction.destroy({ where: { id: existingIds } });
    }
    const result = await ensurePunterCard(match);

    res.json({
      matchId,
      deleted: existingIds.length,
      deletedUserAnswers: userAnswerCount,
      created: result.created,
    });
  } catch (err: any) {
    console.error("Regenerate punter card error:", err);
    res.status(500).json({ error: err?.message || "Failed to regenerate punter card" });
  }
});

// Rebuild MatchParticipant.totalPoints + round{N}Points from the UserPrediction
// history for a match (or match + venue). Use this to repair leaderboards
// after fixing an accounting bug or after any drift between totalPoints and
// the round columns. Safe/idempotent — reads the resolved-answer history
// and overwrites the cached totals.
router.post("/recompute-scores", authenticateOwner, async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId, venueId, userId } = req.body as { matchId?: string; venueId?: string; userId?: string };
    if (!matchId && !venueId && !userId) {
      res.status(400).json({ error: "Provide at least one of matchId / venueId / userId" });
      return;
    }
    const summary = await recomputeParticipantScores({ matchId, venueId, userId });
    res.json(summary);
  } catch (error) {
    console.error("Recompute scores error:", error);
    res.status(500).json({ error: "Failed to recompute scores" });
  }
});

// Create a match (admin/dev endpoint)
router.post("/match", authenticateOwner, async (req: any, res: Response): Promise<void> => {
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

    // Pre-match question timing:
    // - All 4 questions open together 45 minutes before match time
    // - Toss question locks when toss is detected; the other 3 stay open until first ball
    if (startTime) {
      const opensAt = new Date(new Date(startTime).getTime() - 45 * 60_000);
      const preMatchPreds = await Prediction.findAll({
        where: { matchId: match.id, category: "pre_match" },
      });
      for (const pred of preMatchPreds) {
        await pred.update({ opensAt });
      }
    }

    res.status(201).json({ match, predictionsGenerated: preMatchQuestions.length });
  } catch (error) {
    console.error("Create match error:", error);
    res.status(500).json({ error: "Failed to create match" });
  }
});

// Start match — generates Over 1 predictions so users can answer during the first over
router.post("/match/:matchId/start", authenticateOwner, async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { currentBatter, battingFirstTeamShort } = req.body;

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const io = req.app.get("io");

    // Determine which team bats first; defaults to team1 if not specified
    const inn1TeamShort = battingFirstTeamShort || match.team1Short;

    await match.update({
      status: "live",
      currentOver: 1,
      currentInnings: 1,
      currentPhase: "innings1_powerplay",
      scoreData: {
        ...match.scoreData,
        currentInnings: 1,
        currentOver: 1,
        innings1: { score: 0, wickets: 0, overs: 0, teamShort: inn1TeamShort },
      },
    });

    // Generate Over 1 predictions (locked when 1st ball is bowled) — dedup in case start is called twice
    const round = 1;
    let overPredictionsGenerated = 0;
    const existingOver1 = await Prediction.findOne({ where: { matchId, overNumber: 1, category: "per_over" } });
    if (!existingOver1) {
      const overPreds = generatePerOverPredictions(matchId, 1, round, currentBatter, "");
      for (const p of overPreds) {
        await Prediction.create(p as any);
      }
      overPredictionsGenerated = overPreds.length;
    }

    // Generate Round 1 hot take (dedup)
    const hotTakeExpiresAt = new Date(Date.now() + 120_000);
    let hotTakeGenerated = 0;
    const existingHotTake1 = await Prediction.findOne({ where: { matchId, category: "hot_take", round } });
    if (!existingHotTake1) {
      const hotTake = generateHotTake(matchId, round, match.team1Short, match.team2Short);
      if (hotTake) {
        await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
        hotTakeGenerated = 1;
      }
      const playerHotTake = generatePlayerHotTake(matchId, round, {
        team1Players: match.team1Players,
        team2Players: match.team2Players,
      });
      if (playerHotTake) {
        await Prediction.create({ ...playerHotTake, expiresAt: hotTakeExpiresAt } as any);
        hotTakeGenerated++;
      }
    }

    // Lock all pre-match predictions — match is now live
    const preMatchPreds = await Prediction.findAll({
      where: { matchId, category: "pre_match", status: "open" },
    });
    for (const pred of preMatchPreds) {
      await pred.update({ status: "locked" });
    }
    if (preMatchPreds.length > 0) {
      io.to(`match:${matchId}`).emit("predictionsLocked", { matchId, type: "pre_match" });
    }

    io.to(`match:${matchId}`).emit("newPrediction", { matchId, type: "per_over", overNumber: 1, round });
    io.to(`match:${matchId}`).emit("matchStarted", { matchId });

    res.json({
      message: "Match started! Over 1 predictions are live.",
      predictionsGenerated: overPredictionsGenerated + hotTakeGenerated,
      preMatchLocked: preMatchPreds.length,
      currentPhase: "innings1_powerplay",
    });
  } catch (error) {
    console.error("Start match error:", error);
    res.status(500).json({ error: "Failed to start match" });
  }
});

// Advance match state — called when an over is COMPLETED
// Resolves current over predictions, generates next over predictions
router.post("/match/:matchId/advance-over", authenticateOwner, async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { overNumber, innings, overResults, currentBatter } = req.body;

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const io = req.app.get("io");
    const round = getCurrentRound(innings, overNumber, match.totalOvers);

    const nextOver = overNumber + 1;

    // Update match state — phase reflects the NEXT over being bowled, not the completed one
    const _totalOvers = match.totalOvers || 20;
    let ppEnd = Math.min(6, _totalOvers);
    let midEnd = Math.ceil(_totalOvers * 0.75);
    if (_totalOvers <= 3) { ppEnd = 1; midEnd = 2; }
    else if (ppEnd >= midEnd) { midEnd = ppEnd + 1; }
    const newPhase = innings === 1
      ? nextOver <= ppEnd ? "innings1_powerplay" : nextOver <= midEnd ? "innings1_middle" : "innings1_death"
      : nextOver <= ppEnd ? "innings2_powerplay" : nextOver <= midEnd ? "innings2_middle" : "innings2_death";
    // Compute aggregated innings totals from all stored over results
    const updatedScoreData: Record<string, any> = {
      ...match.scoreData,
      [`innings${innings}_over${overNumber}`]: overResults,
    };
    let inningsScore = 0;
    let inningsWickets = 0;
    for (let ov = 1; ov <= overNumber; ov++) {
      const ovData = updatedScoreData[`innings${innings}_over${ov}`];
      if (ovData) {
        inningsScore += ovData.runs || 0;
        inningsWickets += ovData.wickets || 0;
      }
    }
    const inningsKey = `innings${innings}`;
    updatedScoreData[inningsKey] = {
      ...(updatedScoreData[inningsKey] || {}),
      score: inningsScore,
      wickets: inningsWickets,
      overs: overNumber,
    };
    updatedScoreData.currentInnings = innings;
    updatedScoreData.currentOver = nextOver;

    await match.update({
      status: "live",
      currentOver: nextOver,
      currentInnings: innings,
      currentPhase: newPhase,
      scoreData: updatedScoreData,
    });

    // Emit score update so frontend gets live scores immediately
    io.to(`match:${matchId}`).emit("scoreUpdate", {
      matchId,
      innings,
      over: nextOver,
      scoreData: updatedScoreData,
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
        await resolvePrediction(pred, correctOption, io, overStatsToContext(overResults as any));
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
      io.to(`match:${matchId}`).emit("predictionsLocked", { matchId, overNumber: nextOver });
    }

    // Generate next over's predictions
    const nextRound = getCurrentRound(innings, nextOver, match.totalOvers);

    // Check if round changed — generate hot take + round rewards
    const prevRound = getCurrentRound(innings, overNumber, match.totalOvers);
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
          io.to(`match:${matchId}`).emit("newPrediction", { matchId, type: "hot_take", round: nextRound });
        }
        const playerHotTake = generatePlayerHotTake(matchId, nextRound, {
          team1Players: match.team1Players,
          team2Players: match.team2Players,
        });
        if (playerHotTake) {
          await Prediction.create({ ...playerHotTake, expiresAt: roundHotTakeExpiresAt } as any);
        }
      }
    }

    // Compute innings totals for innings break detection and prediction generation
    const totalWickets = inningsWickets;
    const totalScore = inningsScore;
    const isAllOut = totalWickets >= 10;

    // For 2nd innings, check if target is chased
    const inn1Final = updatedScoreData.innings1Final || updatedScoreData.innings1;
    const inn1Score = inn1Final?.runs ?? inn1Final?.score ?? 0;
    const targetChased = innings === 2 && inn1Score > 0 && totalScore >= (inn1Score + 1);

    // Innings break: triggered when 1st innings ends — either all-out OR over 20 completed
    if (innings === 1 && (isAllOut || overNumber >= (match.totalOvers || 20))) {
        // Auto-trigger innings break when first innings team is all out
        await match.update({
          currentPhase: "innings_break",
          currentInnings: 2,
          currentOver: 0,
          scoreData: {
            ...updatedScoreData,
            innings1Final: { runs: totalScore, wickets: totalWickets },
            innings1: {
              ...(updatedScoreData.innings1 || {}),
              score: totalScore,
              wickets: totalWickets,
              overs: overNumber,
            },
            innings2: { score: 0, wickets: 0, overs: 0 },
            target: totalScore + 1,
            currentInnings: 2,
            currentOver: 0,
          },
        });

        const scoreData = updatedScoreData as any;
        const innings1TeamShort = scoreData?.innings1?.teamShort;
        const chasingTeamShort = innings1TeamShort
          ? (innings1TeamShort === match.team1Short ? match.team2Short : match.team1Short)
          : match.team2Short;
        const chasingTeamPlayers = innings1TeamShort
          ? (innings1TeamShort === match.team1Short ? match.team2Players : match.team1Players)
          : match.team2Players;

        // Generate rivalry calls (with dedup)
        const existingRivalryCalls = await Prediction.findAll({ where: { matchId, category: "rivalry_call" } });
        if (existingRivalryCalls.length === 0) {
          const rivalryCalls = generateRivalryCalls(matchId, totalScore + 1, chasingTeamShort, chasingTeamPlayers, match.totalOvers);
          const rivalryExpiresAt = new Date(Date.now() + 480_000);
          for (const rc of rivalryCalls) {
            await Prediction.create({ ...rc, expiresAt: rivalryExpiresAt } as any);
          }
        }

        // Generate round 3 rewards
        const allOutVenues = await MatchParticipant.findAll({
          where: { matchId },
          attributes: ["venueId"],
          group: ["venueId"],
        });
        for (const v of allOutVenues) {
          await generateRoundRewards(matchId, v.venueId, 3, io);
        }

        // Generate Over 1 (2nd innings) predictions (with dedup)
        const inn2Round = getCurrentRound(2, 1, match.totalOvers);
        const existingInn2Over1 = await Prediction.findAll({
          where: { matchId, overNumber: 1, round: inn2Round, category: "per_over" },
        });
        if (existingInn2Over1.length === 0) {
          const inn2OverPreds = generatePerOverPredictions(matchId, 1, inn2Round, "", "");
          for (const p of inn2OverPreds) {
            await Prediction.create(p as any);
          }
        }

        // Generate Round 4 hot take
        const existingInnHotTake = await Prediction.findOne({
          where: { matchId, category: "hot_take", round: inn2Round },
        });
        if (!existingInnHotTake) {
          const hotTakeExpiresAt = new Date(Date.now() + 120_000);
          const hotTake = generateHotTake(matchId, inn2Round, match.team1Short, match.team2Short);
          if (hotTake) {
            await Prediction.create({ ...hotTake, expiresAt: hotTakeExpiresAt } as any);
          }
          const playerHotTake = generatePlayerHotTake(matchId, inn2Round, {
            team1Players: match.team1Players,
            team2Players: match.team2Players,
          });
          if (playerHotTake) {
            await Prediction.create({ ...playerHotTake, expiresAt: hotTakeExpiresAt } as any);
          }
        }

        io.to(`match:${matchId}`).emit("newPrediction", { matchId, type: "per_over", overNumber: 1, round: inn2Round });
        io.to(`match:${matchId}`).emit("inningsBreak", { matchId, target: totalScore + 1, team1Score: totalScore, team1Wickets: totalWickets });

        res.json({
          message: `Over ${overNumber} completed — innings break auto-triggered`,
          resolvedPredictions: overPredictions.length,
          currentPhase: "innings_break",
          nextRound,
          allOut: isAllOut,
        });
        return;
      }

    // Generate per-over predictions ONE over ahead (the upcoming over). This used
    // to pre-generate two overs out, which led to questions being shown for an
    // over that hadn't started yet — users found it disorienting. A single-over
    // look-ahead gives ~3 minutes of decision time without the mental lag.
    const upcomingOver = nextOver;
    const upcomingRound = getCurrentRound(innings, upcomingOver, match.totalOvers);
    if (upcomingOver <= (match.totalOvers || 20) && !isAllOut && !targetChased) {
      // Deduplication: check if predictions for this over+round already exist
      const existingPreds = await Prediction.findAll({
        where: { matchId, overNumber: upcomingOver, round: upcomingRound, category: "per_over" },
      });

      if (existingPreds.length === 0) {
        const newPredictions = generatePerOverPredictions(matchId, upcomingOver, upcomingRound, currentBatter, "");
        for (const p of newPredictions) {
          await Prediction.create(p as any);
        }
        io.to(`match:${matchId}`).emit("newPrediction", { matchId, type: "per_over", overNumber: upcomingOver, round: upcomingRound });
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

// Reduce total overs (rain interruption)
router.put("/match/:matchId/reduce-overs", authenticateOwner, async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { totalOvers } = req.body;

    if (!totalOvers || totalOvers < 1 || totalOvers > 20) {
      res.status(400).json({ error: "totalOvers must be between 1 and 20" });
      return;
    }

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    // Can't reduce below already-completed overs
    const currentOver = match.currentOver || 0;
    if (totalOvers < currentOver) {
      res.status(400).json({ error: `Cannot reduce below current over (${currentOver})` });
      return;
    }

    await match.update({ totalOvers });

    // Lock and cancel open predictions for overs beyond the new limit
    const stalePredictions = await Prediction.findAll({
      where: {
        matchId,
        status: "open",
        overNumber: { [Op.gt]: totalOvers },
      },
    });

    for (const pred of stalePredictions) {
      await pred.update({ status: "locked" });
    }

    const io = req.app.get("io");
    io.to(`match:${matchId}`).emit("oversReduced", { matchId, totalOvers, lockedPredictions: stalePredictions.length });

    console.log(`[Rain] Match ${matchId} reduced to ${totalOvers} overs. Locked ${stalePredictions.length} predictions.`);
    res.json({
      message: `Match reduced to ${totalOvers} overs`,
      totalOvers,
      lockedPredictions: stalePredictions.length,
    });
  } catch (error) {
    console.error("Reduce overs error:", error);
    res.status(500).json({ error: "Failed to reduce overs" });
  }
});

// Resolve a specific prediction manually
router.post("/prediction/:predictionId/resolve", authenticateOwner, async (req: any, res: Response): Promise<void> => {
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
router.post("/match/:matchId/innings-break", authenticateOwner, async (req: any, res: Response): Promise<void> => {
  try {
    const { matchId } = req.params;
    const { team1Score, team1Wickets, target } = req.body;

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const io = req.app.get("io");

    await match.update({
      currentPhase: "innings_break",
      currentInnings: 2,
      currentOver: 0,
      scoreData: {
        ...match.scoreData,
        innings1Final: { runs: team1Score, wickets: team1Wickets },
        innings1: {
          ...(match.scoreData as any)?.innings1,
          score: team1Score,
          wickets: team1Wickets,
        },
        innings2: { score: 0, wickets: 0, overs: 0 },
        target,
        currentInnings: 2,
        currentOver: 0,
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

    // Generate rivalry calls for second innings (with dedup)
    let rivalryCallsGenerated = 0;
    const existingRivalryCallsManual = await Prediction.findAll({ where: { matchId, category: "rivalry_call" } });
    if (existingRivalryCallsManual.length === 0) {
      const rivalryCalls = generateRivalryCalls(
        matchId,
        target,
        chasingTeamShort,
        chasingTeamPlayers,
        match.totalOvers
      );
      // 8 minutes — enough time for innings break; backend locks them at first ball of innings 2
      const rivalryExpiresAt = new Date(Date.now() + 480_000);
      for (const rc of rivalryCalls) {
        await Prediction.create({ ...rc, expiresAt: rivalryExpiresAt } as any);
      }
      rivalryCallsGenerated = rivalryCalls.length;
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

    // Generate Over 1 (2nd innings) per-over predictions — locked when 1st ball of innings 2 is bowled (with dedup)
    const inn2Round = getCurrentRound(2, 1, match.totalOvers); // = 4
    let innings2OverPredictionsGenerated = 0;
    const existingInn2Over1Manual = await Prediction.findAll({
      where: { matchId, overNumber: 1, round: inn2Round, category: "per_over" },
    });
    if (existingInn2Over1Manual.length === 0) {
      const inn2OverPreds = generatePerOverPredictions(matchId, 1, inn2Round, "", "");
      for (const p of inn2OverPreds) {
        await Prediction.create(p as any);
      }
      innings2OverPredictionsGenerated = inn2OverPreds.length;
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
      const playerHotTake = generatePlayerHotTake(matchId, inn2Round, {
        team1Players: match.team1Players,
        team2Players: match.team2Players,
      });
      if (playerHotTake) {
        await Prediction.create({ ...playerHotTake, expiresAt: hotTakeExpiresAt } as any);
      }
    }

    io.to(`match:${matchId}`).emit("newPrediction", { matchId, type: "per_over", overNumber: 1, round: inn2Round });
    io.to(`match:${matchId}`).emit("inningsBreak", { matchId, target, team1Score, team1Wickets });

    res.json({
      message: "Innings break started",
      rivalryCallsGenerated,
      inn2OverPreds: innings2OverPredictionsGenerated,
    });
  } catch (error) {
    console.error("Innings break error:", error);
    res.status(500).json({ error: "Failed to start innings break" });
  }
});

// End match
router.post("/match/:matchId/end", authenticateOwner, async (req: any, res: Response): Promise<void> => {
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

    // Close rooms for this match
    try {
      const { Room } = await import("../models");
      await Room.update({ status: "closed" }, { where: { matchId, status: ["waiting", "active"], isSeasonRoom: false } });
    } catch (err) {
      console.error("Room close error:", err);
    }

    // Final pass: give the live player tracker one last chance to resolve
    // batsman/bowler questions against the now-finished innings data. If the
    // match ended with no winner (abandoned/tie-no-result), void anything
    // still unresolved so boosts are refunded.
    try {
      if (winner) {
        const { processLivePlayers } = await import("../services/livePlayerTracker");
        const { fetchLiveFixtureForTracker } = await import("../services/sportsmonkApi");
        if (match.externalId) {
          const fixture = await fetchLiveFixtureForTracker(parseInt(match.externalId), true);
          if (fixture) await processLivePlayers(match, fixture, io);
        }
      } else {
        const { voidPrediction } = await import("../services/pointsEngine");
        const unresolved = await Prediction.findAll({
          where: {
            matchId,
            subjectType: { [Op.in]: ["batsman_innings", "bowler_innings"] },
            status: { [Op.in]: ["open", "locked"] },
          },
        });
        for (const p of unresolved) {
          await voidPrediction(p, "match_no_result", io);
        }
      }
    } catch (err) {
      console.error("End-of-match live player sweep error:", err);
    }

    // Lock any remaining open predictions — they can't be resolved without a correctOption
    const openPreds = await Prediction.findAll({
      where: { matchId, status: "open" },
    });
    for (const pred of openPreds) {
      await pred.update({ status: "locked" });
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

    io.to(`match:${matchId}`).emit("matchEnd", { matchId, winner, playerOfMatch });

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
router.get("/cricket/fixtures", authenticateOwner, async (_req: any, res: Response): Promise<void> => {
  try {
    const fixtures = await fetchTodayFixtures();
    res.json({ total: fixtures.length, fixtures });
  } catch (error) {
    console.error("Fetch fixtures error:", error);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

// Fetch live scores from Sportsmonk
router.get("/cricket/live", authenticateOwner, async (_req: any, res: Response): Promise<void> => {
  try {
    const scores = await fetchSportsmonkLiveScores();
    res.json({ total: scores.length, scores });
  } catch (error) {
    console.error("Fetch live scores error:", error);
    res.status(500).json({ error: "Failed to fetch live scores" });
  }
});

// Import a Sportsmonk fixture into our database
router.post("/cricket/import/:fixtureId", authenticateOwner, async (req: any, res: Response): Promise<void> => {
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

    // Pre-match question timing (same as admin.ts POST /match):
    // - All 4 questions open together 45 minutes before match time
    // - Toss question locks when toss is detected; the other 3 stay open until first ball
    if (match.startTime) {
      const opensAt = new Date(new Date(match.startTime).getTime() - 45 * 60_000);
      const preMatchPreds = await Prediction.findAll({
        where: { matchId: match.id, category: "pre_match" },
      });
      for (const pred of preMatchPreds) {
        await pred.update({ opensAt });
      }
    }

    // Migrate any MatchCode records previously created with the sportsmonk_ prefixed ID
    await MatchCode.update(
      { matchId: match.id },
      { where: { matchId: `sportsmonk_${fixtureId}` } }
    );

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
router.post("/cricket/poll", authenticateOwner, async (req: any, res: Response): Promise<void> => {
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

// ── Match Code Management ──────────────────────────────────────────

// Generate match code for a match at this venue
// Idempotent: returns existing code if one already exists (codes never change once set)
router.post("/match-code", authenticateVenue, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.venueId!;
    const { matchId } = req.body;

    if (!matchId) {
      res.status(400).json({ error: "matchId is required" });
      return;
    }

    const code = String(Math.floor(1000 + Math.random() * 9000));

    try {
      const [matchCode, created] = await MatchCode.findOrCreate({
        where: { venueId, matchId, isActive: true },
        defaults: {
          venueId,
          matchId,
          code,
          isActive: true,
        },
      });

      res.status(created ? 201 : 200).json({
        matchCode: { id: matchCode.id, code: matchCode.code, matchId, isActive: true },
      });
      return;
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const existing = await MatchCode.findOne({
          where: { venueId, matchId, isActive: true },
          order: [["createdAt", "DESC"]],
        });
        if (existing) {
          res.json({ matchCode: { id: existing.id, code: existing.code, matchId, isActive: true } });
          return;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Generate match code error:", error);
    res.status(500).json({ error: "Failed to generate code" });
  }
});

// Get active match code for a match at this venue
router.get("/match-code/:matchId", authenticateVenue, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.venueId!;
    const matchId = req.params.matchId as string;

    const matchCode = await MatchCode.findOne({
      where: { venueId, matchId, isActive: true },
      order: [["createdAt", "DESC"]],
    });

    if (!matchCode) {
      res.json({ matchCode: null });
      return;
    }

    res.json({ matchCode: { id: matchCode.id, code: matchCode.code, matchId, isActive: true } });
  } catch (error) {
    console.error("Get match code error:", error);
    res.status(500).json({ error: "Failed to get code" });
  }
});

// Validate a match code (called by user join flow)
router.post("/validate-code", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { venueId, matchId, code } = req.body;

    if (!venueId || !matchId || !code) {
      res.status(400).json({ valid: false, error: "Missing fields" });
      return;
    }

    const matchCode = await MatchCode.findOne({
      where: { venueId, matchId, code, isActive: true },
    });

    res.json({ valid: !!matchCode });
  } catch (error) {
    console.error("Validate code error:", error);
    res.status(500).json({ valid: false, error: "Validation failed" });
  }
});

// Get players for a match at this venue
router.get("/venue/players/:matchId", authenticateVenue, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.venueId!;
    const matchId = req.params.matchId as string;

    const participants = await MatchParticipant.findAll({
      where: { matchId, venueId },
      include: [{ model: User, as: "user", attributes: ["displayName", "phone"] }],
      order: [["totalPoints", "DESC"]],
    });

    res.json({ count: participants.length, players: participants });
  } catch (error) {
    console.error("Get venue players error:", error);
    res.status(500).json({ error: "Failed to get players" });
  }
});

export default router;
