# Jaffa Local Match Simulator — Rebuild Guide

Testing Jaffa end-to-end requires a live IPL match. That's rarely possible during development, so we used a local simulator that speaks the Sportsmonk API shape and auto-plays a canned T20 innings. The simulator files were removed from the repo, but the hooks it depends on are still in place. This document has everything needed to rebuild the simulator in one sitting.

---

## 1. What the simulator does

A companion Node process on port **5001** that pretends to be the real Sportsmonk API.

- Seeds a `Match` row with `externalId = "99999"`, a venue `jaffa-simulator`, and match code `1234`.
- Auto-plays a scripted 20-over innings with realistic ball outcomes (dot-weighted, occasional boundaries, wickets, bowler rotation every over).
- Serves Sportsmonk-shaped responses: `GET /fixtures/:id`, `GET /livescores`, `GET /fixtures`, `GET /teams/:id`.
- Exposes two control endpoints: `POST /sim/reset`, `POST /sim/abandon`.

When the backend is pointed at the sim via `SPORTSMONK_API_BASE=http://localhost:5001`, its Sportsmonk poller hits the sim instead of cricket.sportmonks.com and drives the live-player tracker, per-over resolver, scoring, and socket events **exactly as if it were a real match**.

---

## 2. Prerequisites (already in place)

These backend hooks must exist for the simulator to work. They are present in the current code — don't delete them:

- **`backend/src/services/sportsmonkApi.ts`** has:
  ```ts
  const getApiBase = () => process.env.SPORTSMONK_API_BASE || "https://cricket.sportmonks.com/api/v2.0";
  ```
  And every call site uses `${getApiBase()}`. When the env var is unset (production), the function returns the real Sportsmonk URL. Setting it to `http://localhost:5001` (dev) swings the backend to the sim.

- **`backend/src/services/sportsmonkApi.ts`** exports:
  ```ts
  export async function fetchLiveFixtureForTracker(fixtureId: number, includeBalls = true): Promise<any | null> {
    return fetchLiveFixtureDetail(fixtureId, includeBalls);
  }
  ```
  Used by `livePlayerTracker.ts` — keep it, sim-or-no-sim.

- **`backend/src/index.ts`** has:
  ```ts
  const API_BASE = process.env.SPORTSMONK_API_BASE || "https://cricket.sportmonks.com/api/v2.0";
  ```
  (in the `/api/sportsmonk-test` debug page.)

If any of those got reverted, re-apply them before rebuilding the sim.

---

## 3. Re-add the npm scripts

**`backend/package.json`** — inside the `scripts` block:

```json
"sim": "ts-node src/scripts/simulateMatch.ts",
"sim:fast": "cross-env SIM_BALL_INTERVAL_MS=1000 ts-node src/scripts/simulateMatch.ts"
```

`cross-env` is already a devDependency, so no `npm install` needed.

---

## 4. Recreate `backend/src/scripts/simulateMatch.ts`

Paste this entire file verbatim. ~500 lines.

