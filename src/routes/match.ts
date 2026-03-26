import { Router, Request, Response } from "express";
import { Match, MatchParticipant, Prediction, UserPrediction } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { fetchUpcomingFixtures, fetchSportsmonkLiveScores } from "../services/sportsmonkApi";
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
        const lt = f.localteam?.data || f.localteam || {};
        const vt = f.visitorteam?.data || f.visitorteam || {};
        const localTeam = lt.name || `Team ${f.localteam_id}`;
        const visitorTeam = vt.name || `Team ${f.visitorteam_id}`;
        const localCode = lt.code || localTeam.slice(0, 3).toUpperCase();
        const visitorCode = vt.code || visitorTeam.slice(0, 3).toUpperCase();

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
          team1Img: lt.image_path || null,
          team2Img: vt.image_path || null,
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

    // 4. Merge and sort by date (earliest first)
    const allMatches = [
      ...dbMatches.map((m) => ({ ...m.toJSON(), source: "local" })),
      ...sportsmonkMatches,
    ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

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

    const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
    const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

    const fixtureRes = await fetch(`${API_BASE}/fixtures/${fixtureId}?api_token=${API_TOKEN}`);
    const fixtureData: any = await fixtureRes.json();
    const fixture = fixtureData.data;

    if (!fixture) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }

    const [team1Res, team2Res] = await Promise.all([
      fetch(`${API_BASE}/teams/${fixture.localteam_id}?api_token=${API_TOKEN}`),
      fetch(`${API_BASE}/teams/${fixture.visitorteam_id}?api_token=${API_TOKEN}`),
    ]);
    const team1Data: any = await team1Res.json();
    const team2Data: any = await team2Res.json();
    const team1 = team1Data.data;
    const team2 = team2Data.data;

    const match = await Match.create({
      externalId: fixtureId,
      team1: team1?.name || `Team ${fixture.localteam_id}`,
      team2: team2?.name || `Team ${fixture.visitorteam_id}`,
      team1Short: team1?.code || "T1",
      team2Short: team2?.code || "T2",
      team1Players: [],
      team2Players: [],
      startTime: new Date(fixture.starting_at),
      status: fixture.status === "Finished" ? "completed" : fixture.status === "NS" ? "upcoming" : "live",
      scoreData: {
        venue: fixture.venue_id,
        team1Img: team1?.image_path || "",
        team2Img: team2?.image_path || "",
      },
    });

    const preMatchQuestions = generatePreMatchPredictions(
      match.id, match.team1, match.team2,
      match.team1Short, match.team2Short,
      match.team1Players, match.team2Players
    );
    for (const q of preMatchQuestions) {
      await Prediction.create(q as any);
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

// Join a match at a venue (venueId optional for local testing)
router.post("/:matchId/join", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = req.body.venueId || "local-testing";
    const userId = req.userId!;

    const match = await Match.findByPk(matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const existing = await MatchParticipant.findOne({
      where: { userId, matchId, venueId },
    });

    if (existing) {
      res.json({ participant: existing, message: "Already joined" });
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
  } catch (error: any) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      const existing = await MatchParticipant.findOne({ where: { userId: req.userId!, matchId: req.params.matchId as string, venueId: req.body.venueId } });
      res.json({ participant: existing, message: "Already joined" });
      return;
    }
    console.error("Join match error:", error);
    res.status(500).json({ error: "Failed to join match" });
  }
});

// Get match state for a user
router.get("/:matchId/state", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = (req.query.venueId as string) || "local-testing";
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

    const userAnswers = await UserPrediction.findAll({
      where: { userId, matchId },
      attributes: ["predictionId"],
    });
    const answeredIds = new Set(userAnswers.map((a) => a.predictionId));
    const openWithAnswerStatus = openPredictions.map((p) => ({
      ...p.toJSON(),
      userAnswered: answeredIds.has(p.id),
    }));

    const playerCount = await MatchParticipant.count({
      where: { matchId, venueId },
    });

    res.json({ match, participant, openPredictions: openWithAnswerStatus, playerCount });
  } catch (error) {
    console.error("Get match state error:", error);
    res.status(500).json({ error: "Failed to get match state" });
  }
});

export default router;
