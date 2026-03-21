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

// Fetch fixture with runs only (fast — for score updates)
async function fetchFixtureWithRuns(fixtureId: number): Promise<any> {
  try {
    const url = `${API_BASE}/fixtures/${fixtureId}?api_token=${API_TOKEN}&include=runs`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.data || null;
  } catch (error) {
    console.error("Sportsmonk fetch (runs) error:", error);
    return null;
  }
}

// Fetch fixture with ball-by-ball data (slow — only for prediction resolution)
async function fetchFixtureWithBalls(fixtureId: number): Promise<any> {
  try {
    const url = `${API_BASE}/fixtures/${fixtureId}?api_token=${API_TOKEN}&include=balls,runs`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.data || null;
  } catch (error) {
    console.error("Sportsmonk fetch (balls) error:", error);
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
  if (matches.length === 0) return;

  for (const match of matches) {
    if (!match.externalId) continue;

    // Sportsmonk uses numeric fixture IDs
    const fixtureId = parseInt(match.externalId);
    if (isNaN(fixtureId)) continue;

    // Fast fetch: runs only (for score updates)
    const fixture = await fetchFixtureWithRuns(fixtureId);
    if (!fixture) {
      console.log(`[Sportsmonk] No fixture data for ${fixtureId}`);
      continue;
    }

    // Auto-start: if match is "upcoming" in our DB but toss has happened on Sportsmonk
    if (match.status === "upcoming") {
      const hasToss = fixture.toss_won_team_id !== null && fixture.toss_won_team_id !== undefined;
      const fixtureStatus = fixture.status;

      if (hasToss || fixtureStatus !== "NS") {
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

        const over1Preds = generatePerOverPredictions(match.id, 1, 1, "");
        for (const p of over1Preds) {
          await Prediction.create(p as any);
        }

        const hotTake = generateHotTake(match.id, 1, match.team1Short, match.team2Short);
        if (hotTake) {
          await Prediction.create(hotTake as any);
        }

        io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: 1 });
        io.emit("matchStarted", { matchId: match.id });

        console.log(`[Sportsmonk] Over 1 predictions live`);
      } else {
        continue;
      }
    }

    const runs = fixture.runs?.data || (Array.isArray(fixture.runs) ? fixture.runs : []);

    // Determine current innings and overs from runs data (fast, no balls needed)
    const innings2Runs = runs.find((r: any) => r.inning === 2);
    const innings1Runs = runs.find((r: any) => r.inning === 1);
    const currentInnings = innings2Runs ? 2 : 1;
    const currentInningsStr = currentInnings === 2 ? "S2" : "S1";
    const currentOver = currentInnings === 2
      ? Math.ceil(innings2Runs?.overs || 0)
      : Math.ceil(innings1Runs?.overs || 0);

    const lastProcessed = lastProcessedOver.get(match.id) || { innings: 0, over: 0 };

    // === ALWAYS update live score on every poll (every 30s) ===
    const liveScore: Record<string, unknown> = {
      ...(match.scoreData || {}),
      lastUpdated: new Date().toISOString(),
      currentInnings,
      currentOver,
    };

    for (const r of runs) {
      const key = r.inning === 1 ? "innings1" : "innings2";
      liveScore[key] = {
        score: r.score,
        wickets: r.wickets,
        overs: r.overs,
        teamId: r.team_id,
      };
    }

    await match.update({ scoreData: liveScore });
    io.emit("scoreUpdate", {
      matchId: match.id,
      innings: currentInnings,
      over: currentOver,
      scoreData: liveScore,
    });

    // Log score every poll
    const inn1 = liveScore.innings1 as any;
    const inn2 = liveScore.innings2 as any;
    const scoreLog = inn1 ? `${inn1.score}/${inn1.wickets} (${inn1.overs} ov)` : "0/0";
    const scoreLog2 = inn2 ? ` | Inn2: ${inn2.score}/${inn2.wickets} (${inn2.overs} ov)` : "";
    console.log(`[Sportsmonk] ${match.team1Short} vs ${match.team2Short} — Inn1: ${scoreLog}${scoreLog2} | Over ${currentOver}`);

    // Check if match ended
    if (fixture.status === "Finished") {
      if (match.status !== "completed") {
        await match.update({ status: "completed", currentPhase: "completed" as any });

        // === Resolve pre-match predictions using Sportmonks data ===
        try {
          // Fetch full fixture data for resolution (balls needed for sixes/wicket type)
          const fullFixture = await fetchFixtureWithBalls(fixtureId);
          const allBalls: BallData[] = fullFixture?.balls?.data || [];

          const preMatchPreds = await Prediction.findAll({
            where: { matchId: match.id, category: "pre_match", status: "open" },
          });

          for (const pred of preMatchPreds) {
            const correctOption = resolvePreMatchPrediction(
              pred, fixture, match, allBalls
            );
            if (correctOption) {
              await resolvePrediction(pred, correctOption, io);
              console.log(`[Sportsmonk] Pre-match resolved: "${pred.question}" → ${correctOption}`);
            }
          }

          // Resolve any remaining open per-over predictions (last over)
          const openOverPreds = await Prediction.findAll({
            where: { matchId: match.id, category: "per_over", status: "open" },
          });
          for (const pred of openOverPreds) {
            const overNum = pred.overNumber || 0;
            if (overNum > 0) {
              const innings = pred.round <= 3 ? "S1" : "S2";
              const overStats = computeOverStats(allBalls, overNum, innings);
              const correctOption = resolveOverPredictionFromStats(pred, overStats);
              if (correctOption) {
                await resolvePrediction(pred, correctOption, io);
                console.log(`[Sportsmonk] End-match over ${overNum} resolved: "${pred.question}" → ${correctOption}`);
              }
            }
          }

          // Also resolve any open hot_take and rivalry_call predictions
          const otherOpenPreds = await Prediction.findAll({
            where: { matchId: match.id, category: ["hot_take", "rivalry_call"], status: "open" },
          });
          for (const pred of otherOpenPreds) {
            const correctOption = resolveEndOfMatchPrediction(pred, fixture, match, runs, allBalls);
            if (correctOption) {
              await resolvePrediction(pred, correctOption, io);
              console.log(`[Sportsmonk] End-match resolved: "${pred.question}" → ${correctOption}`);
            }
          }
        } catch (resolveErr) {
          console.error("[Sportsmonk] Error resolving pre-match predictions:", resolveErr);
        }

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
        console.log(`[Sportsmonk] Match ${match.id} ended — all predictions resolved`);
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

    // === Over-completion logic: resolve predictions & generate new ones ===
    if (currentOver > lastProcessed.over || currentInnings > lastProcessed.innings) {
      try {
        const completedOver = currentInnings > lastProcessed.innings
          ? lastProcessed.over // last over of previous innings
          : currentOver - 1;

        if (completedOver > 0) {
          console.log(`[Sportsmonk] Over ${completedOver} completed — fetching ball-by-ball data...`);

          // Slow fetch: get ball-by-ball data only when an over completes
          const fixtureWithBalls = await fetchFixtureWithBalls(fixtureId);
          const balls: BallData[] = fixtureWithBalls?.balls?.data || [];

          const prevInningsStr = currentInnings > lastProcessed.innings ? "S1" : currentInningsStr;
          const overStats = computeOverStats(balls, completedOver, prevInningsStr);

          console.log(`[Sportsmonk] Over ${completedOver}: ${overStats.runs} runs, ${overStats.wickets} wkts, ${overStats.sixes} sixes`);

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
      } catch (overErr) {
        console.error(`[Sportsmonk] Error processing over change for ${match.team1Short} vs ${match.team2Short}:`, overErr);
      }

      // Update tracking
      lastProcessedOver.set(match.id, { innings: currentInnings, over: currentOver });
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

// Resolve pre-match predictions when match finishes
function resolvePreMatchPrediction(
  prediction: Prediction,
  fixture: any,
  match: Match,
  allBalls: BallData[]
): string | null {
  const q = prediction.question.toLowerCase();
  const options = prediction.options;

  // Q1: "Who wins tonight?"
  if (q.includes("who wins")) {
    const winnerTeamId = fixture.winner_team_id;
    if (!winnerTeamId) return null;

    // Match team IDs from scoreData to determine which short name won
    const scoreData = match.scoreData as any;
    const inn1TeamId = scoreData?.innings1?.teamId;
    const inn2TeamId = scoreData?.innings2?.teamId;

    // Determine winner short name by matching team IDs
    let winnerShort: string | null = null;
    if (winnerTeamId === inn1TeamId) {
      // First batting team won — that's localteam in most cases
      winnerShort = match.team1Short;
    } else if (winnerTeamId === inn2TeamId) {
      winnerShort = match.team2Short;
    }

    // Also check fixture's localteam_id/visitorteam_id
    if (!winnerShort) {
      if (winnerTeamId === fixture.localteam_id) {
        winnerShort = match.team1Short;
      } else if (winnerTeamId === fixture.visitorteam_id) {
        winnerShort = match.team2Short;
      }
    }

    if (winnerShort) {
      return winnerShort.toLowerCase();
    }
    return null;
  }

  // Q2: "Pick your man of the match"
  if (q.includes("man of the match") || q.includes("steals the show")) {
    const motmId = fixture.man_of_match_id;
    if (!motmId) return null;

    // Try to match MOTM player from options by checking all players
    // Since we store player names as keys, we need to check Sportmonks MOTM
    // For now, return null if we can't match (MOTM name not easily available from fixture alone)
    // We'd need to fetch the player endpoint — skip for now unless we have the name
    return null;
  }

  // Q3: "Toss time — who wins and what do they pick?"
  if (q.includes("toss")) {
    const tossWinnerId = fixture.toss_won_team_id;
    const elected = fixture.elected; // "batting" or "bowling"
    if (!tossWinnerId || !elected) return null;

    let tossWinnerShort: string | null = null;
    if (tossWinnerId === fixture.localteam_id) {
      tossWinnerShort = match.team1Short;
    } else if (tossWinnerId === fixture.visitorteam_id) {
      tossWinnerShort = match.team2Short;
    }

    if (tossWinnerShort) {
      const decision = elected === "batting" ? "bat" : "field";
      return `${tossWinnerShort.toLowerCase()}_${decision}`;
    }
    return null;
  }

  // Q4: "Which team hits more sixes?"
  if (q.includes("more sixes")) {
    let team1Sixes = 0;
    let team2Sixes = 0;

    for (const b of allBalls) {
      if (b.score?.six) {
        if (b.scoreboard === "S1") team1Sixes++;
        else if (b.scoreboard === "S2") team2Sixes++;
      }
    }

    // Team batting first in S1 — map to team short names
    const scoreData = match.scoreData as any;
    const inn1TeamId = scoreData?.innings1?.teamId;

    if (inn1TeamId === fixture.localteam_id) {
      // team1 batted first (S1), team2 batted second (S2)
      return team1Sixes >= team2Sixes
        ? match.team1Short.toLowerCase()
        : match.team2Short.toLowerCase();
    } else {
      // team2 batted first (S1), team1 batted second (S2)
      return team2Sixes >= team1Sixes
        ? match.team1Short.toLowerCase()
        : match.team2Short.toLowerCase();
    }
  }

  // Q5: "First wicket — how does it fall?"
  if (q.includes("first wicket")) {
    // Find the first ball with a wicket
    const wicketBall = allBalls.find((b) => b.score?.is_wicket || b.score?.out || b.batsmanout_id);
    if (!wicketBall) return null;

    const dismissalName = (wicketBall.score?.name || "").toLowerCase();

    if (dismissalName.includes("run out")) return "run_out";
    if (dismissalName.includes("stumped") || dismissalName.includes("stumping")) return "stumped";
    if (dismissalName.includes("lbw") || dismissalName.includes("leg before")) return "lbw";
    if (dismissalName.includes("bowled")) return "bowled";
    if (dismissalName.includes("caught")) return "caught";

    // Default to caught if we can't determine
    return "caught";
  }

  return null;
}

// Resolve hot_take and rivalry_call predictions at end of match
function resolveEndOfMatchPrediction(
  prediction: Prediction,
  fixture: any,
  match: Match,
  runs: any[],
  allBalls: BallData[]
): string | null {
  const q = prediction.question.toLowerCase();

  // "Total first innings score"
  if (q.includes("total first innings score") || q.includes("gut say")) {
    const inn1 = runs.find((r: any) => r.inning === 1);
    if (!inn1) return null;
    const score = inn1.score;
    if (score < 150) return "low";
    if (score <= 175) return "par";
    if (score <= 200) return "high";
    return "massive";
  }

  // "Will the match go to the last over?"
  if (q.includes("last over")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    if (!inn2) return "no";
    return inn2.overs >= 19 ? "yes" : "no";
  }

  // "How many wickets fall in the chase by over 15?"
  if (q.includes("wickets fall in the chase")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    if (!inn2) return "0_2";
    // Count wickets in 2nd innings up to over 15
    const inn2Balls = allBalls.filter((b) => b.scoreboard === "S2" && b.ball < 15);
    let wkts = 0;
    for (const b of inn2Balls) {
      if (b.score?.is_wicket || b.batsmanout_id) wkts++;
    }
    if (wkts <= 2) return "0_2";
    if (wkts <= 4) return "3_4";
    if (wkts <= 6) return "5_6";
    return "7_plus";
  }

  // "More runs in the powerplay — first 3 overs or last 3?"
  if (q.includes("powerplay") && q.includes("first 3")) {
    let first3 = 0, last3 = 0;
    for (const b of allBalls) {
      if (b.scoreboard !== "S1") continue;
      const overIdx = Math.floor(b.ball);
      if (overIdx < 3) first3 += b.score?.runs || 0;
      else if (overIdx < 6) last3 += b.score?.runs || 0;
    }
    return first3 >= last3 ? "first_3" : "last_3";
  }

  // "Biggest over in the death — how many runs?"
  if (q.includes("biggest over in the death")) {
    let maxOverRuns = 0;
    for (let ov = 16; ov <= 20; ov++) {
      let overRuns = 0;
      const prefix = String(ov - 1);
      for (const b of allBalls) {
        if (b.scoreboard !== "S2") continue;
        if (String(b.ball).split(".")[0] === prefix) {
          overRuns += b.score?.runs || 0;
        }
      }
      maxOverRuns = Math.max(maxOverRuns, overRuns);
    }
    if (maxOverRuns < 10) return "under_10";
    if (maxOverRuns <= 15) return "10_15";
    if (maxOverRuns <= 20) return "16_20";
    return "20_plus";
  }

  // "Chase done in which phase?"
  if (q.includes("chase done in which phase") || q.includes("need")) {
    const inn2 = runs.find((r: any) => r.inning === 2);
    const inn1 = runs.find((r: any) => r.inning === 1);
    if (!inn2 || !inn1) return "not_chased";

    // Did chasing team win?
    if (fixture.winner_team_id !== inn2.team_id) return "not_chased";

    const overs = inn2.overs;
    if (overs <= 6) return "powerplay";
    if (overs <= 15) return "middle";
    return "death";
  }

  return null;
}
