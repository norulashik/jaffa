import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Op, fn, col, literal } from "sequelize";
import { Venue, User, Match, MatchParticipant, Prediction, UserPrediction, Reward } from "../models";
import { authenticateOwner, AuthRequest } from "../middleware/auth";
import { fetchTodayFixtures, fetchTeamData } from "../services/sportsmonkApi";
import { generatePreMatchPredictions, getCurrentRound } from "../services/predictionEngine";
import { resolvePrediction } from "../services/pointsEngine";
import { JWT_SECRET, OWNER_USER, OWNER_PASS } from "../config/secrets";
import { parsePagination, paginationMeta } from "../utils/pagination";
import { reResolvePrediction } from "../services/pointsEngine";
import { reResolvePunterCardAnswer } from "../services/punterCard";

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

// ── Kong Question (admin-fired ad-hoc predictions) ───────────────

const KONG_DEFAULT_WINDOW_MS = 90 * 1000;
const KONG_OPTION_LIMIT = 6;

// Validate the option list passed by the admin: must be 2-6 entries, each
// with a non-empty label and a points value in [1, 500]. Returns a cleaned
// option array with stable opt_N keys, or throws with a 400-friendly message.
function buildKongOptions(input: unknown): { key: string; label: string; points: number }[] {
  if (!Array.isArray(input)) throw new Error("options must be an array");
  if (input.length < 2 || input.length > KONG_OPTION_LIMIT) {
    throw new Error(`options must have between 2 and ${KONG_OPTION_LIMIT} entries`);
  }
  return input.map((raw, i) => {
    const label = typeof raw?.label === "string" ? raw.label.trim() : "";
    const points = Number(raw?.points);
    if (!label) throw new Error(`option ${i + 1} must have a non-empty label`);
    if (!Number.isFinite(points) || points < 1 || points > 500) {
      throw new Error(`option ${i + 1} points must be between 1 and 500`);
    }
    return { key: `opt_${i}`, label, points };
  });
}

router.post("/kong/:matchId", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const { question, options } = req.body as { question?: string; options?: unknown };

    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    if (match.status === "completed") {
      res.status(400).json({ error: "Cannot fire Kong on a completed match" });
      return;
    }

    const trimmedQuestion = typeof question === "string" ? question.trim() : "";
    if (!trimmedQuestion) {
      res.status(400).json({ error: "Question text is required" });
      return;
    }

    let cleanedOptions: { key: string; label: string; points: number }[];
    try {
      cleanedOptions = buildKongOptions(options);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Invalid options" });
      return;
    }

    // Tie the prediction to whichever round the match is currently in. For
    // upcoming matches this is round 0 (pre-match); resolvePrediction reads
    // round to credit the correct round-N points bucket.
    const round = match.status === "live"
      ? getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers)
      : 0;

    const now = new Date();
    const prediction = await Prediction.create({
      matchId,
      category: "kong",
      round,
      question: trimmedQuestion,
      options: cleanedOptions,
      status: "open",
      opensAt: now,
      expiresAt: new Date(now.getTime() + KONG_DEFAULT_WINDOW_MS),
    } as any);

    // Same socket channel every other prediction uses → user clients refetch
    // /api/predictions and the Kong card lands in their feed within the next
    // tick.
    const io = req.app.get("io");
    io.to(`match:${matchId}`).emit("newPrediction", {
      matchId,
      type: "kong",
      predictionId: prediction.id,
    });

    res.status(201).json({ prediction });
  } catch (error) {
    console.error("Owner kong create error:", error);
    res.status(500).json({ error: "Failed to fire Kong question" });
  }
});

router.get("/kong/:matchId", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;

    const predictions = await Prediction.findAll({
      where: { matchId, category: "kong" },
      order: [["createdAt", "DESC"]],
    });

    if (predictions.length === 0) {
      res.json({ predictions: [] });
      return;
    }

    // Aggregate response counts by selectedOption per Kong predictionId in a
    // single grouped query — avoids an N+1 even with several Kongs per match.
    const tallies = await UserPrediction.findAll({
      where: { predictionId: { [Op.in]: predictions.map((p) => p.id) } },
      attributes: [
        "predictionId",
        "selectedOption",
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["predictionId", "selectedOption"],
      raw: true,
    }) as unknown as { predictionId: string; selectedOption: string; count: string | number }[];

    const tallyMap = new Map<string, Record<string, number>>();
    for (const row of tallies) {
      const inner = tallyMap.get(row.predictionId) || {};
      inner[row.selectedOption] = Number(row.count);
      tallyMap.set(row.predictionId, inner);
    }

    res.json({
      predictions: predictions.map((p) => ({
        ...p.toJSON(),
        responses: tallyMap.get(p.id) || {},
        totalResponses: Object.values(tallyMap.get(p.id) || {}).reduce((a, b) => a + b, 0),
      })),
    });
  } catch (error) {
    console.error("Owner kong list error:", error);
    res.status(500).json({ error: "Failed to list Kong questions" });
  }
});

