import { Prediction } from "../models";

// Pre-match question templates (5 questions)
export function generatePreMatchPredictions(
  matchId: string,
  team1: string,
  team2: string,
  team1Short: string,
  team2Short: string,
  team1Players: string[],
  team2Players: string[]
): Array<{
  matchId: string;
  category: string;
  round: number;
  question: string;
  options: { key: string; label: string; points: number; image?: string; team?: string; color?: string }[];
}> {
  // Pick 3 star players from each team for MOTM
  const team1Stars = team1Players.slice(0, 3).map((player) => ({
    key: player.toLowerCase().replace(/\s+/g, "_"),
    label: player,
    points: 75,
    image: `/players/${player.toLowerCase().replace(/\s+/g, "_")}.png`,
    team: team1Short,
    color: IPL_TEAM_COLORS[team1Short] || "#f97316",
  }));

  const team2Stars = team2Players.slice(0, 3).map((player) => ({
    key: player.toLowerCase().replace(/\s+/g, "_"),
    label: player,
    points: 75,
    image: `/players/${player.toLowerCase().replace(/\s+/g, "_")}.png`,
    team: team2Short,
    color: IPL_TEAM_COLORS[team2Short] || "#3b82f6",
  }));

  return [
    // Q1: Who wins tonight?
    {
      matchId,
      category: "pre_match",
      round: 0,
      question: "Who wins tonight?",
      options: [
        {
          key: team1Short.toLowerCase(),
          label: team1Short,
          points: 25,
          image: `/teams/${team1Short.toLowerCase()}.png`,
          team: team1Short,
          color: IPL_TEAM_COLORS[team1Short] || "#f97316",
        },
        {
          key: team2Short.toLowerCase(),
          label: team2Short,
          points: 25,
          image: `/teams/${team2Short.toLowerCase()}.png`,
          team: team2Short,
          color: IPL_TEAM_COLORS[team2Short] || "#3b82f6",
        },
      ],
    },
    // Q2: Man of the match
    {
      matchId,
      category: "pre_match",
      round: 0,
      question: "Pick your man of the match — who steals the show tonight?",
      options: [...team1Stars, ...team2Stars],
    },
    // Q3: Toss + decision
    {
      matchId,
      category: "pre_match",
      round: 0,
      question: "Toss time — who wins and what do they pick?",
      options: [
        { key: `${team1Short.toLowerCase()}_bat`, label: `${team1Short} wins, bats first`, points: 20, team: team1Short, color: IPL_TEAM_COLORS[team1Short] || "#f97316" },
        { key: `${team1Short.toLowerCase()}_field`, label: `${team1Short} wins, fields first`, points: 20, team: team1Short, color: IPL_TEAM_COLORS[team1Short] || "#f97316" },
        { key: `${team2Short.toLowerCase()}_bat`, label: `${team2Short} wins, bats first`, points: 20, team: team2Short, color: IPL_TEAM_COLORS[team2Short] || "#3b82f6" },
        { key: `${team2Short.toLowerCase()}_field`, label: `${team2Short} wins, fields first`, points: 20, team: team2Short, color: IPL_TEAM_COLORS[team2Short] || "#3b82f6" },
      ],
    },
    // Q4: Which team hits more sixes?
    {
      matchId,
      category: "pre_match",
      round: 0,
      question: "Which team hits more sixes tonight?",
      options: [
        {
          key: team1Short.toLowerCase(),
          label: team1Short,
          points: 25,
          image: `/teams/${team1Short.toLowerCase()}.png`,
          team: team1Short,
          color: IPL_TEAM_COLORS[team1Short] || "#f97316",
        },
        {
          key: team2Short.toLowerCase(),
          label: team2Short,
          points: 25,
          image: `/teams/${team2Short.toLowerCase()}.png`,
          team: team2Short,
          color: IPL_TEAM_COLORS[team2Short] || "#3b82f6",
        },
      ],
    },
    // Q5: First wicket — how does it fall?
    {
      matchId,
      category: "pre_match",
      round: 0,
      question: "First wicket — how does it fall?",
      options: [
        { key: "caught", label: "Caught", points: 20 },
        { key: "bowled", label: "Bowled", points: 25 },
        { key: "lbw", label: "LBW", points: 30 },
        { key: "run_out", label: "Run Out", points: 35 },
        { key: "stumped", label: "Stumped", points: 40 },
      ],
    },
  ];
}

// IPL team colors
const IPL_TEAM_COLORS: Record<string, string> = {
  CSK: "#f9cd05",
  MI: "#004ba0",
  RCB: "#d4213d",
  KKR: "#3a225d",
  DC: "#004c93",
  RR: "#ea1a85",
  PBKS: "#ed1b24",
  SRH: "#f7a721",
  GT: "#1c1c2b",
  LSG: "#005da0",
};

