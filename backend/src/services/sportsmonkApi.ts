import { Match, Prediction, MatchParticipant } from "../models";
import { generatePerOverPredictions, generateHotTake, generateRivalryCalls, getCurrentRound } from "./predictionEngine";
import { resolvePrediction, generateRoundRewards } from "./pointsEngine";
import { Server as SocketIOServer } from "socket.io";

const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

interface BallData {
  ball: number;
  scoreboard: string; // S1 = innings 1, S2 = innings 2
  batsman_id: number;
  bowler_id: number;
  batsmanout_id: number | null;
  score: {
    name: string;
    runs: number;
    four: boolean;
    six: boolean;
    bye: number;
    leg_bye: number;
    noball: number;
    noball_runs: number;
    is_wicket: boolean;
    ball: boolean; // true = legal delivery
    out: boolean;
  };
  batsman: { fullname: string };
  bowler: { fullname: string };
}

interface OverStats {
  runs: number;
  wickets: number;
  sixes: number;
  boundaries: number;
  dots: number;
  wides: number;
  noballs: number;
  lastBallRuns: number;
  lastBallWicket: boolean;
  firstBallBoundary: boolean;
  currentBatsman: string;
}

// Fetch fixture with ball-by-ball data
async function fetchFixtureWithBalls(fixtureId: number): Promise<any> {
  try {
    const url = `${API_BASE}/fixtures/${fixtureId}?api_token=${API_TOKEN}&include=balls,runs`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.data || null;
  } catch (error) {
    console.error("Sportsmonk fetch error:", error);
    return null;
  }
}

// Fetch live scores
export async function fetchSportsmonkLiveScores(): Promise<any[]> {
  try {
    const url = `${API_BASE}/livescores?api_token=${API_TOKEN}&include=balls,runs`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.data || [];
  } catch (error) {
    console.error("Sportsmonk livescores error:", error);
    return [];
  }
}

// Fetch today's fixtures
export async function fetchTodayFixtures(): Promise<any[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const url = `${API_BASE}/fixtures?filter[starts_between]=${today},${today}&api_token=${API_TOKEN}&include=runs,localteam,visitorteam`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.data || [];
  } catch (error) {
    console.error("Sportsmonk fixtures error:", error);
    return [];
  }
}

// Compute over stats from ball-by-ball data
function computeOverStats(balls: BallData[], overNumber: number, innings: string): OverStats {
  // Sportsmonk uses 0-indexed overs: over 1 = balls 0.1-0.6, over 2 = balls 1.1-1.6
  const overPrefix = (overNumber - 1).toString();
  const overBalls = balls.filter(
    (b) => b.scoreboard === innings && String(b.ball).split(".")[0] === overPrefix
  );

  let runs = 0;
  let wickets = 0;
  let sixes = 0;
  let boundaries = 0;
  let dots = 0;
  let wides = 0;
  let noballs = 0;
  let lastBallRuns = 0;
  let lastBallWicket = false;
  let firstBallBoundary = false;
  let currentBatsman = "";

  const legalBalls = overBalls.filter((b) => b.score.ball); // only legal deliveries

  for (let i = 0; i < overBalls.length; i++) {
    const b = overBalls[i];
    const s = b.score;

    runs += s.runs;
    if (s.is_wicket || b.batsmanout_id) wickets++;
    if (s.six) { sixes++; boundaries++; }
    else if (s.four) { boundaries++; }
    if (s.runs === 0 && !s.is_wicket && s.ball) dots++;
    if (s.name?.toLowerCase().includes("wide")) wides++;
    if (s.noball > 0 || s.noball_runs > 0) noballs++;

    currentBatsman = b.batsman?.fullname || currentBatsman;
  }

  // Last legal ball
  if (legalBalls.length > 0) {
    const lastBall = legalBalls[legalBalls.length - 1];
    lastBallRuns = lastBall.score.runs;
    lastBallWicket = lastBall.score.is_wicket || lastBall.batsmanout_id !== null;
  }

  // First legal ball
  if (legalBalls.length > 0) {
    const firstBall = legalBalls[0];
    firstBallBoundary = firstBall.score.four || firstBall.score.six;
  }

  return {
    runs,
    wickets,
    sixes,
    boundaries,
    dots,
    wides,
    noballs,
    lastBallRuns,
    lastBallWicket,
    firstBallBoundary,
    currentBatsman,
  };
}

// Get the current over number from ball data
function getCurrentOver(balls: BallData[], innings: string): number {
  const inningsBalls = balls.filter((b) => b.scoreboard === innings && b.score.ball);
  if (inningsBalls.length === 0) return 0;

  const lastBall = inningsBalls[inningsBalls.length - 1];
  // ball 0.6 = end of over 1, ball 1.1 = start of over 2
  const overIndex = Math.floor(lastBall.ball);
  const ballInOver = Math.round((lastBall.ball - overIndex) * 10);

  // If last ball is .6, the over is complete
  if (ballInOver >= 6) return overIndex + 1;
  // Otherwise we're mid-over
  return overIndex + 1;
}