```ts
// Local Sportsmonk simulator — stands in for the real Sportsmonk API so we
// can test the Jaffa backend + frontend end-to-end without waiting for a live
// cricket match.
//
// How to run (three terminals):
//   1. npm run sim            ← this script, port 5001
//   2. SPORTSMONK_API_BASE=http://localhost:5001 npm run dev    ← backend
//   3. npm run dev            ← frontend
//
// Ctrl+C to stop.

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import {
  sequelize, Match, Venue, MatchCode,
  Prediction, UserPrediction, MatchParticipant, PredictionAggregate,
} from "../models";
import { generatePreMatchPredictions } from "../services/predictionEngine";

// ---- Config ----
const PORT = Number(process.env.SIM_PORT || 5001);
const BALL_INTERVAL_MS = Number(process.env.SIM_BALL_INTERVAL_MS || 50_000);
const INNINGS_BREAK_MS = Number(process.env.SIM_INNINGS_BREAK_MS || 300_000);
const PRE_MATCH_DELAY_MS = Number(process.env.SIM_PRE_MATCH_DELAY_MS || 300_000);
const TOTAL_OVERS = 20;
const MAX_WICKETS = 10;

// ---- Teams ----
const TEAM1 = { id: 9001, name: "Chennai Super Kings", code: "CSK", image_path: null as string | null };
const TEAM2 = { id: 9002, name: "Mumbai Indians", code: "MI", image_path: null as string | null };

function mkPlayer(id: number, fullname: string) {
  return { id, fullname, image_path: null, batting: { batting_order: id } };
}
const TEAM1_LINEUP = [
  mkPlayer(1001, "Ruturaj Gaikwad"),
  mkPlayer(1002, "Devon Conway"),
  mkPlayer(1003, "Ajinkya Rahane"),
  mkPlayer(1004, "Shivam Dube"),
  mkPlayer(1005, "MS Dhoni"),
  mkPlayer(1006, "Ravindra Jadeja"),
  mkPlayer(1007, "Moeen Ali"),
  mkPlayer(1008, "Deepak Chahar"),
  mkPlayer(1009, "Tushar Deshpande"),
  mkPlayer(1010, "Matheesha Pathirana"),
  mkPlayer(1011, "Mustafizur Rahman"),
];
const TEAM2_LINEUP = [
  mkPlayer(2001, "Rohit Sharma"),
  mkPlayer(2002, "Ishan Kishan"),
  mkPlayer(2003, "Suryakumar Yadav"),
  mkPlayer(2004, "Tilak Varma"),
  mkPlayer(2005, "Hardik Pandya"),
  mkPlayer(2006, "Tim David"),
  mkPlayer(2007, "Piyush Chawla"),
  mkPlayer(2008, "Jasprit Bumrah"),
  mkPlayer(2009, "Gerald Coetzee"),
  mkPlayer(2010, "Akash Madhwal"),
  mkPlayer(2011, "Kumar Kartikeya"),
];

const T1_BATTERS = TEAM1_LINEUP.slice(0, 7);
const T1_BOWLERS = TEAM1_LINEUP.slice(7);
const T2_BATTERS = TEAM2_LINEUP.slice(0, 7);
const T2_BOWLERS = TEAM2_LINEUP.slice(7);

type Ball = {
  ball: number;
  scoreboard: "S1" | "S2";
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
    ball: boolean;
    out: boolean;
  };
  batsman: { fullname: string };
  bowler: { fullname: string };
};

type FixtureStatus = "NS" | "Live" | "Finished" | "Abandoned";
type InningsSide = "S1" | "S2";

const FIXTURE_ID = 99999;

type InningsState = {
  side: InningsSide; battingTeamId: number; bowlingTeamId: number;
  batters: typeof TEAM1_LINEUP; bowlers: typeof TEAM1_LINEUP;
  onStrike: number; nonStriker: number; nextBatsmanIdx: number;
  currentBowlerIdx: number; wicketsDown: number;
  balls: Ball[]; legalBallsInOver: number; score: number; overs: number;
};

const sim = {
  status: "NS" as FixtureStatus,
  tossWonTeamId: null as number | null,
  elected: null as "batting" | "bowling" | null,
  note: "Jaffa Simulator",
  innings: null as InningsState | null,
  allBalls: [] as Ball[],
  runsSummary: [] as Array<{ inning: 1 | 2; team_id: number; score: number; wickets: number; overs: number }>,
  inning: 0 as 0 | 1 | 2,
};

function weightedChoice<T>(items: Array<{ item: T; w: number }>): T {
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of items) { r -= x.w; if (r <= 0) return x.item; }
  return items[items.length - 1].item;
}

function rollBall(): Ball["score"] {
  const outcome = weightedChoice([
    { item: "dot", w: 35 }, { item: "one", w: 30 }, { item: "two", w: 12 },
    { item: "three", w: 2 }, { item: "four", w: 10 }, { item: "six", w: 6 },
    { item: "wicket", w: 4 }, { item: "wide", w: 1 },
  ]);
  const base = {
    name: "", runs: 0, four: false, six: false, bye: 0, leg_bye: 0,
    noball: 0, noball_runs: 0, is_wicket: false, ball: true, out: false,
  };
  switch (outcome) {
    case "dot": return { ...base };
    case "one": return { ...base, runs: 1 };
    case "two": return { ...base, runs: 2 };
    case "three": return { ...base, runs: 3 };
    case "four": return { ...base, runs: 4, four: true };
    case "six": return { ...base, runs: 6, six: true };
    case "wicket": return { ...base, is_wicket: true, out: true, name: Math.random() > 0.25 ? "clean bowled" : "catch out" };
    case "wide": return { ...base, runs: 1, ball: false };
  }
  return base;
}

function startInnings(side: InningsSide, battingTeamId: number) {
  const isTeam1 = battingTeamId === TEAM1.id;
  sim.innings = {
    side, battingTeamId,
    bowlingTeamId: isTeam1 ? TEAM2.id : TEAM1.id,
    batters: isTeam1 ? T1_BATTERS : T2_BATTERS,
    bowlers: isTeam1 ? T2_BOWLERS : T1_BOWLERS,
    onStrike: 0, nonStriker: 1, nextBatsmanIdx: 2, currentBowlerIdx: 0,
    wicketsDown: 0, balls: [], legalBallsInOver: 0, score: 0, overs: 0,
  };
  sim.inning = side === "S1" ? 1 : 2;
  sim.runsSummary.push({ inning: sim.inning, team_id: battingTeamId, score: 0, wickets: 0, overs: 0 });
  console.log(`\n[sim] Innings ${sim.inning} starts — ${isTeam1 ? TEAM1.code : TEAM2.code} batting.`);
}

function rotateBowler(inn: InningsState) {
  inn.currentBowlerIdx = (inn.currentBowlerIdx + 1) % inn.bowlers.length;
}

function inningsOver() {
  if (!sim.innings) return;
  const inn = sim.innings;
  const idx = sim.runsSummary.findIndex((r) => r.inning === (inn.side === "S1" ? 1 : 2));
  if (idx >= 0) sim.runsSummary[idx] = { ...sim.runsSummary[idx], score: inn.score, wickets: inn.wicketsDown, overs: inn.overs };
  console.log(`[sim] Innings ${inn.side} ended: ${inn.score}/${inn.wicketsDown} in ${inn.overs} overs`);
  if (inn.side === "S1") {
    sim.innings = null;
    setTimeout(() => { console.log(`[sim] Break over — switching sides.`); startInnings("S2", inn.bowlingTeamId); }, INNINGS_BREAK_MS);
  } else {
    sim.status = "Finished"; sim.innings = null;
    console.log(`\n[sim] MATCH OVER.`);
  }
}

function tickBall() {
  if (sim.status !== "Live" || !sim.innings) return;
  const inn = sim.innings;
  const striker = inn.batters[inn.onStrike];
  const bowler = inn.bowlers[inn.currentBowlerIdx];
  const score = rollBall();
  const over = Math.floor(inn.overs);
  const ballInOver = inn.legalBallsInOver + 1;
  const ball: Ball = {
    ball: Number(`${over}.${ballInOver}`),
    scoreboard: inn.side,
    batsman_id: striker.id,
    bowler_id: bowler.id,
    batsmanout_id: score.is_wicket ? striker.id : null,
    score,
    batsman: { fullname: striker.fullname },
    bowler: { fullname: bowler.fullname },
  };
  inn.balls.push(ball); sim.allBalls.push(ball); inn.score += score.runs;
  if (score.ball) {
    inn.legalBallsInOver += 1;
    if (score.runs % 2 === 1 && !score.is_wicket) {
      const t = inn.onStrike; inn.onStrike = inn.nonStriker; inn.nonStriker = t;
    }
    if (inn.legalBallsInOver >= 6) {
      inn.overs = Math.floor(inn.overs) + 1; inn.legalBallsInOver = 0;
      const t = inn.onStrike; inn.onStrike = inn.nonStriker; inn.nonStriker = t;
      rotateBowler(inn);
    } else {
      inn.overs = Math.floor(inn.overs) + inn.legalBallsInOver / 10;
    }
  }
  if (score.is_wicket) {
    inn.wicketsDown += 1;
    if (inn.nextBatsmanIdx < inn.batters.length) { inn.onStrike = inn.nextBatsmanIdx; inn.nextBatsmanIdx += 1; }
  }
  const idx = sim.runsSummary.findIndex((r) => r.inning === (inn.side === "S1" ? 1 : 2));
  if (idx >= 0) sim.runsSummary[idx] = { ...sim.runsSummary[idx], score: inn.score, wickets: inn.wicketsDown, overs: inn.overs };
  console.log(`[sim] ${inn.side} ${ball.ball.toFixed(1)}  ${striker.fullname} vs ${bowler.fullname}: ${score.is_wicket ? "WICKET" : score.runs} | ${inn.score}/${inn.wicketsDown}`);
  if (Math.floor(inn.overs) >= TOTAL_OVERS && inn.legalBallsInOver === 0) { inningsOver(); return; }
  if (inn.wicketsDown >= MAX_WICKETS) { inningsOver(); return; }
  if (inn.side === "S2") {
    const i1 = sim.runsSummary.find((r) => r.inning === 1);
    if (i1 && inn.score > i1.score) inningsOver();
  }
}

function buildFixturePayload(includeBalls: boolean, includeLineup: boolean): any {
  const balls = includeBalls ? { data: sim.allBalls } : undefined;
  const lineup = includeLineup ? [
    ...TEAM1_LINEUP.map((p) => ({ ...p, lineup: { team_id: TEAM1.id, substitution: false } })),
    ...TEAM2_LINEUP.map((p) => ({ ...p, lineup: { team_id: TEAM2.id, substitution: false } })),
  ] : undefined;
  const fixture: any = {
    id: FIXTURE_ID, league_id: 1, season_id: 1, stage_id: null, venue_id: 1,
    status: sim.status, note: sim.note,
    localteam_id: TEAM1.id, visitorteam_id: TEAM2.id,
    toss_won_team_id: sim.tossWonTeamId, elected: sim.elected,
    starting_at: new Date(Date.now() - 60_000).toISOString(),
    total_overs_played: sim.innings?.overs ?? 0,
    localteam: { data: { id: TEAM1.id, name: TEAM1.name, code: TEAM1.code, image_path: TEAM1.image_path } },
    visitorteam: { data: { id: TEAM2.id, name: TEAM2.name, code: TEAM2.code, image_path: TEAM2.image_path } },
    runs: { data: sim.runsSummary },
  };
  if (balls) fixture.balls = balls;
  if (lineup) fixture.lineup = lineup;
  return fixture;
}

const includeHas = (include: string | undefined, token: string) =>
  !!include && include.split(",").map((s) => s.trim()).includes(token);

async function start() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  const existing = await Match.findOne({ where: { externalId: String(FIXTURE_ID) } });
  if (!existing) {
    await Match.create({
      externalId: String(FIXTURE_ID),
      team1: TEAM1.name, team2: TEAM2.name,
      team1Short: TEAM1.code, team2Short: TEAM2.code,
      team1Players: TEAM1_LINEUP.map((p) => p.fullname),
      team2Players: TEAM2_LINEUP.map((p) => p.fullname),
      startTime: new Date(), status: "upcoming", totalOvers: TOTAL_OVERS,
    } as any);
    console.log(`[sim] Seeded Match externalId=${FIXTURE_ID}`);
  } else {
    const ps = await Prediction.findAll({ where: { matchId: existing.id }, attributes: ["id"] });
    const ids = ps.map((p) => p.id);
    if (ids.length) {
      await PredictionAggregate.destroy({ where: { predictionId: ids } });
      await UserPrediction.destroy({ where: { predictionId: ids } });
    }
    await Prediction.destroy({ where: { matchId: existing.id } });
    await MatchParticipant.destroy({ where: { matchId: existing.id } });
    await existing.update({
      status: "upcoming", currentInnings: 1, currentOver: 1, currentPhase: null,
      team1Players: TEAM1_LINEUP.map((p) => p.fullname),
      team2Players: TEAM2_LINEUP.map((p) => p.fullname),
      scoreData: {},
    } as any);
    console.log(`[sim] Reset Match ${existing.id} — wiped ${ids.length} old predictions`);
  }

  let venue = await Venue.findOne({ where: { slug: "jaffa-simulator" } });
  if (!venue) {
    const bcrypt = await import("bcryptjs");
    venue = await Venue.create({
      name: "Jaffa Simulator Venue", slug: "jaffa-simulator",
      ownerPhone: "+919000000000", ownerName: "Sim",
      password: await bcrypt.hash("simpass", 10),
      latitude: 0, longitude: 0, radiusMeters: 999999,
      rewardConfig: {
        roundReward: { top1: "Free drink", top2: "20% off", top3: "10% off" },
        grandPrize: { top1: "Free meal", top2: "Free starter", top3: "25% off" },
      },
      approvalStatus: "approved", isActive: true,
    } as any);
    console.log(`[sim] Created venue ${venue.slug}`);
  }

  const match = await Match.findOne({ where: { externalId: String(FIXTURE_ID) } });
  const CODE = "1234";
  if (match) {
    const [code] = await MatchCode.findOrCreate({
      where: { venueId: venue.id, matchId: match.id, code: CODE },
      defaults: { venueId: venue.id, matchId: match.id, code: CODE, isActive: true } as any,
    });
    if (!code.isActive) await code.update({ isActive: true });

    const preMatchQs = generatePreMatchPredictions(
      match.id, match.team1, match.team2,
      match.team1Short, match.team2Short,
      match.team1Players, match.team2Players
    );
    for (const q of preMatchQs) await Prediction.create({ ...q, opensAt: new Date() } as any);
    console.log(`[sim] Seeded ${preMatchQs.length} pre-match predictions`);
  }

  const app = express();
  app.use(express.json());
  app.get("/fixtures/:id", (req, res) => {
    const id = Number(req.params.id);
    if (id !== FIXTURE_ID) return res.json({ data: null });
    const inc = String(req.query.include || "");
    res.json({ data: buildFixturePayload(includeHas(inc, "balls"), includeHas(inc, "lineup")) });
  });
  app.get("/livescores", (req, res) => {
    if (sim.status === "NS" || sim.status === "Finished") return res.json({ data: [] });
    const inc = String(req.query.include || "");
    res.json({ data: [buildFixturePayload(includeHas(inc, "balls"), includeHas(inc, "lineup"))] });
  });
  app.get("/fixtures", (req, res) => {
    const inc = String(req.query.include || "");
    res.json({ data: [buildFixturePayload(includeHas(inc, "balls"), includeHas(inc, "lineup"))] });
  });
  app.get("/teams/:id", (req, res) => {
    const id = Number(req.params.id);
    const team = id === TEAM1.id ? TEAM1 : id === TEAM2.id ? TEAM2 : { id, name: `Team ${id}`, code: `T${id}`, image_path: null };
    res.json({ data: team });
  });
  app.post("/sim/reset", (_req, res) => {
    sim.status = "NS"; sim.tossWonTeamId = null; sim.elected = null;
    sim.innings = null; sim.allBalls = []; sim.runsSummary = []; sim.inning = 0;
    console.log("[sim] RESET."); res.json({ reset: true });
  });
  app.post("/sim/abandon", (_req, res) => {
    sim.status = "Abandoned"; sim.innings = null;
    console.log("[sim] ABANDONED."); res.json({ abandoned: true });
  });

  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`\n[sim] Mock Sportsmonk running on http://localhost:${PORT}`);
    console.log(`[sim] Fixture id: ${FIXTURE_ID}  |  ${TEAM1.code} vs ${TEAM2.code}`);
    console.log(`[sim] Venue: jaffa-simulator  |  Match code: ${CODE}`);
    console.log(`[sim] SPORTSMONK_API_BASE=http://localhost:${PORT}`);
    console.log(`[sim] Ball interval: ${BALL_INTERVAL_MS}ms`);
    console.log(`[sim] Pre-match delay: ${PRE_MATCH_DELAY_MS}ms\n`);

    setTimeout(() => {
      console.log(`[sim] Toss done — ${TEAM1.code} bats. Going Live.`);
      sim.tossWonTeamId = TEAM1.id; sim.elected = "batting"; sim.status = "Live";
      startInnings("S1", TEAM1.id);
    }, PRE_MATCH_DELAY_MS);

    setInterval(() => {
      try { tickBall(); } catch (err) { console.error("[sim] tick error:", err); }
    }, BALL_INTERVAL_MS);
  });
}

