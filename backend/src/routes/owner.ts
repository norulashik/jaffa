import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Op } from "sequelize";
import { Venue, User, Match, MatchParticipant, Prediction, UserPrediction, Reward } from "../models";
import { authenticateOwner, AuthRequest } from "../middleware/auth";
import { fetchTodayFixtures, fetchTeamData } from "../services/sportsmonkApi";
import { generatePreMatchPredictions } from "../services/predictionEngine";
import { resolvePrediction } from "../services/pointsEngine";
import { JWT_SECRET, OWNER_USER, OWNER_PASS } from "../config/secrets";
import { parsePagination, paginationMeta } from "../utils/pagination";

const router = Router();

// Brute-force guard on owner login. 5 attempts / 15 min / IP.
const ownerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

// ── Owner Authentication ─────────────────────────────────────────

router.post("/login", ownerLoginLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (username !== OWNER_USER || password !== OWNER_PASS) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { ownerId: "owner", type: "owner" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ token });
  } catch (error) {
    console.error("Owner login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ── Global Stats ─────────────────────────────────────────────────

router.get("/stats", authenticateOwner, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalVenues, activeVenues, pendingVenues, totalPlayers, totalMatches, totalPredictions, liveMatches] =
      await Promise.all([
        Venue.count(),
        Venue.count({ where: { isActive: true, approvalStatus: "approved" } }),
        Venue.count({ where: { approvalStatus: "pending" } }),
        User.count(),
        Match.count(),
        UserPrediction.count(),
        Match.count({ where: { status: "live" } }),
      ]);

    res.json({ totalVenues, activeVenues, pendingVenues, totalPlayers, totalMatches, totalPredictions, liveMatches });
  } catch (error) {
    console.error("Owner stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// ── Venue Management ─────────────────────────────────────────────

router.get("/venues", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string || "all";
    const search = req.query.search as string || "";

    const where: any = {};
    if (status !== "all") where.approvalStatus = status;
    if (search) where.name = { [Op.iLike]: `%${search}%` };

    const venues = await Venue.findAll({
      where,
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    });

    res.json(venues);
  } catch (error) {
    console.error("Owner venues error:", error);
    res.status(500).json({ error: "Failed to get venues" });
  }
});

router.patch("/venues/:venueId/approve", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venue = await Venue.findByPk(req.params.venueId as string);
    if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

    await venue.update({ approvalStatus: "approved", isActive: true });
    res.json({ message: "Venue approved", venue: { id: venue.id, name: venue.name, approvalStatus: venue.approvalStatus } });
  } catch (error) {
    console.error("Approve venue error:", error);
    res.status(500).json({ error: "Failed to approve venue" });
  }
});

router.patch("/venues/:venueId/reject", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venue = await Venue.findByPk(req.params.venueId as string);
    if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

    await venue.update({ approvalStatus: "rejected" });
    res.json({ message: "Venue rejected", venue: { id: venue.id, name: venue.name, approvalStatus: venue.approvalStatus } });
  } catch (error) {
    console.error("Reject venue error:", error);
    res.status(500).json({ error: "Failed to reject venue" });
  }
});

router.patch("/venues/:venueId/deactivate", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venue = await Venue.findByPk(req.params.venueId as string);
    if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

    await venue.update({ isActive: false });
    res.json({ message: "Venue deactivated" });
  } catch (error) {
    console.error("Deactivate venue error:", error);
    res.status(500).json({ error: "Failed to deactivate venue" });
  }
});

router.patch("/venues/:venueId/reactivate", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venue = await Venue.findByPk(req.params.venueId as string);
    if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

    await venue.update({ isActive: true });
    res.json({ message: "Venue reactivated" });
  } catch (error) {
    console.error("Reactivate venue error:", error);
    res.status(500).json({ error: "Failed to reactivate venue" });
  }
});

// ── Per-Venue Drill-Down ─────────────────────────────────────────

router.get("/venues/:venueId/detail", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venue = await Venue.findByPk(req.params.venueId as string, {
      attributes: { exclude: ["password"] },
    });
    if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

    const [totalPlayers, totalMatches, totalRewards, redeemedRewards] = await Promise.all([
      MatchParticipant.count({ where: { venueId: venue.id }, distinct: true, col: "userId" }),
      MatchParticipant.count({ where: { venueId: venue.id }, distinct: true, col: "matchId" }),
      Reward.count({ where: { venueId: venue.id } }),
      Reward.count({ where: { venueId: venue.id, status: "redeemed" } }),
    ]);

    res.json({ venue, totalPlayers, totalMatches, totalRewards, redeemedRewards });
  } catch (error) {
    console.error("Venue detail error:", error);
    res.status(500).json({ error: "Failed to get venue detail" });
  }
});

