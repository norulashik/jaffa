// Hand-curated 40-over T20 script for the owner-portal simulation match.
// Two synthetic squads (SIM1 "Sim Reds", SIM2 "Sim Blues") and a per-over
// outcome list. The simulationRunner advances one ball per tick; the
// per-over outcome rows are also exposed so future versions can plug into
// the per-over question resolver without re-walking the ball stream.
//
// Why hand-curated and not random: the owner portal exists to be reproducible.
// Every replay should produce the same scorecard so the admin can verify
// punter-card / Kong behaviour against a fixed expectation.

export interface SimBall {
  scoreboard: "S1" | "S2";
  ball: string;        // "0.1", "0.2", ... canonical Sportmonks notation
  batsman: string;     // batsman fullname
  bowler: string;      // bowler fullname
  runs: number;        // batter runs off this ball
  isLegal: boolean;    // false for wide/no-ball
  isWicket: boolean;
  isSix: boolean;
  isFour: boolean;
}

export const SIM_TEAM_1 = {
  short: "SIM1",
  full: "Sim Reds",
  players: [
    "Ravi Storm", "Aman Frost", "Karan Blaze", "Vikram Steel", "Nikhil Quartz",
    "Devan Marble", "Pranav Onyx", "Rohan Vesper", "Ishan Comet", "Sahil Pulse", "Tarun Nova",
  ],
};

export const SIM_TEAM_2 = {
  short: "SIM2",
  full: "Sim Blues",
  players: [
    "Aiden Aurora", "Bharat Tide", "Chetan Drift", "Dinesh Echo", "Eshan Flicker",
    "Farid Glow", "Gaurav Halo", "Harish Indigo", "Jatin Jet", "Kabir Kite", "Latif Loop",
  ],
};

// Compact over outcome — used by the runner to update scoreboard totals
// over-by-over without resolving each ball. `balls` is the Sportmonks-shaped
// stream for that over so it can also be appended to allBalls if a future
// resolver wants the granular detail.
export interface SimOver {
  scoreboard: "S1" | "S2";
  overNumber: number;     // 1-20
  runs: number;           // total runs scored in the over (incl. extras)
  wickets: number;        // wickets fallen in the over
  balls: SimBall[];
}

// Build a 6-legal-ball over from a compact descriptor. Each ball is just a
// per-batter run figure; W means wicket (0 runs, treated as legal).
function buildOver(
  scoreboard: "S1" | "S2",
  overNumber: number,
  bowler: string,
  batter: string,
  runs: (number | "W")[],
): SimOver {
  let totalRuns = 0;
  let wickets = 0;
  const balls: SimBall[] = runs.map((r, i) => {
    const isWicket = r === "W";
    const ballRuns = isWicket ? 0 : (r as number);
    totalRuns += ballRuns;
    if (isWicket) wickets += 1;
    return {
      scoreboard,
      ball: `${overNumber - 1}.${i + 1}`,
      batsman: batter,
      bowler,
      runs: ballRuns,
      isLegal: true,
      isWicket,
      isSix: ballRuns === 6,
      isFour: ballRuns === 4,
    };
  });
  return { scoreboard, overNumber, runs: totalRuns, wickets, balls };
}

