// API client for the owner (admin) portal. Mirrors lib/api.ts but reads its
// token from `localStorage.jaffa_owner_token` instead of `jaffa_token`, so
// the user JWT and owner JWT can never bleed into each other's requests
// when both are present in the same browser.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function ownerRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_owner_token") : null;

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

    if (res.status === 401 && typeof window !== "undefined") {
      // Stale or rejected token — boot back to the login page so the admin
      // re-authenticates instead of staring at silent failures.
      localStorage.removeItem("jaffa_owner_token");
      if (!window.location.pathname.endsWith("/owner/login")) {
        window.location.href = "/owner/login";
      }
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || "Request failed");
    }

    return res.json();
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export type SimSnapshot = {
  status: "idle" | "running" | "cooldown";
  matchId: string | null;
  currentBallIndex: number;
  totalBalls: number;
  currentOver: number;
  currentInnings: number;
  innings1Score: { runs: number; wickets: number; overs: number };
  innings2Score: { runs: number; wickets: number; overs: number };
  cooldownEndsAt: number | null;
};

export type KongOptionInput = { label: string; points: number };

export type KongPrediction = {
  id: string;
  matchId: string;
  question: string;
  status: "open" | "locked" | "resolved" | "voided";
  correctOption?: string | null;
  options: { key: string; label: string; points: number }[];
  responses: Record<string, number>;
  totalResponses: number;
  createdAt: string;
};

export const ownerApi = {
  login: (username: string, password: string) =>
    ownerRequest<{ token: string }>("/owner/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getMatches: (limit = 50) =>
    ownerRequest<{ matches: any[]; total: number }>(`/owner/matches?limit=${limit}`),

  // Sim controls
  simStart: () => ownerRequest<SimSnapshot>("/owner/sim/start", { method: "POST" }),
  simStop: () => ownerRequest<SimSnapshot>("/owner/sim/stop", { method: "POST" }),
  simReset: () => ownerRequest<SimSnapshot>("/owner/sim/reset", { method: "POST" }),
  simState: () => ownerRequest<SimSnapshot>("/owner/sim/state"),

  // Kong question CRUD
  kongCreate: (matchId: string, question: string, options: KongOptionInput[]) =>
    ownerRequest<{ prediction: KongPrediction }>(`/owner/kong/${matchId}`, {
      method: "POST",
      body: JSON.stringify({ question, options }),
    }),

  kongList: (matchId: string) =>
    ownerRequest<{ predictions: KongPrediction[] }>(`/owner/kong/${matchId}`),

  kongResolve: (predictionId: string, correctOption: string) =>
    ownerRequest<{ resolved: boolean }>(`/owner/kong/${predictionId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ correctOption }),
    }),
};