router.get("/venues/:venueId/matches", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.params.venueId as string;

    // Get distinct matchIds for this venue
    const participants = await MatchParticipant.findAll({
      where: { venueId },
      attributes: ["matchId"],
      group: ["matchId"],
    });
    const matchIds = participants.map((p: any) => p.matchId);

    if (matchIds.length === 0) { res.json([]); return; }

    const matches = await Match.findAll({
      where: { id: matchIds },
      order: [["startTime", "DESC"]],
    });

    // Get player counts per match
    const counts = await MatchParticipant.findAll({
      where: { venueId, matchId: matchIds },
      attributes: ["matchId", [MatchParticipant.sequelize!.fn("COUNT", MatchParticipant.sequelize!.col("id")), "playerCount"]],
      group: ["matchId"],
    });
    const countMap: Record<string, number> = {};
    counts.forEach((c: any) => { countMap[c.matchId] = parseInt(c.getDataValue("playerCount")); });

    const result = matches.map((m: any) => ({
      ...m.toJSON(),
      playerCount: countMap[m.id] || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error("Venue matches error:", error);
    res.status(500).json({ error: "Failed to get venue matches" });
  }
});

router.get("/venues/:venueId/leaderboard", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.params.venueId as string;
    const matchId = req.query.matchId as string;
    const p = parsePagination(req);

    const where: any = { venueId };
    if (matchId) where.matchId = matchId;

    const { count, rows: players } = await MatchParticipant.findAndCountAll({
      where,
      order: [["totalPoints", "DESC"]],
      limit: p.limit,
      offset: p.offset,
      include: [{ model: User, as: "user", attributes: ["displayName", "avatarConfig"] }],
    });

    const leaderboard = players.map((row: any, i: number) => ({
      rank: p.offset + i + 1,
      userId: row.userId,
      displayName: row.user?.displayName || "Player",
      avatarConfig: row.user?.avatarConfig || null,
      totalPoints: row.totalPoints,
      correctPredictions: row.correctPredictions,
      totalPredictions: row.totalPredictions,
      currentStreak: row.currentStreak,
    }));

    res.json({ leaderboard, ...paginationMeta(p, count) });
  } catch (error) {
    console.error("Venue leaderboard error:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

router.get("/venues/:venueId/rewards", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const venueId = req.params.venueId as string;
    const matchId = req.query.matchId as string;

    const where: any = { venueId };
    if (matchId) where.matchId = matchId;

    const rewards = await Reward.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: 100,
      include: [{ model: User, as: "user", attributes: ["displayName"] }],
    });

    res.json(rewards);
  } catch (error) {
    console.error("Venue rewards error:", error);
    res.status(500).json({ error: "Failed to get rewards" });
  }
});

// ── Match Management ─────────────────────────────────────────────

router.get("/matches", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = parsePagination(req);
    const { count, rows: matches } = await Match.findAndCountAll({
      order: [["startTime", "DESC"]],
      limit: p.limit,
      offset: p.offset,
    });
    res.json({ matches, ...paginationMeta(p, count) });
  } catch (error) {
    console.error("Owner matches error:", error);
    res.status(500).json({ error: "Failed to get matches" });
  }
});

router.get("/cricket/fixtures", authenticateOwner, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fixtures = await fetchTodayFixtures();
    res.json(fixtures);
  } catch (error) {
    console.error("Fetch fixtures error:", error);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

router.post("/cricket/import/:fixtureId", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fixtureId = req.params.fixtureId as string;

    const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
    const API_TOKEN = process.env.SPORTSMONK_API_KEY || "";

    const fixtureRes = await fetch(`${API_BASE}/fixtures/${fixtureId}?api_token=${API_TOKEN}`);
    const fixtureData: any = await fixtureRes.json();
    const fixture = fixtureData.data;

    if (!fixture) { res.status(404).json({ error: "Fixture not found" }); return; }

    const existing = await Match.findOne({ where: { externalId: fixtureId } });
    if (existing) { res.json({ message: "Already imported", match: existing }); return; }

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

    const preMatchQuestions = generatePreMatchPredictions(
      match.id, match.team1, match.team2,
      match.team1Short, match.team2Short,
      match.team1Players, match.team2Players
    );
    for (const q of preMatchQuestions) {
      await Prediction.create(q as any);
    }

    res.status(201).json({ message: "Match imported", match, predictionsGenerated: preMatchQuestions.length });
  } catch (error) {
    console.error("Owner import fixture error:", error);
    res.status(500).json({ error: "Failed to import fixture" });
  }
});

router.post("/cricket/poll", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pollSportsmonkUpdates } = await import("../services/sportsmonkApi");
    const io = req.app.get("io");
    await pollSportsmonkUpdates(io);
    res.json({ message: "Poll completed" });
  } catch (error) {
    console.error("Owner poll error:", error);
    res.status(500).json({ error: "Failed to poll" });
  }
});

router.post("/predictions/:predictionId/resolve", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const predictionId = req.params.predictionId as string;
    const { correctOption } = req.body;

    const prediction = await Prediction.findByPk(predictionId);
    if (!prediction) { res.status(404).json({ error: "Prediction not found" }); return; }

    const io = req.app.get("io");
    await resolvePrediction(prediction, correctOption, io);

    res.json({ message: "Prediction resolved" });
  } catch (error) {
    console.error("Owner resolve prediction error:", error);
    res.status(500).json({ error: "Failed to resolve prediction" });
  }
});

export default router;