// Innings 1: SIM1 batting, SIM2 bowling. ~150/6 final.
const innings1: SimOver[] = [
  buildOver("S1",  1, "Aiden Aurora", "Ravi Storm",   [1, 0, 4, 1, 0, 2]),
  buildOver("S1",  2, "Bharat Tide",  "Aman Frost",   [4, 1, 0, 6, 1, 1]),
  buildOver("S1",  3, "Aiden Aurora", "Ravi Storm",   [1, 0, "W", 0, 4, 1]),
  buildOver("S1",  4, "Chetan Drift", "Karan Blaze",  [2, 1, 1, 4, 0, 1]),
  buildOver("S1",  5, "Bharat Tide",  "Karan Blaze",  [6, 1, 0, 1, 4, 1]),
  buildOver("S1",  6, "Dinesh Echo",  "Vikram Steel", [1, 1, 0, "W", 1, 0]),
  buildOver("S1",  7, "Chetan Drift", "Vikram Steel", [1, 1, 0, 1, 4, 1]),
  buildOver("S1",  8, "Eshan Flicker","Nikhil Quartz",[1, 0, 6, 1, 0, 2]),
  buildOver("S1",  9, "Dinesh Echo",  "Nikhil Quartz",[1, 1, 0, "W", 4, 1]),
  buildOver("S1", 10, "Eshan Flicker","Devan Marble", [4, 1, 0, 1, 1, 1]),
  buildOver("S1", 11, "Farid Glow",   "Devan Marble", [1, 1, 6, 1, 0, 0]),
  buildOver("S1", 12, "Eshan Flicker","Pranav Onyx",  [1, 0, 1, 1, 0, "W"]),
  buildOver("S1", 13, "Farid Glow",   "Rohan Vesper", [1, 4, 0, 1, 1, 0]),
  buildOver("S1", 14, "Gaurav Halo",  "Rohan Vesper", [1, 1, 6, 0, 1, 1]),
  buildOver("S1", 15, "Farid Glow",   "Rohan Vesper", [1, 4, 0, "W", 1, 1]),
  buildOver("S1", 16, "Gaurav Halo",  "Ishan Comet",  [1, 1, 6, 1, 0, 4]),
  buildOver("S1", 17, "Harish Indigo","Ishan Comet",  [1, 0, 4, 1, "W", 0]),
  buildOver("S1", 18, "Gaurav Halo",  "Sahil Pulse",  [4, 6, 1, 0, 1, 0]),
  buildOver("S1", 19, "Harish Indigo","Sahil Pulse",  [6, 1, 0, "W", 0, 1]),
  buildOver("S1", 20, "Gaurav Halo",  "Tarun Nova",   [1, 4, 6, 0, 1, 4]),
];

// Innings 2: SIM2 batting, SIM1 bowling. ~145/8 chase, falls just short.
const innings2: SimOver[] = [
  buildOver("S2",  1, "Ravi Storm",   "Aiden Aurora", [1, 4, 0, 1, 0, 1]),
  buildOver("S2",  2, "Aman Frost",   "Bharat Tide",  [2, 0, 6, 1, 1, 1]),
  buildOver("S2",  3, "Ravi Storm",   "Aiden Aurora", [0, 4, 1, "W", 1, 0]),
  buildOver("S2",  4, "Karan Blaze",  "Chetan Drift", [1, 0, 1, 4, 1, 0]),
  buildOver("S2",  5, "Karan Blaze",  "Bharat Tide",  [4, 1, 0, "W", 1, 0]),
  buildOver("S2",  6, "Vikram Steel", "Dinesh Echo",  [1, 1, 0, 0, 1, 4]),
  buildOver("S2",  7, "Vikram Steel", "Chetan Drift", [1, 0, 1, 1, 0, 6]),
  buildOver("S2",  8, "Nikhil Quartz","Eshan Flicker",[1, 1, 0, "W", 0, 1]),
  buildOver("S2",  9, "Nikhil Quartz","Dinesh Echo",  [4, 1, 1, 0, 1, 1]),
  buildOver("S2", 10, "Devan Marble", "Eshan Flicker",[1, 0, 1, 1, 6, 0]),
  buildOver("S2", 11, "Devan Marble", "Farid Glow",   [1, 4, 0, "W", 1, 1]),
  buildOver("S2", 12, "Pranav Onyx",  "Eshan Flicker",[1, 1, 0, 1, 0, 4]),
  buildOver("S2", 13, "Rohan Vesper", "Farid Glow",   [1, 0, 6, 1, 0, 1]),
  buildOver("S2", 14, "Rohan Vesper", "Gaurav Halo",  [4, 1, 0, 1, "W", 0]),
  buildOver("S2", 15, "Rohan Vesper", "Farid Glow",   [1, 1, 4, 0, 1, 1]),
  buildOver("S2", 16, "Ishan Comet",  "Gaurav Halo",  [0, 1, 1, "W", 0, 0]),
  buildOver("S2", 17, "Ishan Comet",  "Harish Indigo",[6, 1, 1, 0, 4, 1]),
  buildOver("S2", 18, "Sahil Pulse",  "Gaurav Halo",  [4, "W", 1, 0, 1, 0]),
  buildOver("S2", 19, "Sahil Pulse",  "Harish Indigo",[1, 6, 0, "W", 0, 1]),
  buildOver("S2", 20, "Tarun Nova",   "Gaurav Halo",  [1, 4, 1, 0, 1, "W"]),
];

export const SIM_OVERS: SimOver[] = [...innings1, ...innings2];

// Flat ball stream — useful when a caller wants ball-by-ball progression
// without re-walking the over array. Order matches play (S1 over 1 → S1
// over 20 → S2 over 1 → S2 over 20).
export const SIM_BALLS: SimBall[] = SIM_OVERS.flatMap((o) => o.balls);

export const SIM_TOTAL_BALLS = SIM_BALLS.length;