// Per-over question pool (10 templates)
const perOverPool = [
  {
    key: "runs_this_over",
    question: (over: number) => `Over ${over} — how many runs?`,
    options: [
      { key: "low", label: "0-5 runs", points: 10 },
      { key: "medium", label: "6-10 runs", points: 10 },
      { key: "high", label: "11+ runs", points: 10 },
    ],
  },
  {
    key: "wicket_this_over",
    question: (over: number) => `Wicket in over ${over}?`,
    options: [
      { key: "yes", label: "Yes", points: 15 },
      { key: "no", label: "No", points: 10 },
    ],
  },
  {
    key: "sixes_this_over",
    question: (over: number) => `Sixes in over ${over}?`,
    options: [
      { key: "zero", label: "0 — bowlers on top", points: 10 },
      { key: "one", label: "1 six", points: 10 },
      { key: "two", label: "2 sixes", points: 15 },
      { key: "three_plus", label: "3+ sixes", points: 25 },
    ],
  },
  {
    key: "boundary_first_ball",
    question: (over: number) => `Boundary off the first ball of over ${over}?`,
    options: [
      { key: "yes", label: "Yes", points: 20 },
      { key: "no", label: "No", points: 10 },
    ],
  },
  {
    key: "dot_balls",
    question: (over: number) => `Dot balls in over ${over}?`,
    options: [
      { key: "few", label: "0-2 dots", points: 10 },
      { key: "some", label: "3-4 dots", points: 10 },
      { key: "lots", label: "5+ dots", points: 10 },
    ],
  },
  {
    key: "last_ball_outcome",
    question: (over: number) => `How does over ${over} end — last ball?`,
    options: [
      { key: "dot", label: "Dot ball", points: 10 },
      { key: "single", label: "Single", points: 10 },
      { key: "boundary", label: "Boundary (4 or 6)", points: 15 },
      { key: "wicket", label: "Wicket", points: 25 },
    ],
  },
  {
    key: "over_score_10_plus",
    question: (over: number, _batterName?: string) =>
      `Will over ${over} score 10+ total runs?`,
    options: [
      { key: "yes", label: "Yes — big over", points: 20 },
      { key: "no", label: "No — under 10", points: 10 },
    ],
  },
  {
    key: "multiple_boundaries",
    question: (over: number) => `More than 2 boundaries in over ${over}?`,
    options: [
      { key: "yes", label: "Yes — boundary fest", points: 20 },
      { key: "no", label: "No — controlled over", points: 10 },
    ],
  },
  {
    key: "maiden_over",
    question: (over: number) => `Maiden over in over ${over}? 👀`,
    options: [
      { key: "yes", label: "Yes — bowler dominance", points: 30 },
      { key: "no", label: "No", points: 5 },
    ],
  },
  {
    key: "last_ball_runs",
    question: (over: number) => `Last ball of over ${over} — runs?`,
    options: [
      { key: "zero", label: "0 (dot ball)", points: 10 },
      { key: "single_double", label: "1-2 runs", points: 10 },
      { key: "three_plus", label: "3+ runs", points: 10 },
    ],
  },
];

// Track which questions were used recently to avoid repeats within 3 overs
const recentQuestions: Map<string, string[]> = new Map(); // matchId -> last N question keys

export function generatePerOverPredictions(
  matchId: string,
  overNumber: number,
  round: number,
  currentBatter?: string
): Array<{
  matchId: string;
  category: string;
  round: number;
  overNumber: number;
  question: string;
  options: { key: string; label: string; points: number }[];
}> {
  const recentKey = matchId;
  const recent = recentQuestions.get(recentKey) || [];

  // Always include "how many runs" question
  const runsQuestion = perOverPool.find((q) => q.key === "runs_this_over")!;

  // Pick 2 random from remaining pool (excluding runs_this_over), with dedup
  const remainingPool = perOverPool.filter((q) => q.key !== "runs_this_over");
  const available = remainingPool.filter((q) => !recent.includes(q.key));
  const pool = available.length >= 2 ? available : remainingPool;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const randomPicks = shuffled.slice(0, 2);
  const selected = [runsQuestion, ...randomPicks];

  // Only track the 2 random picks in dedup (runs_this_over is always used)
  const newRecent = [...recent, ...randomPicks.map((s) => s.key)].slice(-6);
  recentQuestions.set(recentKey, newRecent);

  return selected.map((template) => ({
    matchId,
    category: "per_over" as const,
    round,
    overNumber,
    question: template.question(overNumber, currentBatter),
    options: template.options,
  }));
}