start().catch((err) => { console.error("[sim] startup failed:", err); process.exit(1); });
```

---

## 5. Run it

Three terminals, in order.

```cmd
:: Terminal 1 — simulator
cd jaffa\backend
npm run sim

:: Terminal 2 — backend pointed at the sim
cd jaffa\backend
set SPORTSMONK_API_BASE=http://localhost:5001
npm run dev

:: Terminal 3 — frontend
cd jaffa\frontend
npm run dev
```

Fast pacing for quick testing:

```cmd
set SIM_BALL_INTERVAL_MS=5000
set SIM_PRE_MATCH_DELAY_MS=30000
set SIM_INNINGS_BREAK_MS=20000
set SIM_BATSMAN_LOCK_MS=15000
npm run sim
```

Mid-sim controls:

```cmd
curl -X POST http://localhost:5001/sim/reset
curl -X POST http://localhost:5001/sim/abandon
```

---

## 6. What the sim creates in the DB

Row | Key | Purpose
--- | --- | ---
`matches` | `externalId = "99999"` | Sim fixture row the backend poller binds to
`venues` | `slug = "jaffa-simulator"` | Test venue; `radiusMeters = 999999` so geofence always passes
`match_codes` | `code = "1234"` | Join code for the sim match
`predictions` | (category = pre_match) | 7 pre-match questions seeded at boot
`predictions` | (subjectType = batsman_innings/bowler_innings/...) | Created on-the-fly by livePlayerTracker as balls roll in

These are safe to leave in the DB between runs — the sim wipes its own predictions on each boot.

---

## 7. Cleanup when you're done testing

Don't ship the sim to production. Checklist:

1. Stop any running sim: `taskkill /F /PID <sim PID on port 5001>` (find it with `netstat -ano | findstr :5001`).
2. **Unset** `SPORTSMONK_API_BASE` on the production env so the backend hits real Sportsmonk:
   - Remove from `/etc/jaffa/backend.env` (or wherever you load prod env).
   - `sudo systemctl restart jaffa-backend`.
3. The Match row (`externalId=99999`) and simulator venue stay in the DB harmlessly. If you want to wipe them, run an ad-hoc delete or write a small cleanup script.
4. Delete `backend/src/scripts/simulateMatch.ts` and remove the `sim` / `sim:fast` npm scripts before committing to the prod branch — or keep them in the dev branch only.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `[Sportsmonk] No fixture data for 99999` in backend logs | backend not pointed at sim | re-set `SPORTSMONK_API_BASE` and restart backend |
| Sim boots but backend still polls real API | previous backend process holding stale env | `taskkill` old backend, start fresh |
| Match shows up in lobby alongside a real live match | stale `live` row in DB from an earlier poll | mark it completed: `UPDATE matches SET status='completed' WHERE external_id='<id>';` |
| Boots, then exits silently | missing `DATABASE_URL` / `JWT_SECRET` in `.env` | ensure backend `.env` loads OK from the same dir |
| `Port 5001 already in use` | previous sim still running | `taskkill /F /PID $(netstat -ano \| findstr ":5001" \| awk '{print $5}')` |

---

## 9. File index (for reference)

What to recreate when rebuilding the sim:

- **Script** → `backend/src/scripts/simulateMatch.ts` (section 4 above)
- **npm scripts** → `backend/package.json` (section 3)
- **Backend hooks** → already in `sportsmonkApi.ts` and `index.ts` (section 2)

Optional helper scripts you might also want:

- `markStaleCompleted.ts` — one-liner to mark an old live match as completed so it disappears from the lobby. Paste this if you ever need it:
  ```ts
  import dotenv from "dotenv"; dotenv.config();
  import { sequelize, Match } from "../models";
  (async () => {
    await sequelize.authenticate();
    const m = await Match.findOne({ where: { externalId: "EXTERNAL_ID_HERE" } });
    if (!m) { console.log("not found"); process.exit(0); }
    await m.update({ status: "completed", currentPhase: "completed" } as any);
    console.log(`marked ${m.team1Short} vs ${m.team2Short} completed`);
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
  ```
- `fixDuplicateDisplayNames.ts` — ran once to resolve a `users.displayName must be unique` constraint the DB had rejected during `sync({alter:true})`. Unlikely to be needed again.
