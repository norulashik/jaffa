import express from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import { sequelize } from "./models";
import authRoutes from "./routes/auth";
import venueRoutes from "./routes/venue";
import matchRoutes from "./routes/match";
import predictionRoutes from "./routes/prediction";
import leaderboardRoutes from "./routes/leaderboard";
import rewardRoutes from "./routes/reward";
import adminRoutes from "./routes/admin";
import ownerRoutes from "./routes/owner";
import { setupSocketHandlers } from "./socket/handlers";
import { pollSportsmonkUpdates } from "./services/sportsmonkApi";

dotenv.config();

const app = express();
const server = http.createServer(app);

// Parse CORS origins — supports comma-separated list in env
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

// Make io accessible in routes
app.set("io", io);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/venues", venueRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Sportmonks API test page — shows live data in the browser
app.get("/api/sportsmonk-test", async (_req, res) => {
  const API_BASE = "https://cricket.sportmonks.com/api/v2.0";
  const TOKEN = process.env.SPORTSMONK_API_KEY || "";

  try {
    // 1. Validate API key
    const keyCheck = await fetch(`${API_BASE}/fixtures?api_token=${TOKEN}&per_page=1`);
    const keyValid = keyCheck.status === 200;

    // 2. Live matches
    const liveRes = await fetch(`${API_BASE}/livescores?api_token=${TOKEN}&include=localteam,visitorteam,runs`);
    const liveData: any = await liveRes.json();
    const liveMatches = liveData.data || [];

    // 3. Completed match scorecard (NZ vs SA 3rd T20I)
    const scRes = await fetch(`${API_BASE}/fixtures/67087?api_token=${TOKEN}&include=localteam,visitorteam,runs,balls`);
    const scData: any = await scRes.json();
    const scorecard = scData.data;

    // 4. Upcoming fixtures
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const upRes = await fetch(`${API_BASE}/fixtures?filter[starts_between]=${today},${nextWeek}&api_token=${TOKEN}&include=localteam,visitorteam`);
    const upData: any = await upRes.json();
    const upcoming = upData.data || [];

    res.send(`
<!DOCTYPE html>
<html><head><title>Sportmonks API Test</title>
<style>
  body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; max-width: 900px; margin: 0 auto; }
  h1 { color: #f97316; } h2 { color: #38bdf8; border-bottom: 1px solid #334155; padding-bottom: 8px; }
  .card { background: #1e293b; border-radius: 12px; padding: 16px; margin: 12px 0; }
  .ok { color: #4ade80; } .fail { color: #f87171; }
  .score { font-size: 28px; font-weight: bold; color: #f97316; }
  .team { font-size: 18px; font-weight: bold; }
  .meta { color: #94a3b8; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #334155; }
  th { color: #94a3b8; font-size: 13px; text-transform: uppercase; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; }
  .live { background: #dc2626; color: white; } .ns { background: #334155; color: #94a3b8; } .finished { background: #166534; color: #4ade80; }
  .ball { display: inline-block; width: 28px; height: 28px; line-height: 28px; text-align: center; border-radius: 50%; margin: 2px; font-size: 12px; font-weight: bold; }
  .ball-dot { background: #334155; color: #94a3b8; } .ball-run { background: #1e40af; color: white; }
  .ball-four { background: #166534; color: #4ade80; } .ball-six { background: #7c3aed; color: white; }
  .ball-wicket { background: #dc2626; color: white; }
</style></head><body>
<h1>JAFFA — Sportmonks API Test</h1>

<h2>1. API Key Status</h2>
<div class="card">
  <p>Key: <code>${TOKEN.substring(0, 8)}...${ TOKEN.substring(TOKEN.length - 4)}</code></p>
  <p>Status: <span class="${keyValid ? 'ok' : 'fail'}">${keyValid ? 'VALID — Connected to Sportmonks' : 'INVALID — Check your API key'}</span></p>
</div>

<h2>2. Live Matches (${liveMatches.length})</h2>
${liveMatches.length === 0 ? '<div class="card"><p class="meta">No live matches right now</p></div>' :
  liveMatches.map((m: any) => {
    const runs = m.runs?.data || [];
    const inn1 = runs.find((r: any) => r.inning === 1);
    const inn2 = runs.find((r: any) => r.inning === 2);
    return '<div class="card">' +
      '<span class="badge live">LIVE</span> ' +
      '<span class="team">' + (m.localteam?.data?.name || m.localteam_id) + ' vs ' + (m.visitorteam?.data?.name || m.visitorteam_id) + '</span>' +
      '<p class="score">' + (inn1 ? inn1.score + '/' + inn1.wickets + ' (' + inn1.overs + ' ov)' : '—') +
      (inn2 ? '  &nbsp;|&nbsp;  ' + inn2.score + '/' + inn2.wickets + ' (' + inn2.overs + ' ov)' : '') + '</p>' +
      '<p class="meta">' + (m.note || '') + '</p></div>';
  }).join('')
}

<h2>3. Scorecard — NZ vs SA 3rd T20I (Fixture 67087)</h2>
${scorecard ? (() => {
    const runs = scorecard.runs?.data || [];
    const balls = scorecard.balls?.data || [];
    const inn1 = runs.find((r: any) => r.inning === 1);
    const inn2 = runs.find((r: any) => r.inning === 2);
    const local = scorecard.localteam?.data?.name || scorecard.localteam_id;
    const visitor = scorecard.visitorteam?.data?.name || scorecard.visitorteam_id;

    // Group balls by over for innings 1
    const inn1Balls = balls.filter((b: any) => b.scoreboard === 'S1').slice(0, 30);

    return '<div class="card">' +
      '<span class="badge finished">FINISHED</span> ' +
      '<span class="team">' + local + ' vs ' + visitor + '</span>' +
      '<p class="meta">Status: ' + scorecard.status + ' | Note: ' + (scorecard.note || 'N/A') + '</p>' +
      '<p class="meta">Toss: Team ' + scorecard.toss_won_team_id + ' elected to ' + scorecard.elected + '</p>' +
      '<table><tr><th>Innings</th><th>Score</th><th>Wickets</th><th>Overs</th></tr>' +
      (inn1 ? '<tr><td>1st Innings (Team ' + inn1.team_id + ')</td><td class="score">' + inn1.score + '</td><td>' + inn1.wickets + '</td><td>' + inn1.overs + '</td></tr>' : '') +
      (inn2 ? '<tr><td>2nd Innings (Team ' + inn2.team_id + ')</td><td class="score">' + inn2.score + '</td><td>' + inn2.wickets + '</td><td>' + inn2.overs + '</td></tr>' : '') +
      '</table>' +
      '<h3 style="color:#38bdf8;margin-top:16px">Ball-by-Ball (1st Innings — first 30 balls)</h3>' +
      '<div>' + inn1Balls.map((b: any) => {
        const sc = b.score || {};
        let cls = 'ball-run';
        let label = String(sc.runs || 0);
        if (sc.is_wicket || sc.out) { cls = 'ball-wicket'; label = 'W'; }
        else if (sc.six) { cls = 'ball-six'; label = '6'; }
        else if (sc.four) { cls = 'ball-four'; label = '4'; }
        else if (sc.runs === 0 && !sc.noball && !sc.bye && !sc.leg_bye) { cls = 'ball-dot'; label = '•'; }
        return '<span class="ball ' + cls + '">' + label + '</span>';
      }).join('') + '</div>' +
      '<p class="meta">Total balls fetched: ' + balls.length + '</p>' +
      '</div>';
  })() : '<div class="card"><p class="fail">Could not fetch fixture 67087</p></div>'}

<h2>4. Upcoming Matches (Next 7 days: ${upcoming.length})</h2>
<div class="card">
<table><tr><th>Date</th><th>Match</th><th>Status</th></tr>
${upcoming.map((f: any) =>
  '<tr><td class="meta">' + new Date(f.starting_at).toLocaleString() + '</td>' +
  '<td class="team">' + (f.localteam?.data?.name || f.localteam_id) + ' vs ' + (f.visitorteam?.data?.name || f.visitorteam_id) + '</td>' +
  '<td><span class="badge ' + (f.status === 'NS' ? 'ns' : f.status === 'Finished' ? 'finished' : 'live') + '">' + f.status + '</span></td></tr>'
).join('')}
</table></div>

<p class="meta" style="margin-top:24px;text-align:center">Fetched at ${new Date().toISOString()} | JAFFA Sportmonks Test</p>
</body></html>
    `);
  } catch (err: any) {
    res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre>`);
  }
});

// Socket.IO
setupSocketHandlers(io);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log("Database connected");

    await sequelize.sync({ alter: true });
    console.log("Database synced");

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(PORT, () => {
        server.off("error", reject);
        resolve();
      });
    });

    console.log(`JAFFA backend running on port ${PORT}`);

    // Sportsmonk: poll every 5 seconds for live score updates
    const POLL_INTERVAL = 5 * 1000;
    setInterval(async () => {
      try {
        await pollSportsmonkUpdates(io);
      } catch (err) {
        console.error("Sportsmonk poll error:", err);
      }
    }, POLL_INTERVAL);
    console.log(`Sportsmonk live polling enabled (every ${POLL_INTERVAL / 1000}s)`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use.`);
      console.error("A JAFFA backend may already be running on http://localhost:5000/api/health");
      console.error("Stop the existing process before starting a new one.");
      process.exit(1);
    }
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();

export { app, io, server };
