// 5v5 API client. Reuses the same auth-token contract as lib/api.ts (the
// regular user JWT in localStorage.jaffa_token) — 5v5 is a regular-user
// feature, not an admin one.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function fivevsfiveRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      // Surface the structured error body so callers can read .error or
      // .roomId (e.g. 409 "already in another room" returns the existing
      // roomId so the client can route there).
      const data = await res.json().catch(() => ({ error: "Request failed" }));
      const err: any = new Error(data.error || "Request failed");
      err.body = data;
      err.status = res.status;
      throw err;
    }
    return res.json();
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export type TeamSide = "team1" | "team2";
export type FiveVsFiveStatus = "waiting" | "active" | "completed" | "voided";

export interface FiveVsFiveSlotDto {
  id: string;
  teamSide: TeamSide;
  role: number;
  userId: string;
  claimedAt: string;
  user: { id: string; displayName: string; avatarConfig?: any } | null;
}

export interface FiveVsFiveRoomDto {
  id: string;
  code: string;
  matchId: string;
  hostUserId: string;
  status: FiveVsFiveStatus;
  startedAt: string | null;
  settledAt: string | null;
  match: {
    id: string;
    team1: string;
    team2: string;
    team1Short: string | null;
    team2Short: string | null;
    startTime: string | null;
    status: string;
  } | null;
  slots: FiveVsFiveSlotDto[];
  slotsFilled: number;
  slotsTotal: number;
  resultSummary: any;
}

export interface FiveVsFiveQuestionDto {
  id: string;
  question: string;
  options: { key: string; label: string; points: number }[];
  templateKey: string;
  status: "open" | "locked" | "resolved" | "voided";
  correctOption: string | null;
  userAnswer: { selectedOption: string; isCorrect: boolean | null; pointsEarned: number } | null;
}

export interface FiveVsFiveQuestionsDto {
  slot: { teamSide: TeamSide; role: number; roleKey: string; roleTitle: string };
  questions: FiveVsFiveQuestionDto[];
}

export interface FiveVsFiveResultDto {
  id: string;
  status: FiveVsFiveStatus;
  settledAt: string | null;
  match: { team1: string; team2: string; team1Short: string | null; team2Short: string | null } | null;
  slots: { teamSide: TeamSide; role: number; userId: string; user: { id: string; displayName: string; avatarConfig?: any } | null }[];
  summary: {
    winnerTeam: TeamSide | "tie";
    teamTotals: { team1: number; team2: number };
    roleWinners: Record<number, TeamSide | "tie">;
    motmUserIds: string[];
    perUser: { userId: string; teamSide: TeamSide; role: number; points: number; correctCount: number; bananas: number }[];
  } | null;
}

export const fiveVsFiveApi = {
  active: () =>
    fivevsfiveRequest<{ rooms: FiveVsFiveRoomDto[] }>("/5v5/active"),

  createRoom: (matchId: string) =>
    fivevsfiveRequest<FiveVsFiveRoomDto>("/5v5/rooms", {
      method: "POST",
      body: JSON.stringify({ matchId }),
    }),

  joinByCode: (code: string) =>
    fivevsfiveRequest<FiveVsFiveRoomDto>("/5v5/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    }),

  getRoom: (roomId: string) =>
    fivevsfiveRequest<FiveVsFiveRoomDto>(`/5v5/rooms/${roomId}`),

  claimSlot: (roomId: string, teamSide: TeamSide, role: number) =>
    fivevsfiveRequest<FiveVsFiveRoomDto>(`/5v5/rooms/${roomId}/claim`, {
      method: "POST",
      body: JSON.stringify({ teamSide, role }),
    }),

  leaveRoom: (roomId: string) =>
    fivevsfiveRequest<FiveVsFiveRoomDto>(`/5v5/rooms/${roomId}/leave`, { method: "POST" }),

  startRoom: (roomId: string) =>
    fivevsfiveRequest<FiveVsFiveRoomDto>(`/5v5/rooms/${roomId}/start`, { method: "POST" }),

  getQuestions: (roomId: string) =>
    fivevsfiveRequest<FiveVsFiveQuestionsDto>(`/5v5/rooms/${roomId}/questions`),

  submitAnswer: (roomId: string, predictionId: string, selectedOption: string) =>
    fivevsfiveRequest<{ ok: true }>(`/5v5/rooms/${roomId}/answer`, {
      method: "POST",
      body: JSON.stringify({ predictionId, selectedOption }),
    }),

  getResults: (roomId: string) =>
    fivevsfiveRequest<FiveVsFiveResultDto>(`/5v5/rooms/${roomId}/results`),
};

// Stable role display data — mirrors backend ROLE_DEFS.
export const ROLE_VIEW = {
  1: { title: "Maestro",     subtitle: "Captain + WK",     color: "#ffd60a", emoji: "🎩" },
  2: { title: "Igniter",     subtitle: "Opening Batter",   color: "#ff6341", emoji: "💥" },
  3: { title: "Architect",   subtitle: "Middle Order",     color: "#3b9eff", emoji: "🏗️" },
  4: { title: "Stormcaller", subtitle: "Finisher",         color: "#a855f7", emoji: "⚡" },
  5: { title: "Hammer",      subtitle: "Strike Bowler",    color: "#22c55e", emoji: "🔨" },
} as const;
export type RoleNumber = 1 | 2 | 3 | 4 | 5;
