import assert from "assert";
import type { Player } from "../data/iplSquads";
import { ALL_CORRECT_OPTION } from "../services/pointsEngine";
import { playerKey } from "../services/predictionEngine";
import { buildPunterCardQuestions, computeCorrectFromBalls, scoreboardForTeam, VOID_OPTION } from "../services/punterCard";

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

// Per the post-Nitish-Kumar-Reddy product call: absent players are treated
// as 0 instead of voiding the question. For the "scores LESS" template
// that means the absent player trivially has the lower score (0 < any
// real total), so picks landing on the absent player win. Asymmetric but
// the directive is "no more cheap voids".
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
  playerKey("Glenn Maxwell"),
  "absent player counts as 0 runs and wins the 'scores less' head-to-head",
);

// Same shape but for "bigger impact": the present player should win
// because absent → 0 impact. This is the exact NKR-vs-Cameron-Green
// scenario from production — used to void, must now resolve to Cameron.
assert.strictEqual(
  computeCorrectFromBalls(
    {
      templateKey: "punter_allrounder_impact",
      options: [
        option("Glenn Maxwell", "Glenn Maxwell (runs+wkts+catches)"),
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
  "absent all-rounder counts as 0 impact; present player auto-wins",
);

// Strike-rate variant: absent WK → null SR → other WK auto-wins.
assert.strictEqual(
  computeCorrectFromBalls(
    {
      templateKey: "punter_wk_better_sr",
      options: [option("Glenn Maxwell"), option("Jitesh Sharma"), { key: ALL_CORRECT_OPTION, label: "Neither bats" }],
    },
    fixture,
    screenshotBalls,
    match,
    pool,
  ),
  playerKey("Jitesh Sharma"),
  "absent WK has no SR; present WK auto-wins the 'better SR' head-to-head",
);
void VOID_OPTION;

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

// ── Frequency-aware picker regression ──────────────────────────────────
// Reproduces the "Shivam Dube vs Hardik Pandya" scenario: Dube is listed
// as CSK's all-rounder in the static squad but was dropped for today's
// match, while another all-rounder (e.g. Jamie Overton) actually plays
// every game. The picker should prefer the high-appearance all-rounder so
// the head-to-head doesn't void on the user.
{
  const csk: Player[] = [
    { name: "Ruturaj Gaikwad", role: "bat", appearanceCount: 5 },
    { name: "Sanju Samson",    role: "wk",  appearanceCount: 5 },
    { name: "Shivam Dube",     role: "all", appearanceCount: 1 }, // benched 4/5
    { name: "Jamie Overton",   role: "all", appearanceCount: 5 }, // plays every game
    { name: "Noor Ahmad",      role: "bowl", appearanceCount: 5 },
  ];
  const mi: Player[] = [
    { name: "Suryakumar Yadav", role: "bat", appearanceCount: 5 },
    { name: "Ryan Rickleton",   role: "wk",  appearanceCount: 5 },
    { name: "Hardik Pandya",    role: "all", appearanceCount: 5 },
    { name: "Jasprit Bumrah",   role: "bowl", appearanceCount: 5 },
  ];

  // Ensure the resolveSquadPool path sees a "real XI announced" so the
  // builder doesn't try to load real squad data — pass team1Players /
  // team2Players already populated. resolveSquadPool isn't actually called
  // in this test (we're calling buildPunterCardQuestions directly), so the
  // values just have to exist.
  const matchObj = {
    id: "test-match",
    team1: "Chennai Super Kings", team2: "Mumbai Indians",
    team1Short: "CSK", team2Short: "MI",
    team1Players: csk.map((p) => p.name),
    team2Players: mi.map((p) => p.name),
  } as any;

  const questions = buildPunterCardQuestions(matchObj, { team1Players: csk, team2Players: mi });
  const allroundQ = questions.find((q) => q.templateKey === "punter_allrounder_impact");
  assert.ok(allroundQ, "allrounder impact question should generate when both teams have an all-rounder");
  assert.ok(
    /Jamie Overton/.test(allroundQ!.question),
    `frequency picker should pin CSK's regular all-rounder (Jamie Overton), not the benched Shivam Dube — got: ${allroundQ!.question}`,
  );
  assert.ok(
    !/Shivam Dube/.test(allroundQ!.question),
    `Shivam Dube should NOT appear in the all-rounder head-to-head when his appearanceCount is 1 vs Overton's 5`,
  );
}

// ── Name-drift regression: lineup-membership check uses fuzzy matching ──
// "Ryan Rickleton" (squad spelling) vs "Ryan Rickelton" (Sportmonks ball-feed
// spelling) should resolve via the static alias table — without this, the
// punter_wk_better_sr question voids even when both keepers actually played.
{
  const lineupBalls = [
    ball("S1", 0.1, "Ryan Rickelton", 4), // note Sportmonks spelling
    ball("S1", 0.2, "Ryan Rickelton", 6),
    ball("S2", 0.1, "Sanju Samson", 1),
    ball("S2", 0.2, "Sanju Samson", 0),
  ];
  const lineupFixture = {
    lineup: { data: [{ id: 10, fullname: "Ryan Rickelton" }, { id: 11, fullname: "Sanju Samson" }] },
    batting: {
      data: [
        { player_id: 10, score: 10, ball: 2, rate: 500 }, // SR 500
        { player_id: 11, score: 1,  ball: 2, rate: 50 },  // SR 50
      ],
    },
    bowling: { data: [] },
  };
  const lineupMatch = {
    team1Players: ["Ryan Rickelton"], // Sportmonks spelling lands in DB at toss
    team2Players: ["Sanju Samson"],
  } as any;

  const result = computeCorrectFromBalls(
    {
      templateKey: "punter_wk_better_sr",
      options: [
        option("Ryan Rickleton"),                                  // squad spelling baked into question
        option("Sanju Samson"),
        { key: ALL_CORRECT_OPTION, label: "Neither bats" },
      ],
    },
    lineupFixture,
    lineupBalls,
    lineupMatch,
    null,
  );
  assert.strictEqual(
    result,
    playerKey("Ryan Rickleton"),
    "Rickleton/Rickelton spelling drift should resolve via the static alias and award the keeper with the higher SR — not void",
  );
}

console.log("[PunterCardRegression] all assertions passed");
