const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
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

  // Venues
  getVenue: (venueId: string) =>
    request<{ id: string; name: string; rewardConfig: any; latitude: number; longitude: number; radiusMeters: number }>(
      `/venues/${venueId}`
    ),

  // Matches
  getMatches: () => request<any[]>("/matches"),
  getMatch: (matchId: string) => request<any>(`/matches/${matchId}`),

  joinMatch: (matchId: string, venueId: string, latitude?: number, longitude?: number) =>
    request<{ participant: any }>(`/matches/${matchId}/join`, {
      method: "POST",
      body: JSON.stringify({ venueId, latitude, longitude }),
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

  // Avatar
  updateAvatar: (avatarConfig: import("@/types/avatar").AvatarConfig) =>
    request<{ id: string; phone: string; displayName: string; avatarConfig: import("@/types/avatar").AvatarConfig }>(
      "/auth/avatar",
      { method: "PATCH", body: JSON.stringify({ avatarConfig }) }
    ),

  // Rewards
  getMyRewards: (matchId?: string) =>
    request<any[]>(`/rewards/my${matchId ? `?matchId=${matchId}` : ""}`),
};
