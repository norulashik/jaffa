import { Router, Request, Response } from "express";
import { Op } from "sequelize";
import { Match, MatchParticipant, Prediction, MatchCode, User, Venue, UserPrediction, PredictionAggregate, Room, RoomMember } from "../models";
import { authenticateUser, AuthRequest } from "../middleware/auth";
import { fetchUpcomingFixtures, fetchSportsmonkLiveScores, fetchTeamData } from "../services/sportsmonkApi";
import { generatePreMatchPredictions, getCurrentRound } from "../services/predictionEngine";
import { buildStory } from "../services/storyBuilder";
import { parsePagination, paginationMeta } from "../utils/pagination";
import { ROOM_VENUE_ID } from "../services/roomVenue";

const router = Router();

// Haversine — great-circle distance between two lat/lng points, in meters.
// Used to reject joins whose GPS is outside the venue's geofence.
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Server-side cache for the lobby payload. Lobby auto-polls every 15 s and
// every active client previously fired its own pair of Sportsmonk fetches —
// so 100 lobby users meant ~100× the upstream call rate. The cached payload
// is identical for everyone (no per-user data), so a single global cache
// with a 12 s TTL is enough; the 12 s sits comfortably below the 15 s lobby
// refresh so newly-published Sportsmonk fixtures still appear within one
// refresh cycle.
//
// `matchesInflight` collapses cache-cold concurrent requests into one
// upstream fetch — a thundering-herd of N users on app launch all await
// the same in-flight promise instead of firing N upstream pairs.
let matchesCache: { at: number; data: unknown } | null = null;
let matchesInflight: Promise<unknown> | null = null;
const MATCHES_CACHE_MS = 12_000;

// IPL franchise short codes — used to filter out non-IPL Match rows that
// were imported into the DB before the league filter shipped (or via a
// manual admin import). Match model has no league_id column, so team-short
// membership is the cheapest reliable signal. Both team shorts must be IPL
// for the match to render in the lobby.
const IPL_TEAM_SHORTS = new Set([
  "RCB", "GT", "MI", "CSK", "LSG", "RR", "SRH", "DC", "PBKS", "KKR",
]);
const isIplDbMatch = (m: { team1Short?: string | null; team2Short?: string | null }): boolean => {
  const t1 = (m.team1Short || "").toUpperCase();
  const t2 = (m.team2Short || "").toUpperCase();
  return IPL_TEAM_SHORTS.has(t1) && IPL_TEAM_SHORTS.has(t2);
};

async function buildMatchesPayload(): Promise<unknown> {
  // 1. Local DB matches (already imported). Filter out any non-IPL row
  //    that snuck in before the Sportsmonk-side league filter was added —
  //    those would otherwise render in the lobby alongside IPL fixtures.
  const dbMatchesAll = await Match.findAll({
    where: { status: ["upcoming", "live"] },
    order: [["startTime", "ASC"]],
  });
  const dbMatches = dbMatchesAll.filter(isIplDbMatch);

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
    ...dbMatches.map((m) => {
      const sd = (m.scoreData as any) || {};
      return {
        ...m.toJSON(),
        team1Img: sd.team1Img || null,
        team2Img: sd.team2Img || null,
        source: "local",
      };
    }),
    ...sportsmonkMatches,
  ].sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeA - timeB;
  });

  return allMatches;
}

async function getMatchesPayload(): Promise<unknown> {
  const now = Date.now();
  if (matchesCache && now - matchesCache.at < MATCHES_CACHE_MS) {
    return matchesCache.data;
  }
  // In-flight dedup: if a fetch is already running, every concurrent caller
  // awaits the same promise instead of starting a parallel upstream call.
  if (matchesInflight) return matchesInflight;
  matchesInflight = (async () => {
    try {
      const data = await buildMatchesPayload();
      matchesCache = { at: Date.now(), data };
      return data;
    } finally {
      matchesInflight = null;
    }
  })();
  return matchesInflight;
}

// Get current/upcoming matches — merges local DB + live Sportsmonk data
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getMatchesPayload());
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
    // (admin may generate code before import; once imported the UUID must be used)
    await MatchCode.update(
      { matchId: match.id },
      { where: { matchId: `sportsmonk_${fixtureId}` } }
    );

    console.log(`[Auto-Import] ${match.team1Short} vs ${match.team2Short} imported (${preMatchQuestions.length} predictions)`);
    res.status(201).json({ match });
  } catch (error) {
    console.error("Auto-import fixture error:", error);
    res.status(500).json({ error: "Failed to import fixture" });
  }
});