router.post("/kong/:predictionId/resolve", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const predictionId = req.params.predictionId as string;
    const { correctOption } = req.body as { correctOption?: string };

    if (!correctOption || typeof correctOption !== "string") {
      res.status(400).json({ error: "correctOption is required" });
      return;
    }

    const prediction = await Prediction.findByPk(predictionId);
    if (!prediction) { res.status(404).json({ error: "Prediction not found" }); return; }

    // Category guard: this endpoint resolves Kong questions only. The generic
    // /predictions/:id/resolve above handles everything else; keeping these
    // separate prevents the admin from accidentally resolving (and re-paying)
    // a per-over question through the Kong UI.
    if (prediction.category !== "kong") {
      res.status(400).json({ error: "Endpoint only resolves Kong questions" });
      return;
    }
    if (prediction.status === "resolved") {
      res.status(400).json({ error: "Already resolved" });
      return;
    }

    const validKeys = new Set(prediction.options.map((o) => o.key));
    if (!validKeys.has(correctOption)) {
      res.status(400).json({ error: "correctOption must match one of the option keys" });
      return;
    }

    const io = req.app.get("io");
    await resolvePrediction(prediction, correctOption, io);

    res.json({ resolved: true });
  } catch (error) {
    console.error("Owner kong resolve error:", error);
    res.status(500).json({ error: "Failed to resolve Kong question" });
  }
});

// ── Punter Card Admin (match-wise list + per-question override) ──

router.get("/punter-cards/:matchId", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;

    const predictions = await Prediction.findAll({
      where: { matchId, category: "punter_card" },
      order: [["createdAt", "ASC"]],
    });

    if (predictions.length === 0) {
      res.json({ predictions: [] });
      return;
    }

    // Single grouped query for per-option vote tallies — same shape the Kong
    // list endpoint uses; avoids an N+1 across 10 punter card questions.
    const tallies = await UserPrediction.findAll({
      where: { predictionId: { [Op.in]: predictions.map((p) => p.id) } },
      attributes: [
        "predictionId",
        "selectedOption",
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["predictionId", "selectedOption"],
      raw: true,
    }) as unknown as { predictionId: string; selectedOption: string; count: string | number }[];

    const tallyMap = new Map<string, Record<string, number>>();
    for (const row of tallies) {
      const inner = tallyMap.get(row.predictionId) || {};
      inner[row.selectedOption] = Number(row.count);
      tallyMap.set(row.predictionId, inner);
    }

    res.json({
      predictions: predictions.map((p) => ({
        ...p.toJSON(),
        responses: tallyMap.get(p.id) || {},
        totalResponses: Object.values(tallyMap.get(p.id) || {}).reduce((a, b) => a + b, 0),
      })),
    });
  } catch (error) {
    console.error("Owner punter-cards list error:", error);
    res.status(500).json({ error: "Failed to list punter cards" });
  }
});

router.post("/punter-cards/:predictionId/override", authenticateOwner, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const predictionId = req.params.predictionId as string;
    const { correctOption } = req.body as { correctOption?: string };

    if (!correctOption || typeof correctOption !== "string") {
      res.status(400).json({ error: "correctOption is required" });
      return;
    }

    const prediction = await Prediction.findByPk(predictionId);
    if (!prediction) { res.status(404).json({ error: "Prediction not found" }); return; }

    // Category guard: this endpoint mutates punter card answers only. Other
    // prediction types (per_over, hot_take, …) shouldn't be overridable from
    // a UI advertising "Punter Card Admin".
    if (prediction.category !== "punter_card") {
      res.status(400).json({ error: "Endpoint only overrides punter card questions" });
      return;
    }

    const validKeys = new Set(prediction.options.map((o) => o.key));
    if (!validKeys.has(correctOption)) {
      res.status(400).json({ error: "correctOption must match one of the option keys" });
      return;
    }

    const io = req.app.get("io");

    // First-time resolution vs override:
    //   - resolvePrediction throws on already-resolved predictions, so we
    //     can't reuse it for overrides.
    //   - For punter cards specifically, reResolvePrediction (which routes
    //     through recomputeParticipantScores) doesn't work either: it walks
    //     UserPredictions via MatchParticipant scope and skips users who
    //     answered the punter card before joining the live match, AND it
    //     doesn't update User.weeklyPoints / lifetimePoints. The dedicated
    //     reResolvePunterCardAnswer helper handles both gaps with proper
    //     delta math.
    if (prediction.status === "resolved") {
      const changed = await reResolvePunterCardAnswer(prediction, correctOption, io);
      res.json({ changed });
    } else {
      await resolvePrediction(prediction, correctOption, io);
      res.json({ changed: true });
    }
    // Suppress unused-import warning when the generic helper isn't reached.
    void reResolvePrediction;
  } catch (error: any) {
    console.error("Owner punter-cards override error:", error);
    res.status(500).json({ error: error?.message || "Failed to override punter card answer" });
  }
});

// Suppress an unused-import warning when sequelize literal isn't used downstream.
void literal;

export default router;
