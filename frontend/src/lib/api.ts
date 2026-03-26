const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

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
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || "Request failed");
    }

    return res.json();
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Check your connection.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  // Auth
  sendOTP: (phone: string) => request("/auth/send-otp", { method: "POST", body: JSON.stringify({ phone }) }),

  verifyOTP: (phone: string, code: string, displayName?: string) =>
    request<{ token: string; user: { id: string; phone: string; displayName: string }; isNewUser: boolean; needsDisplayName?: boolean }>(
      "/auth/verify-otp",
      { method: "POST", body: JSON.stringify({ phone, code, displayName }) }
    ),

  getMe: () => request<{ id: string; phone: string; displayName: string }>("/auth/me"),

  updateAvatar: (avatarConfig: any) =>
    request<{ success: boolean }>("/auth/avatar", { method: "PUT", body: JSON.stringify({ avatarConfig }) }),

  // Venues
  getVenue: (venueId: string) =>
    request<{ id: string; name: string; rewardConfig: any; latitude: number; longitude: number; radiusMeters: number }>(
      `/venues/${venueId}`
    ),

  // Matches
  getMatches: () => request<any[]>("/matches"),
  getMatch: (matchId: string) => request<any>(`/matches/${matchId}`),
  importMatch: (fixtureId: string) => request<{ match: any }>(`/matches/import/${fixtureId}`, { method: "POST" }),

  joinMatch: (matchId: string, venueId: string, matchCode?: string, latitude?: number, longitude?: number) =>
    request<{ participant: any }>(`/matches/${matchId}/join`, {
      method: "POST",
      body: JSON.stringify({ venueId, matchCode, latitude, longitude }),
    }),

  getMatchState: (matchId: string, venueId: string) =>
    request<{ match: any; participant: any; openPredictions: any[]; playerCount: number }>(
      `/matches/${matchId}/state?venueId=${venueId}`
    ),

  // Predictions
  getPredictions: (matchId: string, venueId: string, round?: number) =>
    request<any[]>(`/predictions/${matchId}?venueId=${venueId}${round !== undefined ? `&round=${round}` : ""}`),

  submitPrediction: (predictionId: string, selectedOption: string, venueId: string, boostType?: string) =>
    request<{ userPrediction: any }>(`/predictions/${predictionId}/answer`, {
      method: "POST",
      body: JSON.stringify({ selectedOption, venueId, boostType: boostType || "none" }),
    }),

  getMyPredictions: (matchId: string, venueId: string) =>
    request<any[]>(`/predictions/${matchId}/my-predictions?venueId=${venueId}`),

  // Leaderboard
  getRoundLeaderboard: (matchId: string, venueId: string, round: number) =>
    request<{ round: number; leaderboard: any[] }>(`/leaderboard/${matchId}/${venueId}/round/${round}`),

  getMatchLeaderboard: (matchId: string, venueId: string) =>
    request<{ leaderboard: any[] }>(`/leaderboard/${matchId}/${venueId}/match`),

  getPlayerCount: (matchId: string, venueId: string) =>
    request<{ count: number }>(`/leaderboard/${matchId}/${venueId}/count`),

  // Rewards
  getMyRewards: (matchId?: string) =>
    request<any[]>(`/rewards/my${matchId ? `?matchId=${matchId}` : ""}`),

  // Venue (public)
  getVenueBySlug: (slug: string) =>
    request<{ id: string; name: string; slug: string; logoUrl?: string; rewardConfig: any }>(
      `/venues/by-slug/${slug}`
    ),

  // Admin — Match Codes
  generateMatchCode: (matchId: string) =>
    request<{ code: string; matchCode: any }>("/admin/match-code", {
      method: "POST",
      body: JSON.stringify({ matchId }),
    }),

  getMatchCode: (matchId: string) =>
    request<{ matchCode: any }>(`/admin/match-code/${matchId}`),

  validateMatchCode: (venueId: string, matchId: string, code: string) =>
    request<{ valid: boolean }>("/admin/validate-code", {
      method: "POST",
      body: JSON.stringify({ venueId, matchId, code }),
    }),

  getVenuePlayers: (matchId: string) =>
    request<{ players: any[]; count: number }>(`/admin/venue/players/${matchId}`),
};