// User's past matches — every completed match the user joined, across all
// venues. Used for audit-trail / support screenshots (leaderboard + rewards).
// Must be declared BEFORE "/:matchId" so Express matches the literal path.
router.get("/my-past", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const p = parsePagination(req, { defaultPageSize: 10, maxPageSize: 50 });

    // Pull this user's participant rows, include the Match only if it's completed.
    // findAndCountAll's `distinct: true` is needed because the include can fan out.
    const { count, rows } = await MatchParticipant.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Match,
          as: "match",
          required: true,
          where: { status: "completed" },
        },
        {
          model: Venue,
          as: "venue",
          attributes: ["id", "name", "slug"],
        },
      ],
      order: [[{ model: Match, as: "match" }, "startTime", "DESC"]],
      limit: p.limit,
      offset: p.offset,
      distinct: true,
    });

    // For room-played matches (synthetic ROOM_VENUE_ID), every room the user
    // joined for that match shares one MatchParticipant row. Surface the list
    // of rooms so the lobby can expand the past-battle row into per-room
    // navigation. Keyed by matchId — there can be 2+ rooms for the same match.
    const roomMatchIds = rows
      .filter((r: any) => r.venueId === ROOM_VENUE_ID)
      .map((r: any) => r.matchId);
    const roomsByMatchId = new Map<string, Array<{ id: string; name: string; code: string }>>();
    if (roomMatchIds.length > 0) {
      const memberships = await RoomMember.findAll({
        where: { userId },
        include: [
          {
            model: Room,
            as: "room",
            required: true,
            where: { matchId: { [Op.in]: roomMatchIds } },
            attributes: ["id", "name", "code", "matchId"],
          },
        ],
      });
      for (const m of memberships as any[]) {
        const room = m.room;
        if (!room) continue;
        const list = roomsByMatchId.get(room.matchId) || [];
        list.push({ id: room.id, name: room.name, code: room.code });
        roomsByMatchId.set(room.matchId, list);
      }
    }

    const matches = rows.map((r: any) => ({
      matchId: r.matchId,
      venueId: r.venueId,
      venueName: r.venue?.name || null,
      venueSlug: r.venue?.slug || null,
      team1Short: r.match?.team1Short || null,
      team2Short: r.match?.team2Short || null,
      team1: r.match?.team1 || null,
      team2: r.match?.team2 || null,
      startTime: r.match?.startTime || null,
      status: r.match?.status || "completed",
      // Enough to render a summary row. The detail page fetches the full
      // scoreData + leaderboard + rewards via existing endpoints.
      scoreData: r.match?.scoreData || {},
      myStats: {
        totalPoints: r.totalPoints || 0,
        correctPredictions: r.correctPredictions || 0,
        totalPredictions: r.totalPredictions || 0,
        bestStreak: r.bestStreak || 0,
      },
      rooms: r.venueId === ROOM_VENUE_ID
        ? (roomsByMatchId.get(r.matchId) || [])
        : undefined,
    }));

    res.json({ matches, ...paginationMeta(p, count) });
  } catch (error) {
    console.error("Get my past matches error:", error);
    res.status(500).json({ error: "Failed to get past matches" });
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
    const { venueId, matchCode, latitude, longitude } = req.body;
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

    // Server-side geofence check. The virtual rooms venue has radiusMeters=999999
    // which makes this a no-op for private-room joins.
    //
    // Modes:
    //   - STRICT_GEOFENCE=true  → reject join if lat/lng missing or outside radius.
    //                             Set this for the pilot / production.
    //   - default (dev)          → log the result but allow the join to proceed,
    //                             so GPS-denied laptops, desktop browsers, and
    //                             simulator clients still work.
    const venue = await Venue.findByPk(venueId);
    if (!venue) {
      res.status(404).json({ error: "Venue not found" });
      return;
    }
    const strict = process.env.STRICT_GEOFENCE === "true";
    const latNum = typeof latitude === "number" ? latitude : parseFloat(latitude);
    const lngNum = typeof longitude === "number" ? longitude : parseFloat(longitude);

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      if (strict) {
        res.status(400).json({ error: "Location required to join this venue" });
        return;
      }
      // Dev fallback: allow join without GPS.
    } else {
      const distanceMeters = haversineMeters(latNum, lngNum, venue.latitude, venue.longitude);
      if (distanceMeters > (venue.radiusMeters || 200)) {
        if (strict) {
          res.status(403).json({
            error: "You are outside the venue area. Join from inside the venue.",
            distanceMeters: Math.round(distanceMeters),
          });
          return;
        }
        console.warn(
          `[geofence] user ${userId} joined ${venue.name} from ${Math.round(distanceMeters)}m away (soft mode)`
        );
      }
    }

    const currentRound = match.status === "live"
      ? getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers)
      : 0;

    const participant = await MatchParticipant.create({
      userId,
      matchId,
      venueId,
      currentRound,
    });

    const io = req.app.get("io");
    const playerCount = await MatchParticipant.count({ where: { matchId, venueId } });
    io.to(`venue:${venueId}:${matchId}`).emit("playerCount", { count: playerCount });

    // Fire-and-forget: capture city/state from GPS (reuses the lat/lng already
    // destructured + validated above for the geofence check).
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      User.findByPk(userId).then(async (user) => {
        if (user) {
          try {
            const geoRes = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latNum}&longitude=${lngNum}&localityLanguage=en`
            );
            if (geoRes.ok) {
              const geo: any = await geoRes.json();
              const city = geo.city || geo.locality || null;
              const state = geo.principalSubdivision || null;
              if (city || state) {
                await user.update({ city, state });
              }
            }
          } catch (geoErr) {
            console.error("Reverse geocoding error:", geoErr);
          }
        }
      }).catch(() => {});
    }

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

    // Collect all stored over ball chips into an ordered array (oldest to newest).
    const overs: { overNumber: number; innings: number; balls: { label: string; type: string }[] }[] = [];
    const currentOver = (sd.currentOver as number) || 1;
    for (let inn = 1; inn <= currentInnings; inn++) {
      const maxOvers = match.totalOvers || 20;
      for (let ov = 1; ov <= maxOvers; ov++) {
        const key = `innings${inn}_over${ov}_balls`;
        if (sd[key]) {
          overs.push({ overNumber: ov, innings: inn, balls: sd[key] as { label: string; type: string }[] });
        }
        if (inn === currentInnings && ov >= currentOver) break;
      }
    }

    res.json({ overs, currentInnings, currentOver: sd.currentOver });
  } catch (error) {
    console.error("Get balls error:", error);
    res.status(500).json({ error: "Failed to get ball data" });
  }
});

// Get live scorecard (batting + bowling) from SportsMonk
router.get("/:matchId/scorecard", async (req: Request, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const match = await Match.findByPk(matchId);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }

    if (!match.externalId) {
      res.json({ batting: [], bowling: [], playerMap: {}, scoreData: match.scoreData || {} });
      return;
    }

    const apiToken = process.env.SPORTSMONK_API_KEY || "";
    const fixtureId = Number(match.externalId);
    const url = `https://cricket.sportmonks.com/api/v2.0/fixtures/${fixtureId}?api_token=${apiToken}&include=batting,bowling,lineup`;
    const apiRes = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "JaffaBackend/1.0" },
    });
    const apiData: any = await apiRes.json();
    const fix = apiData.data || {};

    // Build player map from lineup
    const lineupArr: any[] = Array.isArray(fix.lineup) ? fix.lineup : (fix.lineup?.data || []);
    const playerMap: Record<number, { name: string; image: string | null }> = {};
    for (const p of lineupArr) {
      playerMap[p.id] = { name: p.fullname, image: p.image_path || null };
    }

    // Helper: format dismissal string using score_id from SportsMonk
    const RUN_OUT_IDS = new Set([3,5,22,23,24,25,28,29,32,36,42,63,64,65,66,67,68]);
    const fmtDismissal = (b: any): string => {
      const bowler = playerMap[b.bowling_player_id]?.name?.split(" ").pop() || "";
      const fielder = playerMap[b.catch_stump_player_id]?.name?.split(" ").pop() || "";
      const runoutBy = playerMap[b.runout_by_id]?.name?.split(" ").pop() || "";
      const sid = b.score_id;

      if (RUN_OUT_IDS.has(sid)) return `run out (${fielder || runoutBy || "sub"})`;
      if (sid === 56 || sid === 57 || sid === 21) return `st ${fielder} b ${bowler}`;
      if (sid === 83) return `lbw b ${bowler}`;
      if (sid === 20 || sid === 87) return `hit wicket b ${bowler}`;
      if (sid === 54 || sid === 55) {
        if (b.catch_stump_player_id === b.bowling_player_id) return `c & b ${bowler}`;
        return `c ${fielder} b ${bowler}`;
      }
      if (sid === 58 || sid === 79) return `b ${bowler}`;
      if (sid === 138) return "retired out";
      if (sid === 80 || sid === 81) return "absent hurt";
      if (sid === 78) return "obstructing the field";
      if (sid === 86) return "hit ball twice";

      // Fallback for unknown score_ids
      if (b.catch_stump_player_id) return `c ${fielder} b ${bowler}`;
      if (bowler) return `b ${bowler}`;
      return "out";
    };

    // Transform batting
    const battingRaw: any[] = Array.isArray(fix.batting) ? fix.batting : (fix.batting?.data || []);
    const batting = battingRaw.map((b: any) => ({
      name: playerMap[b.player_id]?.name || `Player ${b.player_id}`,
      image: playerMap[b.player_id]?.image || null,
      runs: b.score ?? 0,
      balls: b.ball ?? 0,
      fours: b.four_x ?? 0,
      sixes: b.six_x ?? 0,
      strikeRate: b.rate ?? 0,
      isOut: b.score_id !== 84 && b.score_id !== 85,
      dismissal: (b.score_id !== 84 && b.score_id !== 85) ? fmtDismissal(b) : "not out",
      fowScore: (b.score_id !== 84 && b.score_id !== 85) ? (b.fow_score ?? null) : null,
      fowBalls: (b.score_id !== 84 && b.score_id !== 85) ? (b.fow_balls ?? null) : null,
      scoreboard: b.scoreboard,
      teamId: b.team_id,
      sort: b.sort,
    }));

    // Transform bowling
    const bowlingRaw: any[] = Array.isArray(fix.bowling) ? fix.bowling : (fix.bowling?.data || []);
    const bowling = bowlingRaw.map((b: any) => ({
      name: playerMap[b.player_id]?.name || `Player ${b.player_id}`,
      image: playerMap[b.player_id]?.image || null,
      overs: b.overs ?? 0,
      maidens: b.medians ?? 0,
      runs: b.runs ?? 0,
      wickets: b.wickets ?? 0,
      economy: b.rate ?? 0,
      wides: b.wide ?? 0,
      noballs: b.noball ?? 0,
      scoreboard: b.scoreboard,
      teamId: b.team_id,
      sort: b.sort,
    }));

    res.json({ batting, bowling, playerMap, scoreData: match.scoreData || {} });
  } catch (error) {
    console.error("Get scorecard error:", error);
    res.status(500).json({ error: "Failed to get scorecard" });
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
      // Newest-first to match the rest of the app's "latest at top" theme.
      order: [["createdAt", "DESC"]],
    });

    const playerCount = await MatchParticipant.count({
      where: { matchId, venueId },
    });

    // Derive currentRound from match state if participant's round is stale, and persist it
    if (participant && participant.currentRound === 0 && match.status === "live") {
      const derivedRound = getCurrentRound(match.currentInnings || 1, match.currentOver || 1, match.totalOvers);
      participant.currentRound = derivedRound;
      await participant.update({ currentRound: derivedRound });
    }

    res.json({ match, participant, openPredictions, playerCount });
  } catch (error) {
    console.error("Get match state error:", error);
    res.status(500).json({ error: "Failed to get match state" });
  }
});

