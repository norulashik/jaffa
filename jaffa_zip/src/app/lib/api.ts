// API client for Jaffa backend
// Replace with your actual backend URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const USE_MOCK_MODE = import.meta.env.VITE_USE_MOCK === 'true'; // Enable mock mode

interface ApiError {
  error: string;
  status: number;
}

// Mock data store for development
const mockStore = {
  otpSent: false,
  lastPhone: '',
  validOtp: '123456',
  mockUser: {
    userId: 'mock-user-1',
    phone: '+919876543210',
    displayName: 'Cricket Fan',
    role: 'user',
    totalPoints: 2500,
    rank: 12,
  },
  mockToken: 'mock-jwt-token-' + Date.now(),
};

class JaffaApiClient {
  private baseUrl: string;
  private useMockMode: boolean;

  constructor(baseUrl: string, mockMode: boolean = USE_MOCK_MODE) {
    this.baseUrl = baseUrl;
    this.useMockMode = mockMode;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // If mock mode is enabled, return mock data
    if (this.useMockMode) {
      return this.mockRequest<T>(endpoint, options);
    }

    const token = localStorage.getItem('token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        throw new Error('Session expired');
      }

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          error: 'Something went wrong',
          status: response.status,
        }));
        throw new Error(error.error);
      }

      return response.json();
    } catch (error) {
      // If fetch fails (backend not available), switch to mock mode
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        // Only show the mock mode message once per session
        if (!sessionStorage.getItem('mockModeNotified')) {
          console.info('🔧 Demo Mode: Backend not connected, using mock data');
          sessionStorage.setItem('mockModeNotified', 'true');
        }
        this.useMockMode = true;
        return this.mockRequest<T>(endpoint, options);
      }
      throw error;
    }
  }

  // Mock request handler for development
  private async mockRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Reduced logging - only show in development
    if (import.meta.env.DEV) {
      console.debug('📱 Mock API:', endpoint);
    }

    // Auth endpoints
    if (endpoint === '/api/auth/send-otp') {
      const body = JSON.parse(options.body as string);
      mockStore.lastPhone = body.phone;
      mockStore.otpSent = true;
      return { success: true, message: 'OTP sent' } as T;
    }

    if (endpoint === '/api/auth/verify-otp') {
      const body = JSON.parse(options.body as string);
      if (body.code === mockStore.validOtp || body.code === '111111') {
        mockStore.mockUser.phone = mockStore.lastPhone;
        if (body.displayName) {
          mockStore.mockUser.displayName = body.displayName;
        }
        return {
          token: mockStore.mockToken,
          user: mockStore.mockUser,
          needsDisplayName: !body.displayName && !mockStore.mockUser.displayName,
        } as T;
      }
      throw new Error('Invalid OTP');
    }

    if (endpoint === '/api/auth/me') {
      return mockStore.mockUser as T;
    }

    // Match endpoints
    if (endpoint === '/api/matches') {
      return [
        {
          id: 'match-1',
          matchId: 'match-1',
          team1: 'Mumbai Indians',
          team2: 'Chennai Super Kings',
          team1Short: 'MI',
          team2Short: 'CSK',
          teamA: 'Mumbai Indians',
          teamB: 'Chennai Super Kings',
          venue: 'Wankhede Stadium',
          startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          status: 'upcoming',
          currentOver: 0,
        },
        {
          id: 'match-2',
          matchId: 'match-2',
          team1: 'Royal Challengers Bangalore',
          team2: 'Kolkata Knight Riders',
          team1Short: 'RCB',
          team2Short: 'KKR',
          teamA: 'Royal Challengers Bangalore',
          teamB: 'Kolkata Knight Riders',
          venue: 'M. Chinnaswamy Stadium',
          startTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
          scheduledTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
          status: 'upcoming',
          currentOver: 0,
        },
      ] as T;
    }

    if (endpoint.startsWith('/api/matches/') && endpoint.includes('/state')) {
      return {
        matchId: 'match-1',
        currentRound: 1,
        currentOver: 1,
        currentBall: 1,
        teamBatting: 'Mumbai Indians',
        score: '15/0',
        status: 'live',
      } as T;
    }

    if (endpoint.startsWith('/api/matches/') && endpoint.includes('/join')) {
      return { success: true, message: 'Joined match' } as T;
    }

    if (endpoint.startsWith('/api/matches/')) {
      return {
        matchId: 'match-1',
        teamA: 'Mumbai Indians',
        teamB: 'Chennai Super Kings',
        venue: 'Wankhede Stadium',
        scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        status: 'live',
        currentRound: 1,
      } as T;
    }

    // Prediction endpoints
    if (endpoint.startsWith('/api/predictions/') && endpoint.includes('/my-predictions')) {
      return [] as T;
    }

    if (endpoint.startsWith('/api/predictions/') && endpoint.includes('/answer')) {
      return {
        success: true,
        points: 100,
        correctAnswer: 'A',
      } as T;
    }

    if (endpoint.startsWith('/api/predictions/')) {
      return [
        {
          predictionId: 'pred-1',
          question: 'Will this over go for 10+ runs?',
          options: [
            { id: 'A', text: 'Yes', odds: 2.5 },
            { id: 'B', text: 'No', odds: 1.5 },
          ],
          round: 1,
          over: 1,
          status: 'active',
          timeLeft: 25,
        },
      ] as T;
    }

    // Leaderboard endpoints
    if (endpoint.includes('/leaderboard/') && endpoint.includes('/count')) {
      return { count: 42 } as T;
    }

    if (endpoint.includes('/leaderboard/') && endpoint.includes('/round')) {
      return [
        { rank: 1, displayName: 'Cricket King', points: 250, isMe: false },
        { rank: 2, displayName: 'Sixer Pro', points: 220, isMe: false },
        { rank: 3, displayName: mockStore.mockUser.displayName, points: 200, isMe: true },
      ] as T;
    }

    if (endpoint.includes('/leaderboard/') && endpoint.includes('/match')) {
      return [
        { rank: 1, displayName: 'Cricket King', totalPoints: 1500, roundsWon: 8, isMe: false },
        { rank: 2, displayName: 'Sixer Pro', totalPoints: 1420, roundsWon: 7, isMe: false },
        { rank: 3, displayName: mockStore.mockUser.displayName, totalPoints: 1350, roundsWon: 6, isMe: true },
      ] as T;
    }

    // Rewards endpoints
    if (endpoint === '/api/rewards/my') {
      return [
        {
          id: 'reward-1',
          rewardId: 'reward-1',
          round: 3,
          position: 1,
          rewardText: 'Free Coffee - Winner Round 3',
          code: 'JAFFA-COFFEE-' + Math.random().toString(36).substring(7).toUpperCase(),
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          title: 'Free Coffee',
          description: 'Get a free coffee on your next visit',
          pointsCost: 500,
          category: 'beverage',
          available: true,
        },
        {
          id: 'reward-2',
          rewardId: 'reward-2',
          round: 2,
          position: 2,
          rewardText: '10% Discount - Runner Up Round 2',
          code: 'JAFFA-DISC10-' + Math.random().toString(36).substring(7).toUpperCase(),
          status: 'redeemed',
          expiresAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          title: '10% Discount',
          description: 'Get 10% off on any item',
          pointsCost: 300,
          category: 'discount',
          available: true,
        },
        {
          id: 'reward-3',
          rewardId: 'reward-3',
          round: 1,
          position: 3,
          rewardText: 'Free Nachos - Third Place Round 1',
          code: 'JAFFA-NACHOS-' + Math.random().toString(36).substring(7).toUpperCase(),
          status: 'expired',
          expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
          title: 'Free Nachos',
          description: 'Get free nachos',
          pointsCost: 400,
          category: 'food',
          available: false,
        },
      ] as T;
    }

    if (endpoint === '/api/rewards/venue') {
      return [
        {
          rewardId: 'reward-1',
          title: 'Free Coffee',
          pointsCost: 500,
          category: 'beverage',
          totalRedeemed: 45,
        },
      ] as T;
    }

    if (endpoint === '/api/rewards/redeem') {
      return {
        success: true,
        code: 'JAFFA-' + Math.random().toString(36).substring(7).toUpperCase(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      } as T;
    }

    // Venue endpoints
    if (endpoint.startsWith('/api/venues/by-slug/')) {
      const slug = endpoint.split('/').pop();
      return {
        venueId: 'venue-1',
        venueName: 'Sports Café',
        slug: slug,
        address: '123 Cricket Street',
        city: 'Mumbai',
      } as T;
    }

    if (endpoint.startsWith('/api/venues/')) {
      return {
        venueId: 'venue-1',
        venueName: 'Sports Café',
        address: '123 Cricket Street',
        city: 'Mumbai',
      } as T;
    }

    // Admin endpoints
    if (endpoint === '/api/admin/validate-code' || endpoint === '/api/admin/match-code/validate') {
      // Validate any match code in mock mode
      return {
        valid: true,
        matchId: 'match-1',
        venueId: 'venue-1',
        venueName: 'Sports Café',
      } as T;
    }

    if (endpoint === '/api/admin/match-code' && options.method === 'POST') {
      return {
        code: 'JAFFA' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        matchId: 'match-1',
        venueId: 'venue-1',
      } as T;
    }

    if (endpoint.startsWith('/api/admin/match-code/')) {
      return {
        code: 'JAFFAABC123',
        matchId: 'match-1',
        venueId: 'venue-1',
      } as T;
    }

    if (endpoint === '/api/admin/venue/stats') {
      return {
        totalPlayers: 156,
        activeMatches: 3,
        totalPointsAwarded: 45000,
        rewardsRedeemed: 28,
      } as T;
    }

    if (endpoint.includes('/api/admin/venue/players/')) {
      return [
        { displayName: 'Player 1', points: 450, status: 'active' },
        { displayName: 'Player 2', points: 380, status: 'active' },
      ] as T;
    }

    // Default empty response
    console.warn('⚠️ No mock data for:', endpoint);
    return {} as T;
  }

  // Auth endpoints
  async sendOtp(phone: string) {
    return this.request('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async verifyOtp(phone: string, code: string, displayName?: string) {
    return this.request<{ token: string; user: any; needsDisplayName?: boolean }>(
      '/api/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({ phone, code, displayName }),
      }
    );
  }

  async getMe(token?: string) {
    return this.request('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  // Match endpoints
  async getMatches() {
    return this.request<any[]>('/api/matches');
  }

  async getMatch(matchId: string, venueId?: string) {
    const query = venueId ? `?venueId=${venueId}` : '';
    return this.request(`/api/matches/${matchId}${query}`);
  }

  async joinMatch(matchId: string, venueId: string, matchCode: string) {
    return this.request(`/api/matches/${matchId}/join`, {
      method: 'POST',
      body: JSON.stringify({ venueId, matchCode }),
    });
  }

  async getMatchState(matchId: string, venueId?: string) {
    const query = venueId ? `?venueId=${venueId}` : '';
    return this.request(`/api/matches/${matchId}/state${query}`);
  }

  // Prediction endpoints
  async getPredictions(matchId: string, venueId?: string, round?: number, status?: string) {
    const params = new URLSearchParams();
    if (venueId) params.append('venueId', venueId);
    if (round !== undefined) params.append('round', round.toString());
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params}` : '';
    return this.request<any[]>(`/api/predictions/${matchId}${query}`);
  }

  async submitAnswer(predictionId: string, selectedOption: string, boostType?: string, venueId?: string) {
    return this.request(`/api/predictions/${predictionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ selectedOption, boostType, venueId }),
    });
  }

  async getMyPredictions(matchId: string, venueId?: string) {
    const query = venueId ? `?venueId=${venueId}` : '';
    return this.request<any[]>(`/api/predictions/${matchId}/my-predictions${query}`);
  }

  // Leaderboard endpoints
  async getLeaderboardRound(matchId: string, venueId: string, round: number) {
    return this.request<any[]>(`/api/leaderboard/${matchId}/${venueId}/round/${round}`);
  }

  async getLeaderboardMatch(matchId: string, venueId: string) {
    return this.request<any[]>(`/api/leaderboard/${matchId}/${venueId}/match`);
  }

  async getPlayerCount(matchId: string, venueId: string) {
    return this.request<{ count: number }>(`/api/leaderboard/${matchId}/${venueId}/count`);
  }

  // Rewards endpoints
  async getMyRewards() {
    return this.request<any[]>('/api/rewards/my');
  }

  async redeemReward(code: string) {
    return this.request('/api/rewards/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async getVenueRewards() {
    return this.request<any[]>('/api/rewards/venue');
  }

  // Venue endpoints
  async registerVenue(data: any) {
    return this.request('/api/venues/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async loginVenue(email: string, password: string) {
    return this.request<{ token: string; venue: any }>('/api/venues/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async updateVenueRewards(rewards: any) {
    return this.request('/api/venues/rewards', {
      method: 'PUT',
      body: JSON.stringify(rewards),
    });
  }

  async getVenueBySlug(slug: string) {
    return this.request(`/api/venues/by-slug/${slug}`);
  }

  async getVenue(venueId: string) {
    return this.request(`/api/venues/${venueId}`);
  }

  // Admin endpoints
  async validateMatchCode(code: string) {
    return this.request('/api/admin/validate-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async generateMatchCode(matchId: string, venueId: string) {
    return this.request('/api/admin/match-code', {
      method: 'POST',
      body: JSON.stringify({ matchId, venueId }),
    });
  }

  async getMatchCode(matchId: string) {
    return this.request(`/api/admin/match-code/${matchId}`);
  }

  async getVenueStats() {
    return this.request('/api/admin/venue/stats');
  }

  async getVenuePlayers(matchId: string) {
    return this.request(`/api/admin/venue/players/${matchId}`);
  }
}

export const api = new JaffaApiClient(API_BASE_URL);