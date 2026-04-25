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
  loginWithPhone: (phone: string, displayName: string) =>
    request<{ token: string; user: { id: string; phone: string; displayName: string; avatarConfig?: any }; isNewUser: boolean }>(
      "/auth/phone-login",
      { method: "POST", body: JSON.stringify({ phone, displayName }) }
    ),

  getMe: () => request<{ id: string; phone: string; displayName: string }>("/auth/me"),

  updateAvatar: (avatarConfig: any) =>
    request<{ success: boolean }>("/auth/avatar", { method: "PUT", body: JSON.stringify({ avatarConfig }) }),

  updateLocation: (latitude: number, longitude: number) =>
    request<{ city: string | null; state: string | null }>("/auth/location", {
      method: "PUT",
      body: JSON.stringify({ latitude, longitude }),
    }),

  getUserStats: () =>
    request<{ matchesPlayed: number; totalCorrect: number; totalPredictions: number; accuracy: number; lifetimePoints: number; city: string | null; state: string | null }>("/auth/stats"),

  // Venues
  getVenue: (venueId: string) =>
    request<{ id: string; name: string; rewardConfig: any; latitude: number; longitude: number; radiusMeters: number }>(
      `/venues/${venueId}`
    ),

  // Matches
  getMatches: () => request<any[]>("/matches"),
  getMatch: (matchId: string) => request<any>(`/matches/${matchId}`),
  getMatchBalls: (matchId: string) => request<{ overs: any[]; currentInnings: number; currentOver: number }>(`/matches/${matchId}/balls`),
  getMatchScorecard: (matchId: string) => request<any>(`/matches/${matchId}/scorecard`),
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

  getMyStory: (matchId: string, venueId: string) =>
    request<{
      summary: { right: number; wrong: number; totalPredictions: number; accuracy: number; totalPoints: number; rank?: number };
      toneLine: string;
      beats: Array<{ type: string; title: string; detail: string; data?: any }>;
    }>(`/matches/${matchId}/my-story?venueId=${venueId}`),

  // Past matches the logged-in user participated in (completed only). Paginated.
  getMyPastMatches: (page: number = 1, pageSize: number = 10) =>
    request<{
      matches: Array<{
        matchId: string;
        venueId: string;
        venueName: string | null;
        venueSlug: string | null;
        team1Short: string | null;
        team2Short: string | null;
        team1: string | null;
        team2: string | null;
        startTime: string | null;
        status: string;
        scoreData: any;
        myStats: { totalPoints: number; correctPredictions: number; totalPredictions: number; bestStreak: number };
      }>;
      page: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
    }>(`/matches/my-past?page=${page}&pageSize=${pageSize}`),

  // Leaderboard
  getRoundLeaderboard: (matchId: string, venueId: string, round: number) =>
    request<{ round: number; leaderboard: any[] }>(`/leaderboard/${matchId}/${venueId}/round/${round}`),

  getExtrasLeaderboard: (matchId: string, venueId: string) =>
    request<{
      leaderboard: Array<{
        rank: number;
        userId: string;
        displayName: string;
        avatarConfig: any;
        points: number;
        breakdown: { punterCard: number; preMatch: number };
      }>;
    }>(`/leaderboard/${matchId}/${venueId}/extras`),

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

  // Rooms
  createRoom: (matchId: string, name: string, isPublic?: boolean, maxPlayers?: number) =>
    request<{ room: any; shareLink: string; venueId: string }>("/rooms", {
      method: "POST",
      body: JSON.stringify({ matchId, name, isPublic, maxPlayers }),
    }),

  getMyRooms: () => request<{ rooms: any[] }>("/rooms/my"),

  getPublicRooms: () => request<{ rooms: any[] }>("/rooms/public"),

  getRoom: (roomId: string) => request<{ room: any; venueId: string }>(`/rooms/${roomId}`),

  joinRoomByCode: (code: string) =>
    request<{ room: any; venueId: string }>("/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  joinRandomRoom: (matchId: string) =>
    request<{ room: any; venueId: string }>("/rooms/join-random", {
      method: "POST",
      body: JSON.stringify({ matchId }),
    }),

  leaveRoom: (roomId: string) =>
    request<{ success: boolean }>(`/rooms/${roomId}/leave`, { method: "POST" }),

  getRoomLeaderboard: (roomId: string) =>
    request<{ leaderboard: any[] }>(`/rooms/${roomId}/leaderboard`),

  getRoomRoundLeaderboard: (roomId: string, round: number) =>
    request<{ round: number; leaderboard: any[] }>(`/rooms/${roomId}/leaderboard/round/${round}`),

  // Weekly Rewards
  getWeeklyPoints: () =>
    request<{ weeklyPoints: number; weekNumber: number }>("/weekly-rewards/points"),

  getWeeklyRewardsCatalog: () =>
    request<{ weeklyPoints: number; catalog: any[]; redemptions: any[] }>("/weekly-rewards/catalog"),

  redeemWeeklyReward: (rewardKey: string) =>
    request<{ success: boolean; weeklyPoints: number }>("/weekly-rewards/redeem", {
      method: "POST",
      body: JSON.stringify({ rewardKey }),
    }),

  // Punter Card
  getPunterCard: (matchId: string, venueId?: string) =>
    request<{
      matchId: string;
      match: {
        team1: string | null;
        team2: string | null;
        team1Short: string | null;
        team2Short: string | null;
        startTime: string | null;
        status: string;
      };
      questions: Array<{
        id: string;
        templateKey: string;
        question: string;
        options: { key: string; label: string; points: number }[];
        opensAt?: string | null;
        expiresAt?: string | null;
        status: string;
        correctOption?: string | null;
        userAnswer: {
          selectedOption: string;
          pointsEarned: number;
          isCorrect: boolean | null;
        } | null;
      }>;
      allAnswered: boolean;
    }>(`/punter-card/${matchId}${venueId ? `?venueId=${venueId}` : ""}`),

  submitPunterCard: (
    matchId: string,
    venueId: string,
    answers: { predictionId: string; selectedOption: string }[]
  ) =>
    request<{ saved: number }>(`/punter-card/${matchId}/answer`, {
      method: "POST",
      body: JSON.stringify({ venueId, answers }),
    }),

  getMyPunterCards: () =>
    request<{
      cards: Array<{
        matchId: string;
        team1: string | null;
        team2: string | null;
        team1Short: string | null;
        team2Short: string | null;
        startTime: string | null;
        status: string | null;
        answers: Array<{
          id: string;
          predictionId: string;
          selectedOption: string;
          pointsEarned: number;
          isCorrect: boolean | null;
        }>;
        correctCount: number;
        resolvedCount: number;
        totalCount: number;
        totalPoints: number;
      }>;
    }>("/punter-card/my/cards"),

  // Global Leaderboard
  getGlobalLeaderboard: (scope: "city" | "state" | "all") =>
    request<{
      leaderboard: {
        rank: number;
        userId: string;
        displayName: string;
        avatarConfig: any;
        lifetimePoints: number;
        city: string | null;
        state: string | null;
      }[];
      myRank: number;
      scope: string;
      myCity: string | null;
      myState: string | null;
    }>(`/global-leaderboard?scope=${scope}`),
};