// Hot Takes — one per round start
export function generateHotTake(
  matchId: string,
  round: number,
  team1Short: string,
  team2Short: string,
  scoreData?: Record<string, unknown>
): {
  matchId: string;
  category: string;
  round: number;
  question: string;
  options: { key: string; label: string; points: number }[];
} | null {
  const hotTakes: Record<number, () => { question: string; options: { key: string; label: string; points: number }[] }> = {
    // Round 1: 1st Innings Powerplay (Overs 1-6)
    1: () => ({
      question: "More runs in the powerplay — first 3 overs or last 3?",
      options: [
        { key: "first_3", label: "First 3 overs (1-3)", points: 20 },
        { key: "last_3", label: "Last 3 overs (4-6)", points: 20 },
      ],
    }),
    // Round 2: 1st Innings Middle (Overs 7-15)
    2: () => ({
      question: "Highest partnership this innings — how big will it be?",
      options: [
        { key: "under_30", label: "Under 30 — wickets keep falling", points: 25 },
        { key: "30_50", label: "30-50 — decent but nothing special", points: 20 },
        { key: "50_75", label: "50-75 — solid partnership", points: 20 },
        { key: "75_plus", label: "75+ — match-defining stand", points: 30 },
      ],
    }),
    // Round 3: 1st Innings Death (Overs 16-20)
    3: () => ({
      question: "Total first innings score — what's your gut say?",
      options: [
        { key: "low", label: "Under 150 — batting collapse", points: 25 },
        { key: "par", label: "150-175 — competitive total", points: 25 },
        { key: "high", label: "175-200 — strong batting", points: 25 },
        { key: "massive", label: "200+ — absolute carnage", points: 25 },
      ],
    }),
    // Round 4: Chase Powerplay (Overs 1-6)
    4: () => ({
      question: "Will the match go to the last over?",
      options: [
        { key: "yes", label: "Yes — it's going down to the wire", points: 25 },
        { key: "no", label: "No — decided well before that", points: 15 },
      ],
    }),
    // Round 5: Chase Middle (Overs 7-15)
    5: () => ({
      question: "How many wickets fall in the chase by over 15?",
      options: [
        { key: "0_2", label: "0-2 — steady chase", points: 20 },
        { key: "3_4", label: "3-4 — under pressure", points: 20 },
        { key: "5_6", label: "5-6 — collapse incoming", points: 25 },
        { key: "7_plus", label: "7+ — total meltdown", points: 30 },
      ],
    }),
    // Round 6: Chase Death (Overs 16-20)
    6: () => ({
      question: "What's the biggest over in the death — how many runs?",
      options: [
        { key: "under_10", label: "Under 10", points: 15 },
        { key: "10_15", label: "10-15", points: 20 },
        { key: "16_20", label: "16-20", points: 25 },
        { key: "20_plus", label: "20+", points: 30 },
      ],
    }),
  };

  const generator = hotTakes[round];
  if (!generator) return null;

  const { question, options } = generator();

  return {
    matchId,
    category: "hot_take",
    round,
    question,
    options,
  };
}

// Innings Break Questions — asked between innings
export function generateRivalryCalls(
  matchId: string,
  target: number,
  team2Short: string,
  team2Players: string[]
): Array<{
  matchId: string;
  category: string;
  round: number;
  question: string;
  options: { key: string; label: string; points: number }[];
}> {
  const predictions = [
    // Q1: Chase done in which phase?
    {
      matchId,
      category: "rivalry_call",
      round: 4, // assigned to chase powerplay round for points tracking
      question: `${team2Short} need ${target} — chase done in which phase?`,
      options: [
        { key: "powerplay", label: "Powerplay (overs 1-6)", points: 35 },
        { key: "middle", label: "Middle overs (7-15)", points: 25 },
        { key: "death", label: "Death overs (16-20)", points: 20 },
        { key: "not_chased", label: "Not chased — bowlers win", points: 25 },
      ],
    },
  ];

  // Q2: Who hits the winning runs?
  if (team2Players.length >= 4) {
    const candidates = team2Players.slice(0, 5);
    predictions.push({
      matchId,
      category: "rivalry_call",
      round: 4, // assigned to chase powerplay round for points tracking
      question: "Who hits the winning runs?",
      options: candidates.map((player) => ({
        key: player.toLowerCase().replace(/\s+/g, "_"),
        label: player,
        points: 50,
      })),
    });
  }

  return predictions;
}

// Determine which round based on current over and innings
export function getCurrentRound(currentInnings: number, currentOver: number): number {
  if (currentInnings === 0) return 0; // pre-match
  if (currentInnings === 1) {
    if (currentOver <= 6) return 1;  // 1st Innings Powerplay
    if (currentOver <= 15) return 2; // 1st Innings Middle
    return 3;                         // 1st Innings Death
  }
  // Second innings — mirrors first innings rounds
  if (currentOver <= 6) return 4;    // Chase Powerplay
  if (currentOver <= 15) return 5;   // Chase Middle
  return 6;                           // Chase Death
}
