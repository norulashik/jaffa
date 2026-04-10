import { Prediction } from "../models";

// Pre-match question templates (4 questions)
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
    // Q2: Toss + decision
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
    // Q3: Which team hits more sixes?
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
        {
          key: "tie",
          label: "Tie — same number of sixes",
          points: 25,
          color: "#94a3b8",
        },
      ],
    },
    // Q4: First wicket — how does it fall?
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
// semanticGroup: questions in the same group cannot appear together in the same over
const perOverPool = [
  {
    key: "runs_this_over",
    semanticGroup: "runs",
    question: (over: number) => `Over ${over} — how many runs?`,
    options: [
      { key: "low", label: "0-5 runs", points: 10 },
      { key: "medium", label: "6-10 runs", points: 10 },
      { key: "high", label: "11+ runs", points: 10 },
    ],
  },
  {
    key: "wicket_this_over",
    semanticGroup: "wicket",
    question: (over: number) => `Wicket in over ${over}?`,
    options: [
      { key: "yes", label: "Yes", points: 15 },
      { key: "no", label: "No", points: 10 },
    ],
  },
  {
    key: "sixes_this_over",
    semanticGroup: "six",
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
    semanticGroup: "boundary",
    question: (over: number) => `Boundary off the first ball of over ${over}?`,
    options: [
      { key: "yes", label: "Yes", points: 20 },
      { key: "no", label: "No", points: 10 },
    ],
  },
  {
    key: "dot_balls",
    semanticGroup: "dots",
    question: (over: number) => `Dot balls in over ${over}?`,
    options: [
      { key: "few", label: "0-2 dots", points: 10 },
      { key: "some", label: "3-4 dots", points: 10 },
      { key: "lots", label: "5+ dots", points: 10 },
    ],
  },
  {
    key: "last_ball_outcome",
    semanticGroup: "last_ball",
    question: (over: number) => `How does over ${over} end — last ball?`,
    options: [
      { key: "dot", label: "Dot ball", points: 10 },
      { key: "single", label: "Single", points: 10 },
      { key: "boundary", label: "Boundary (4 or 6)", points: 15 },
      { key: "wicket", label: "Wicket", points: 25 },
    ],
  },
  {
    key: "multiple_boundaries",
    semanticGroup: "boundary",  // same group as boundary_first_ball
    question: (over: number) => `More than 2 boundaries in over ${over}?`,
    options: [
      { key: "yes", label: "Yes — boundary fest", points: 20 },
      { key: "no", label: "No — controlled over", points: 10 },
    ],
  },
  {
    key: "maiden_over",
    semanticGroup: "maiden",
    question: (over: number) => `Maiden over in over ${over}?`,
    options: [
      { key: "yes", label: "Yes — bowler dominance", points: 30 },
      { key: "no", label: "No", points: 5 },
    ],
  },
  {
    key: "extras_this_over",
    semanticGroup: "extras",
    question: (over: number) => `How many extras in over ${over}?`,
    options: [
      { key: "none", label: "None (0)", points: 15 },
      { key: "one_two", label: "1-2 extras", points: 10 },
      { key: "three_plus", label: "3+", points: 20 },
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
  const usedGroups = new Set<string>([runsQuestion.semanticGroup]);

  // Pick 2 random from remaining pool (excluding runs_this_over),
  // with dedup (no repeat within 6 overs) AND no semantic group conflicts
  const remainingPool = perOverPool.filter((q) => q.key !== "runs_this_over");
  const available = remainingPool.filter(
    (q) => !recent.includes(q.key) && !usedGroups.has(q.semanticGroup)
  );
  const pool = available.length >= 2 ? available.filter((q) => !usedGroups.has(q.semanticGroup)) : remainingPool.filter((q) => !usedGroups.has(q.semanticGroup));
  const shuffled = [...(pool.length >= 2 ? pool : remainingPool.filter((q) => !usedGroups.has(q.semanticGroup)))].sort(() => Math.random() - 0.5);

  const randomPicks: typeof perOverPool = [];
  for (const candidate of shuffled) {
    if (randomPicks.length >= 2) break;
    if (!usedGroups.has(candidate.semanticGroup)) {
      randomPicks.push(candidate);
      usedGroups.add(candidate.semanticGroup);
    }
  }

  const selected = [runsQuestion, ...randomPicks];

  // Only track the 2 random picks in dedup (runs_this_over is always used)
  const newRecent = [...recent, ...randomPicks.map((s) => s.key)].slice(-6);
  recentQuestions.set(recentKey, newRecent);

  return selected.map((template) => ({
    matchId,
    category: "per_over" as const,
    round,
    overNumber,
    question: template.question(overNumber),
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
      question: "Total first innings score — what's your gut say?",
      options: [
        { key: "low", label: "Under 150 — batting collapse", points: 25 },
        { key: "par", label: "150-175 — competitive total", points: 25 },
        { key: "high", label: "175-200 — strong batting", points: 25 },
        { key: "massive", label: "200+ — absolute carnage", points: 25 },
      ],
    }),
    // Round 3: 1st Innings Death (Overs 16-20)
    3: () => ({
      question: "Total boundaries in the second innings — how many?",
      options: [
        { key: "under_10", label: "Under 10 — bowlers dominate", points: 25 },
        { key: "10_20", label: "10-20 — balanced chase", points: 20 },
        { key: "20_30", label: "20-30 — batters on top", points: 20 },
        { key: "30_plus", label: "30+ — boundary fest", points: 30 },
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
  team2Players: string[],
  totalOvers: number = 20
): Array<{
  matchId: string;
  category: string;
  round: number;
  question: string;
  options: { key: string; label: string; points: number }[];
}> {
  const ppEnd = Math.min(6, totalOvers);
  const midEnd = Math.ceil(totalOvers * 0.75);
  const predictions = [
    // Q1: Chase done in which phase?
    {
      matchId,
      category: "rivalry_call",
      round: 4, // assigned to chase powerplay round for points tracking
      question: `${team2Short} need ${target} — chase done in which phase?`,
      options: [
        { key: "powerplay", label: `Powerplay (overs 1-${ppEnd})`, points: 35 },
        { key: "middle", label: `Middle overs (${ppEnd + 1}-${midEnd})`, points: 25 },
        { key: "death", label: `Death overs (${midEnd + 1}-${totalOvers})`, points: 20 },
        { key: "not_chased", label: "Not chased — bowlers win", points: 25 },
      ],
    },
  ];

  // Q2: How many runs in the chase powerplay?
  predictions.push({
    matchId,
    category: "rivalry_call",
    round: 4,
    question: "How many runs in the chase powerplay (overs 1-6)?",
    options: [
      { key: "under_30", label: "Under 30 — tight start", points: 25 },
      { key: "30_45", label: "30-45 — steady", points: 20 },
      { key: "45_60", label: "45-60 — aggressive", points: 25 },
      { key: "60_plus", label: "60+ — flying start", points: 35 },
    ],
  });

  return predictions;
}

// Determine which round based on current over, innings, and total overs
// Boundaries scale with totalOvers: powerplay = min(6, totalOvers), middle = ~75% mark
export function getCurrentRound(currentInnings: number, currentOver: number, totalOvers: number = 20): number {
  if (currentInnings === 0) return 0; // pre-match
  const overs = totalOvers || 20;                     // fallback for null/undefined from old DB records
  let ppEnd = Math.min(6, overs);                     // powerplay: 6 overs or totalOvers if shorter
  let midEnd = Math.ceil(overs * 0.75);               // middle: 75% mark (15 for 20ov, 8 for 10ov)
  // Ensure all 3 rounds get at least 1 over each for very short matches
  if (overs <= 3) { ppEnd = 1; midEnd = 2; }
  else if (ppEnd >= midEnd) { midEnd = ppEnd + 1; }
  if (currentInnings === 1) {
    if (currentOver <= ppEnd) return 1;  // 1st Innings Powerplay
    if (currentOver <= midEnd) return 2; // 1st Innings Middle
    return 3;                             // 1st Innings Death
  }
  // Second innings — mirrors first innings rounds
  if (currentOver <= ppEnd) return 4;    // Chase Powerplay
  if (currentOver <= midEnd) return 5;   // Chase Middle
  return 6;                               // Chase Death
}
