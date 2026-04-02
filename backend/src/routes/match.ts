import { Router, Request, Response } from "express";
import { Match, MatchParticipant, Prediction, MatchCode } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { fetchUpcomingFixtures, fetchSportsmonkLiveScores, fetchTeamData } from "../services/sportsmonkApi";
import { generatePreMatchPredictions } from "../services/predictionEngine";

const router = Router();

// Get current/upcoming matches — merges local DB + live Sportsmonk data
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    // 1. Local DB matches (already imported)
    const dbMatches = await Match.findAll({
      where: { status: ["upcoming", "live"] },
      order: [["startTime", "ASC"]],
    });

    // 2. Fetch live + upcoming from Sportsmonk
    const [liveFixtures, upcomingFixtures] = await Promise.all([
      fetchSportsmonkLiveScores(),
      fetchUpcomingFixtures(),
    ]);
    console.log(`[Matches] DB: ${dbMatches.length}, Live: ${liveFixtures.length}, Upcoming: ${upcomingFixtures.length}`);

    // Collect external IDs already in DB to avoid duplicates
    const importedIds = new Set(
      dbMatches.filter((m) => m.externalId).map((m) => String(m.externalId))
    );

    // 3. Convert Sportsmonk fixtures to match-like objects for the frontend
    const sportsmonkMatches = [...liveFixtures, ...upcomingFixtures]
      .filter((f) => !importedIds.has(String(f.id)))
      // Deduplicate by fixture id
      .filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i)
      .map((f) => {
        const localTeam = f.localteam?.data?.name || `Team ${f.localteam_id}`;
        const visitorTeam = f.visitorteam?.data?.name || `Team ${f.visitorteam_id}`;
        const localCode = f.localteam?.data?.code || localTeam.slice(0, 3).toUpperCase();
        const visitorCode = f.visitorteam?.data?.code || visitorTeam.slice(0, 3).toUpperCase();

        const runs = f.runs?.data || (Array.isArray(f.runs) ? f.runs : []);
        const inn1 = runs.find((r: any) => r.inning === 1);
        const inn2 = runs.find((r: any) => r.inning === 2);

        let status = "upcoming";
        if (f.status === "Finished" || f.status === "Aban.") status = "completed";
        else if (f.status !== "NS") status = "live";

        return {
          id: `sportsmonk_${f.id}`,
          externalId: String(f.id),
          team1: localTeam,
          team2: visitorTeam,
          team1Short: localCode,
          team2Short: visitorCode,
          team1Img: f.localteam?.data?.image_path || null,
          team2Img: f.visitorteam?.data?.image_path || null,
          startTime: f.starting_at,
          status,
          note: f.note || null,
          venue: f.venue_id || null,
          score: inn1 ? `${inn1.score}/${inn1.wickets}` + (inn2 ? ` | ${inn2.score}/${inn2.wickets}` : "") : null,
          overs: inn1 ? String(inn2 ? inn2.overs : inn1.overs) : null,
          source: "sportsmonk",
        };
      })
      .filter((m) => m.status !== "completed");

    // 4. Merge and sort by startTime ascending (nearest first)
    const allMatches = [
      ...dbMatches.map((m) => ({ ...m.toJSON(), source: "local" })),
      ...sportsmonkMatches,
    ].sort((a, b) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return timeA - timeB;
    });

    res.json(allMatches);
  } catch (error) {
    console.error("Get matches error:", error);
    res.status(500).json({ error: "Failed to get matches" });
  }
});