// Track last processed over per match to avoid duplicate processing
const lastProcessedOver: Map<string, { innings: number; over: number }> = new Map();

// Main polling function — call this on interval
export async function pollSportsmonkUpdates(io: SocketIOServer): Promise<void> {
  // Check both live AND upcoming matches (upcoming might have started)
  const matches = await Match.findAll({ where: { status: ["live", "upcoming"] } });

  for (const match of matches) {
    if (!match.externalId) continue;

    // Sportsmonk uses numeric fixture IDs
    const fixtureId = parseInt(match.externalId);
    if (isNaN(fixtureId)) continue;

    const fixture = await fetchFixtureWithBalls(fixtureId);
    if (!fixture) continue;

    // Auto-start: if match is "upcoming" in our DB but toss has happened on Sportsmonk
    if (match.status === "upcoming") {
      const hasToss = fixture.toss_won_team_id !== null && fixture.toss_won_team_id !== undefined;
      const fixtureStatus = fixture.status;
      const ballsData: BallData[] = fixture.balls?.data || [];

      // Toss happened = match is about to start, generate Over 1 predictions NOW
      // so users can answer before the first ball
      if (hasToss || fixtureStatus !== "NS" || ballsData.length > 0) {
        console.log(`[Sportsmonk] Toss done for ${match.team1Short} vs ${match.team2Short} — going live!`);

        await match.update({
          status: "live",
          currentInnings: 1,
          currentOver: 1,
          currentPhase: "innings1_powerplay" as any,
          scoreData: {
            ...match.scoreData,
            tossWonTeamId: fixture.toss_won_team_id,
            elected: fixture.elected,
          },
        });

        // Generate Over 1 predictions + Round 1 hot take
        const { generatePerOverPredictions, generateHotTake } = await import("./predictionEngine");

        const currentBatsman = ballsData.length > 0 ? (ballsData[0].batsman?.fullname || "") : "";
        const over1Preds = generatePerOverPredictions(match.id, 1, 1, currentBatsman);
        for (const p of over1Preds) {
          await Prediction.create(p as any);
        }

        const hotTake = generateHotTake(match.id, 1, match.team1Short, match.team2Short);
        if (hotTake) {
          await Prediction.create(hotTake as any);
        }

        io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: 1 });
        io.emit("matchStarted", { matchId: match.id });

        console.log(`[Sportsmonk] Over 1 predictions live — users can predict before first ball`);
      } else {
        // Toss not done yet, skip
        continue;
      }
    }

    const balls: BallData[] = fixture.balls?.data || [];
    const runs = fixture.runs?.data || (Array.isArray(fixture.runs) ? fixture.runs : []);

    if (balls.length === 0) continue;

    // Determine current innings
    const s2Balls = balls.filter((b: BallData) => b.scoreboard === "S2");
    const currentInningsStr = s2Balls.length > 0 ? "S2" : "S1";
    const currentInnings = currentInningsStr === "S2" ? 2 : 1;

    const currentOver = getCurrentOver(balls, currentInningsStr);
    const lastProcessed = lastProcessedOver.get(match.id) || { innings: 0, over: 0 };

    // Check if match ended
    if (fixture.status === "Finished") {
      if (match.status !== "completed") {
        await match.update({ status: "completed", currentPhase: "completed" as any });

        // Generate final rewards
        const venues = await MatchParticipant.findAll({
          where: { matchId: match.id },
          attributes: ["venueId"],
          group: ["venueId"],
        });
        for (const v of venues) {
          await generateRoundRewards(match.id, v.venueId, 6, io); // Final round rewards
          await generateRoundRewards(match.id, v.venueId, 0, io); // Grand prize
        }

        io.emit("matchEnd", { matchId: match.id, winner: fixture.winner_team_id });
        console.log(`[Sportsmonk] Match ${match.id} ended`);
      }
      continue;
    }

    // Check for innings break
    if (currentInnings === 2 && lastProcessed.innings === 1) {
      const innings1Runs = runs.find((r: any) => r.inning === 1);
      if (innings1Runs) {
        const target = innings1Runs.score + 1;
        await match.update({ currentPhase: "innings_break" as any, currentInnings: 2 });

        const rivalryCalls = generateRivalryCalls(
          match.id, target, match.team2Short, match.team2Players
        );
        for (const rc of rivalryCalls) {
          await Prediction.create(rc as any);
        }

        // Round 3 rewards
        const venues = await MatchParticipant.findAll({
          where: { matchId: match.id },
          attributes: ["venueId"],
          group: ["venueId"],
        });
        for (const v of venues) {
          await generateRoundRewards(match.id, v.venueId, 3, io);
        }

        io.emit("inningsBreak", {
          matchId: match.id,
          target,
          team1Score: innings1Runs.score,
          team1Wickets: innings1Runs.wickets,
        });

        console.log(`[Sportsmonk] Innings break — target: ${target}`);
      }
    }

    // Check if a new over has completed
    if (currentOver > lastProcessed.over || currentInnings > lastProcessed.innings) {
      const completedOver = currentInnings > lastProcessed.innings
        ? lastProcessed.over // last over of previous innings
        : currentOver - 1;

      if (completedOver > 0) {
        const prevInningsStr = currentInnings > lastProcessed.innings ? "S1" : currentInningsStr;
        const overStats = computeOverStats(balls, completedOver, prevInningsStr);

        console.log(`[Sportsmonk] Over ${completedOver} completed: ${overStats.runs} runs, ${overStats.wickets} wkts, ${overStats.sixes} sixes`);

        const round = getCurrentRound(
          prevInningsStr === "S1" ? 1 : 2,
          completedOver
        );

        // Resolve predictions for the completed over
        const overPredictions = await Prediction.findAll({
          where: { matchId: match.id, overNumber: completedOver, status: "open" },
        });

        for (const pred of overPredictions) {
          const correctOption = resolveOverPredictionFromStats(pred, overStats);
          if (correctOption) {
            await resolvePrediction(pred, correctOption, io);
          }
        }

        // Update match state
        const newPhase = getPhase(currentInnings, currentOver);
        await match.update({
          currentOver,
          currentInnings,
          currentPhase: newPhase as any,
        });

        // Check round change
        const prevRound = getCurrentRound(
          prevInningsStr === "S1" ? 1 : 2,
          completedOver
        );
        const newRound = getCurrentRound(currentInnings, currentOver);

        if (newRound !== prevRound && prevRound > 0) {
          const venues = await MatchParticipant.findAll({
            where: { matchId: match.id },
            attributes: ["venueId"],
            group: ["venueId"],
          });
          for (const v of venues) {
            await MatchParticipant.update(
              { boostsUsedRound: 0, currentRound: newRound },
              { where: { matchId: match.id, venueId: v.venueId } }
            );
            await generateRoundRewards(match.id, v.venueId, prevRound, io);
          }

          const hotTake = generateHotTake(match.id, newRound, match.team1Short, match.team2Short);
          if (hotTake) {
            await Prediction.create(hotTake as any);
            io.emit("newPrediction", { matchId: match.id, type: "hot_take", round: newRound });
          }
        }

        // Generate predictions for the next over
        const nextOver = currentOver;
        if (nextOver <= 20) {
          const nextBatsman = overStats.currentBatsman;
          const nextRound = getCurrentRound(currentInnings, nextOver);
          const newPreds = generatePerOverPredictions(match.id, nextOver, nextRound, nextBatsman);
          for (const p of newPreds) {
            await Prediction.create(p as any);
          }
          io.emit("newPrediction", {
            matchId: match.id,
            type: "per_over",
            overNumber: nextOver,
            round: nextRound,
          });
          console.log(`[Sportsmonk] Over ${nextOver} predictions generated`);
        }
      }

      // Update tracking
      lastProcessedOver.set(match.id, { innings: currentInnings, over: currentOver });

      // Emit score update
      io.emit("scoreUpdate", {
        matchId: match.id,
        innings: currentInnings,
        over: currentOver,
        runs: runs,
      });
    }
  }
}