// Per-user post-match story ("You started slow, nailed the middle, clutched the finish").
// Available as soon as the match has any resolved picks for this user; best read after
// the match ends. Returns a lightweight narrative object the recap page can render directly.
router.get("/:matchId/my-story", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const matchId = req.params.matchId as string;
    const venueId = req.query.venueId as string;
    const userId = req.userId!;

    if (!venueId) {
      res.status(400).json({ error: "venueId is required" });
      return;
    }

    const userPicks = await UserPrediction.findAll({
      where: { userId, matchId, venueId },
      include: [{ model: Prediction, as: "prediction" }],
      order: [["answeredAt", "ASC"]],
    });

    const participant = await MatchParticipant.findOne({
      where: { userId, matchId, venueId },
    });

    // For the "signature call" beat we need aggregates for the user's correct picks.
    const correctPickIds = userPicks
      .filter((p) => p.isCorrect === true)
      .map((p) => p.predictionId);

    const aggregates = correctPickIds.length
      ? await PredictionAggregate.findAll({
          where: {
            predictionId: { [Op.in]: correctPickIds },
            scope: "global",
          },
        })
      : [];

    const story = buildStory(userPicks as any, participant, aggregates);
    res.json(story);
  } catch (error) {
    console.error("Story build error:", error);
    res.status(500).json({ error: "Failed to build story" });
  }
});

export default router;