// Auto-import a Sportsmonk fixture into local DB
router.post("/import/:fixtureId", async (req: Request, res: Response): Promise<void> => {
  try {
    const fixtureId = req.params.fixtureId as string;

    // Check if already imported
    const existing = await Match.findOne({ where: { externalId: fixtureId } });
    if (existing) {
      res.json({ match: existing });
      return;
    }

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

    // Get team names (uses cached team data)
    const [team1, team2] = await Promise.all([
      fetchTeamData(fixture.localteam_id),
      fetchTeamData(fixture.visitorteam_id),
    ]);

    const match = await Match.create({
      externalId: fixtureId,
      team1: team1.name,
      team2: team2.name,
      team1Short: team1.code || "T1",
      team2Short: team2.code || "T2",
      team1Players: [],
      team2Players: [],
      startTime: new Date(fixture.starting_at),
      status: fixture.status === "Finished" ? "completed" : fixture.status === "NS" ? "upcoming" : "live",
      scoreData: {
        venue: fixture.venue_id,
        team1Img: team1.image_path || "",
        team2Img: team2.image_path || "",
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

    // Pre-match question timing (same as admin.ts):
    // - Toss question: opens 45 min before match, locked when toss is detected by Sportsmonk
    // - Other 3 (winner, sixes, first wicket): start locked, unlocked after toss is detected
    if (match.startTime) {
      const opensAt = new Date(new Date(match.startTime).getTime() - 45 * 60_000);
      const preMatchPreds = await Prediction.findAll({
        where: { matchId: match.id, category: "pre_match" },
      });
      for (const pred of preMatchPreds) {
        if (pred.question.toLowerCase().includes("toss")) {
          await pred.update({ opensAt });
        } else {
          await pred.update({ status: "locked", opensAt });
        }
      }
    }

    console.log(`[Auto-Import] ${match.team1Short} vs ${match.team2Short} imported (${preMatchQuestions.length} predictions)`);
    res.status(201).json({ match });
  } catch (error) {
    console.error("Auto-import fixture error:", error);
    res.status(500).json({ error: "Failed to import fixture" });
  }
});

// Get match details
router.get("/:matchId", async (req: Request, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    res.json(match);
  } catch (error) {
    console.error("Get match error:", error);
    res.status(500).json({ error: "Failed to get match" });
  }
});

// Join a match at a venue
router.post("/:matchId/join", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const { venueId, matchCode } = req.body;
    const userId = req.userId!;

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    // Check if user already joined (no code needed for re-entry)
    const existing = await MatchParticipant.findOne({
      where: { userId, matchId, venueId },
    });

    if (existing) {
      res.json({ participant: existing, message: "Already joined" });
      return;
    }

    // Validate match code for new joins
    if (!matchCode) {
      res.status(403).json({ error: "Match code is required to join" });
      return;
    }

    const validCode = await MatchCode.findOne({
      where: { venueId, matchId, code: matchCode, isActive: true },
    });

    if (!validCode) {
      res.status(403).json({ error: "Invalid match code" });
      return;
    }

    const participant = await MatchParticipant.create({
      userId,
      matchId,
      venueId,
    });

    const io = req.app.get("io");
    const playerCount = await MatchParticipant.count({ where: { matchId, venueId } });
    io.to(`venue:${venueId}:${matchId}`).emit("playerCount", { count: playerCount });

    res.status(201).json({ participant });
  } catch (error) {
    console.error("Join match error:", error);
    res.status(500).json({ error: "Failed to join match" });
  }
});

// Get ball-by-ball log for display panel
router.get("/:matchId/balls", async (req: Request, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    const sd = (match.scoreData as Record<string, unknown>) || {};
    const currentInnings = (sd.currentInnings as number) || 1;

    // Collect all stored over ball chips into an ordered array (completed overs only)
    const overs: { overNumber: number; innings: number; balls: { label: string; type: string }[] }[] = [];
    const currentOver = (sd.currentOver as number) || 1;
    for (let inn = 1; inn <= currentInnings; inn++) {
      const maxOvers = 20;
      for (let ov = 1; ov <= maxOvers; ov++) {
        // Don't return the current in-progress over for the current innings
        if (inn === currentInnings && ov >= currentOver) continue;
        const key = `innings${inn}_over${ov}_balls`;
        if (sd[key]) {
          overs.push({ overNumber: ov, innings: inn, balls: sd[key] as { label: string; type: string }[] });
        }
      }
    }

    res.json({ overs, currentInnings, currentOver: sd.currentOver });
  } catch (error) {
    console.error("Get balls error:", error);
    res.status(500).json({ error: "Failed to get ball data" });
  }
});

// Get match state for a user
router.get("/:matchId/state", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = req.query.venueId as string;
    const userId = req.userId!;

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const participant = await MatchParticipant.findOne({
      where: { userId, matchId, venueId },
    });

    const openPredictions = await Prediction.findAll({
      where: { matchId, status: "open" },
      order: [["createdAt", "ASC"]],
    });

    const playerCount = await MatchParticipant.count({
      where: { matchId, venueId },
    });

    res.json({ match, participant, openPredictions, playerCount });
  } catch (error) {
    console.error("Get match state error:", error);
    res.status(500).json({ error: "Failed to get match state" });
  }
});

export default router;