function getPhase(innings: number, over: number): string {
  if (innings === 1) {
    if (over <= 6) return "innings1_powerplay";
    if (over <= 15) return "innings1_middle";
    return "innings1_death";
  }
  if (over <= 6) return "innings2_powerplay";
  if (over <= 15) return "innings2_middle";
  return "innings2_death";
}

// Resolve per-over prediction using computed over stats
function resolveOverPredictionFromStats(prediction: Prediction, stats: OverStats): string | null {
  const q = prediction.question.toLowerCase();

  if (q.includes("how many runs")) {
    if (stats.runs <= 5) return "low";
    if (stats.runs <= 10) return "medium";
    return "high";
  }

  if (q.includes("wicket in over")) {
    return stats.wickets > 0 ? "yes" : "no";
  }

  if (q.includes("sixes in over")) {
    if (stats.sixes === 0) return "zero";
    if (stats.sixes === 1) return "one";
    if (stats.sixes === 2) return "two";
    return "three_plus";
  }

  if (q.includes("boundary off the first ball")) {
    return stats.firstBallBoundary ? "yes" : "no";
  }

  if (q.includes("dot balls")) {
    if (stats.dots <= 2) return "few";
    if (stats.dots <= 4) return "some";
    return "lots";
  }

  if (q.includes("how does over") && q.includes("last ball")) {
    if (stats.lastBallWicket) return "wicket";
    if (stats.lastBallRuns >= 4) return "boundary";
    if (stats.lastBallRuns >= 1) return "single";
    return "dot";
  }

  if (q.includes("score 10+")) {
    return stats.runs >= 10 ? "yes" : "no";
  }

  if (q.includes("more than 2 boundaries")) {
    return stats.boundaries > 2 ? "yes" : "no";
  }

  if (q.includes("maiden")) {
    return stats.runs === 0 ? "yes" : "no";
  }

  if (q.includes("last ball of over") && q.includes("runs")) {
    if (stats.lastBallRuns === 0) return "zero";
    if (stats.lastBallRuns <= 2) return "single_double";
    return "three_plus";
  }

  return null;
}
