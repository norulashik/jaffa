import assert from "assert";
import { ALL_CORRECT_OPTION } from "../services/pointsEngine";
import { playerKey } from "../services/predictionEngine";
import { computeCorrectFromBalls, scoreboardForTeam, VOID_OPTION } from "../services/punterCard";
import type { Player } from "../data/iplSquads";

const rcb: Player[] = [
  { name: "Virat Kohli", role: "bat" },
  { name: "Jitesh Sharma", role: "wk" },
  { name: "Romario Shepherd", role: "all" },
];

const gt: Player[] = [
  { name: "Shubman Gill", role: "bat" },
  { name: "B. Sai Sudharsan", role: "bat" },
  { name: "Jos Buttler", role: "wk" },
  { name: "Washington Sundar", role: "all" },
];

const match = {
  team1Players: rcb.map((p) => p.name),
  team2Players: ["Shubman Gill", "Sai Sudharsan", "Jos Buttler", "Washington Sundar"],
} as any;

const pool = { team1Players: rcb, team2Players: gt };

function ball(scoreboard: "S1" | "S2", ballNo: number, batsman: string, runs: number, extra: any = {}) {
  return {
    scoreboard,
    ball: String(ballNo),
    batsman: { fullname: batsman },
    bowler: extra.bowler ? { fullname: extra.bowler } : undefined,
    catchstump: extra.catchstump ? { fullname: extra.catchstump } : undefined,
    batsmanout_id: extra.wicket ? 1 : null,
    score: {
      runs,
      ball: extra.legal === false ? false : true,
      four: runs === 4,
      six: runs === 6,
      is_wicket: !!extra.wicket,
      name: extra.wicketName || "",
    },
  };
}

function batterBalls(scoreboard: "S1" | "S2", name: string, runs: number[], start: number) {
  return runs.map((r, i) => ball(scoreboard, start + (i + 1) / 10, name, r));
}

const screenshotBalls = [
  ...batterBalls("S1", "Virat Kohli", [6, 4, 4, 4, 4, 4, 1, 1], 0),
  ...batterBalls("S1", "Jitesh Sharma", [1, 0, 0], 5),
  ...batterBalls("S1", "Romario Shepherd", [6, 6, 4, 1], 10),
  ball("S2", 0.1, "Sai Sudharsan", 1),
  ball("S2", 0.2, "Shubman Gill", 6),
  ...batterBalls("S2", "Shubman Gill", [4, 4, 4, 4, 6, 6, 6, 3], 1),
  ...batterBalls("S2", "Jos Buttler", [6, 6, 6, 6, 4, 4, 1, 1, 1, 4], 5),
  ...batterBalls("S2", "Washington Sundar", [6, 4, 1, 1], 9),
  ball("S2", 12.1, "Rahul Tewatia", 0, { bowler: "Romario Shepherd", wicket: true, wicketName: "caught" }),
  ball("S2", 13.1, "Shahrukh Khan", 0, { bowler: "Romario Shepherd", wicket: true, wicketName: "caught" }),
];

const fixture = {
  lineup: {
    data: [
      { id: 1, fullname: "Virat Kohli" },
      { id: 2, fullname: "Shubman Gill" },
      { id: 3, fullname: "Jos Buttler" },
      { id: 4, fullname: "Jitesh Sharma" },
      { id: 5, fullname: "Washington Sundar" },
      { id: 6, fullname: "Romario Shepherd" },
    ],
  },
  batting: {
    data: [
      { player_id: 1, score: 28, ball: 13, rate: 215 },
      { player_id: 2, score: 43, ball: 18, rate: 239 },
      { player_id: 3, score: 39, ball: 19, rate: 205 },
      { player_id: 4, score: 1, ball: 3, rate: 33 },
      { player_id: 5, score: 12, ball: 12, rate: 100 },
      { player_id: 6, score: 17, ball: 15, rate: 113 },
    ],
  },
  bowling: {
    data: [
      { player_id: 5, wickets: 0, runs: 0 },
      { player_id: 6, wickets: 2, runs: 30 },
    ],
  },
};

function option(name: string, label = name) {
  return { key: playerKey(name), label };
}

assert.strictEqual(
  computeCorrectFromBalls(
    {
      templateKey: "punter_star_batter_lower",
      options: [option("Shubman Gill"), option("Virat Kohli"), { key: ALL_CORRECT_OPTION, label: "Tie" }],
    },
    fixture,
    screenshotBalls,
    match,
    pool,
  ),
  playerKey("Virat Kohli"),
  "Virat should win lower-runs head-to-head: 28 < 43",
);

assert.strictEqual(
  computeCorrectFromBalls(
    {
      templateKey: "punter_wk_better_sr",
      options: [option("Jos Buttler"), option("Jitesh Sharma"), { key: ALL_CORRECT_OPTION, label: "Neither bats" }],
    },
    fixture,
    screenshotBalls,
    match,
    pool,
  ),
  playerKey("Jos Buttler"),
  "Jos Buttler should win strike-rate head-to-head",
);

assert.strictEqual(
  computeCorrectFromBalls(
    {
      templateKey: "punter_allrounder_impact",
      options: [
        option("Washington Sundar", "Washington Sundar (runs+wkts+catches)"),
        option("Romario Shepherd", "Romario Shepherd (runs+wkts+catches)"),
        { key: ALL_CORRECT_OPTION, label: "Tied" },
      ],
    },
    fixture,
    screenshotBalls,
    match,
    pool,
  ),
  playerKey("Romario Shepherd"),
  "Romario should win impact despite the display suffix in the option label",
);

assert.strictEqual(
  computeCorrectFromBalls(
    { templateKey: "punter_first_event", options: [{ key: "six", label: "First six" }, { key: "wicket", label: "First wicket" }] },
    fixture,
    screenshotBalls,
    match,
    pool,
  ),
  "six",
  "first event should come from chronological ball feed",
);

assert.strictEqual(
  scoreboardForTeam(screenshotBalls, gt),
  "S2",
  "team scoreboard mapping should tolerate B. Sai Sudharsan vs Sai Sudharsan",
);

assert.strictEqual(
  computeCorrectFromBalls(
    {
      templateKey: "punter_star_batter_lower",
      options: [option("Glenn Maxwell"), option("Virat Kohli"), { key: ALL_CORRECT_OPTION, label: "Tie" }],
    },
    fixture,
    screenshotBalls,
    match,
    pool,
  ),
  VOID_OPTION,
  "head-to-head should void when a named player is not in the XI",
);

const tieBalls = [
  ...batterBalls("S1", "Virat Kohli", [4, 6], 0),
  ...batterBalls("S2", "Shubman Gill", [6, 4], 0),
];

assert.strictEqual(
  computeCorrectFromBalls(
    {
      templateKey: "punter_star_batter_lower",
      options: [option("Shubman Gill"), option("Virat Kohli"), { key: ALL_CORRECT_OPTION, label: "Tie" }],
    },
    fixture,
    tieBalls,
    match,
    pool,
  ),
  ALL_CORRECT_OPTION,
  "exact head-to-head ties should resolve to the visible tie option",
);

const multiWinner = computeCorrectFromBalls(
  {
    templateKey: "punter_top_batter",
    options: [option("Shubman Gill"), option("Virat Kohli")],
  },
  fixture,
  tieBalls,
  match,
  pool,
);
assert.deepStrictEqual(
  new Set((multiWinner || "").split(",")),
  new Set([playerKey("Shubman Gill"), playerKey("Virat Kohli")]),
  "top-batter exact ties should preserve comma-joined multiple winners",
);

console.log("[PunterCardRegression] all assertions passed");
