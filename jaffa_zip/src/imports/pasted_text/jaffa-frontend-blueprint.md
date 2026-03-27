JAFFA Frontend Blueprint
1. Backend Analysis Summary
API Endpoints Map
Group	Base Path	Auth	Endpoints
Auth	/api/auth	None / User	POST /send-otp, POST /verify-otp, GET /me
Matches	/api/matches	None / User	GET /, POST /import/:fixtureId, GET /:matchId, POST /:matchId/join, GET /:matchId/state
Predictions	/api/predictions	User	GET /:matchId, POST /:predictionId/answer, GET /:matchId/my-predictions
Leaderboard	/api/leaderboard	None	GET /:matchId/:venueId/round/:round, GET /:matchId/:venueId/match, GET /:matchId/:venueId/count
Rewards	/api/rewards	User / Venue	GET /my, POST /redeem, GET /venue
Venues	/api/venues	None / Venue	POST /register, POST /login, PUT /rewards, GET /by-slug/:slug, GET /:venueId
Admin	/api/admin	None / Venue	Match lifecycle, prediction management, match codes, cricket data
Owner	/api/owner	Owner	Platform stats, venue CRUD, match management, fixture import
Three Auth Roles
User — JWT with type: "user", 30-day expiry (phone OTP)
Venue — JWT with type: "venue", 90-day expiry (password login)
Owner — JWT with type: "owner", 24-hour expiry (env-var credentials)
Database Schema (8 tables)
User → MatchParticipant ← Match ← Prediction → UserPrediction ← User
Venue → MatchCode, Reward → User

2. Current Frontend Architecture (What's Already Built)
Tech Stack
Next.js 16.2.0 (App Router) + React 19 + TypeScript
Tailwind CSS v4 with custom dark theme (glassmorphism, neon accents)
Framer Motion for animations
Socket.IO Client for real-time updates
No external state library — React Context + useReducer
Existing Folder Structure

frontend/src/
├── app/
│   ├── layout.tsx                          # Root layout
│   ├── page.tsx                            # Splash/Landing
│   ├── login/page.tsx                      # Standalone login
│   ├── lobby/page.tsx                      # Match listing
│   ├── match/[matchId]/page.tsx            # Main game page
│   ├── play/page.tsx                       # Play redirect
│   ├── profile/page.tsx                    # User profile
│   ├── rewards/page.tsx                    # User rewards
│   ├── leaderboard/page.tsx                # Standalone leaderboard
│   ├── tv/page.tsx                         # TV display mode
│   ├── admin/page.tsx                      # Venue admin dashboard
│   ├── owner/page.tsx                      # Platform owner portal
│   └── cafe/[slug]/                        # Venue-specific routes
│       ├── page.tsx                        # Venue landing
│       ├── login/page.tsx                  # Venue-scoped login
│       ├── lobby/page.tsx                  # Venue-scoped lobby
│       ├── match/[matchId]/page.tsx        # Venue-scoped game
│       ├── leaderboard/page.tsx            # Venue leaderboard
│       └── rewards/page.tsx                # Venue rewards
├── components/
│   ├── LiveGame.tsx                        # Core live prediction UI
│   ├── PreMatchCards.tsx                   # Pre-match card flow
│   ├── Leaderboard.tsx                     # Leaderboard component
│   ├── OTPFlow.tsx                         # Phone auth flow
│   ├── Header.tsx                          # Top nav bar
│   ├── BottomNav.tsx                       # Bottom navigation
│   ├── CorrectAnswerFeedback.tsx           # Success overlay
│   ├── RewardBanner.tsx                    # Reward notification
│   ├── ProfileDrawer.tsx                   # Profile sidebar
│   ├── LandingPage.tsx                     # Intro screen
│   ├── CricketAvatar.tsx                   # Avatar renderer
│   ├── AvatarCustomizer.tsx                # Avatar editor
│   ├── MaterialIcon.tsx                    # Icon wrapper
│   └── avatar/
│       ├── AvatarPreview.tsx
│       └── avatarAssets.ts
├── context/
│   └── GameContext.tsx                      # Global game state
├── lib/
│   ├── api.ts                              # REST API client
│   ├── socket.ts                           # Socket.IO client
│   └── navigation.ts                       # Route helpers
└── types/
    └── avatar.ts                           # Avatar type defs
3. Page-by-Page Breakdown
Page 1: / — Splash Screen
Field	Detail
Purpose	Brand intro, route users to lobby
APIs	None
Components	Animated JAFFA logo, "Enter Arena" CTA
State	Reads venueId/matchId from URL params → localStorage
Interactions	Tap "Enter Arena" → navigates to /lobby or /cafe/[slug]
Page 2: /lobby — Match Listing
Field	Detail
Purpose	Show live + upcoming matches, let user join via match code
APIs	GET /api/matches (auto-refresh 15s), POST /api/admin/validate-code
Components	Match cards (live/upcoming), MatchCode modal, Header, BottomNav
State	matches[], selectedMatch, matchCode, loading
Interactions	Tap match → code modal → validate → navigate to /match/[id]
Page 3: /match/[matchId] — Main Game
Field	Detail
Purpose	Core prediction gameplay (pre-match + live)
APIs	POST /join, GET /state, GET /predictions/:matchId, POST /answer, GET /leaderboard
Components	PreMatchCards, LiveGame, Leaderboard, CorrectAnswerFeedback, RewardBanner
State	GameContext (user, participant, match, predictions, round, streak, boosts)
Socket Events	newPrediction, predictionResolved, predictionPulse, leaderboardUpdate, hypeEvent, roundWinner, matchEnd, scoreUpdate, predictionsLocked
Interactions	Select prediction option → submit with optional boost/all-in → real-time feedback
Page 4: /admin — Venue Dashboard
Field	Detail
Purpose	Venue owner: manage matches, codes, rewards, redemption
APIs	POST /venues/login, POST /venues/register, POST /admin/match-code, GET /admin/match-code/:matchId, GET /admin/venue/stats, POST /rewards/redeem, GET /rewards/venue, PUT /venues/rewards, GET /admin/venue/players/:matchId
Components	Login/Register forms, Tab navigation (Overview/Codes/Redeem/Winners/Setup)
State	venueToken, venue, activeTab, matches, matchCodes, rewards, stats
Interactions	Generate match codes, configure rewards, verify redemption codes, view stats
Page 5: /owner — Platform Admin
Field	Detail
Purpose	Super admin: approve venues, manage matches, import fixtures
APIs	POST /owner/login, GET /owner/stats, GET /owner/venues, `PATCH /owner/venues/:id/approve
Components	Tab navigation (Dashboard/Venues/Matches/Tools), venue detail modals, fixture import
State	ownerToken, stats, venues[], matches[], fixtures[], selectedVenue
Interactions	Approve/reject venues, import Sportsmonk fixtures, resolve predictions manually
Page 6: /cafe/[slug]/* — Venue-Scoped Routes
Field	Detail
Purpose	QR code entry → venue-branded experience
APIs	GET /venues/by-slug/:slug to resolve venue, then same APIs as above
Flow	QR scan → /cafe/[slug] → OTP login → /cafe/[slug]/lobby → join match → /cafe/[slug]/match/[id]
Page 7: /tv — TV Display
Field	Detail
Purpose	Big-screen display for venue TVs
Socket Events	Joins tv:{venueId} room, listens for leaderboard updates, hype events, round winners
Components	Leaderboard (top 10), Prediction Pulse commentary, Hype alerts, Round winner reveals
Page 8: /rewards — User Rewards
Field	Detail
Purpose	View earned rewards and redemption codes
APIs	GET /rewards/my
Page 9: /profile — User Profile
Field	Detail
Purpose	View/edit display name, avatar
4. Backend → Frontend Integration Map
Auth Endpoints
Endpoint	Page	Trigger	Payload	Response Handling
POST /auth/send-otp	OTPFlow	"Send OTP" button	{ phone }	Show code input, start timer
POST /auth/verify-otp	OTPFlow	"Verify" button	{ phone, code, displayName? }	If needsDisplayName → show name input; else store token + user in localStorage
GET /auth/me	App init	On mount (if token exists)	Bearer token	Hydrate GameContext user state
Match Endpoints
Endpoint	Page	Trigger	Payload	Response Handling
GET /matches	Lobby	On mount + 15s interval	—	Render match cards (live first, then upcoming)
POST /matches/:id/join	Match page	On mount (auto-join)	{ venueId, matchCode }	Store participant in context
GET /matches/:id/state	Match page	On mount	?venueId	Set match + participant + openPredictions + playerCount
Prediction Endpoints
Endpoint	Page	Trigger	Payload	Response Handling
GET /predictions/:matchId	Match page	On mount + socket newPrediction	?venueId&round&status	Render prediction cards
POST /predictions/:id/answer	Match page	Option tap + confirm	{ selectedOption, boostType, venueId }	Update local answered state, show feedback
GET /predictions/:matchId/my-predictions	My Picks panel	Tab switch	?venueId	Show answered predictions with results
Leaderboard Endpoints
Endpoint	Page	Trigger	Payload	Response Handling
GET /leaderboard/:matchId/:venueId/round/:round	Leaderboard	Round tab change	—	Render round rankings
GET /leaderboard/:matchId/:venueId/match	Leaderboard	"Match" tab	—	Render overall rankings
GET /leaderboard/:matchId/:venueId/count	Match page	On join	—	Show player count badge
Venue Admin Endpoints
Endpoint	Page	Trigger
POST /venues/register	Admin	Register form submit
POST /venues/login	Admin	Login form submit
PUT /venues/rewards	Admin → Setup tab	Save reward config
POST /admin/match-code	Admin → Codes tab	"Generate Code" button
POST /rewards/redeem	Admin → Redeem tab	Code input submit
GET /admin/venue/stats	Admin → Overview	On tab load
5. Real-Time Socket.IO Event Map

Client → Server:
  joinVenueMatch({ venueId, matchId })     → Joins room venue:{venueId}:{matchId}
  joinTV({ venueId })                       → Joins TV broadcast room
  leaveVenueMatch({ venueId, matchId })     → Leaves room

Server → Client:
  newPrediction        → Fetch new predictions, show notification
  predictionsLocked    → Disable answer buttons for locked predictions
  predictionResolved   → Mark prediction result, update points
  predictionPulse      → Show punchy commentary overlay
  leaderboardUpdate    → Refresh leaderboard data
  hypeEvent            → Show hype alert (all-in, streak 5+)
  roundWinner          → Show round winner reveal animation
  scoreUpdate          → Update live score display
  matchStarted         → Transition from pre-match to live UI
  inningsBreak         → Show innings break UI, target display
  matchEnd             → Show final results, grand prize
  playerCount          → Update player count badge
6. State Management Architecture
GameContext (existing context/GameContext.tsx)

interface GameState {
  token: string | null;
  userId: string | null;
  user: { id, phone, displayName, avatarConfig } | null;
  matchId: string | null;
  venueId: string | null;
  venueSlug: string | null;
  currentRound: number;
  totalPoints: number;
  roundPoints: number;
  currentStreak: number;
  bestStreak: number;
  boostsUsedRound: number;
  allInUsed: boolean;
  totalPredictions: number;
  correctPredictions: number;
}

// Actions: SET_TOKEN, SET_USER, SET_MATCH, SET_VENUE, 
//          UPDATE_PARTICIPANT, RESET
Pattern: Context + useReducer — appropriate for this app size. No need for Redux/Zustand.

7. UI/UX Structure
Design System (already implemented)
Token	Value	Usage
Primary	#00FFAB (lime)	CTAs, success, active states
Secondary	#14D1FF (cyan)	Secondary actions, accents
Surface	#111317	Page backgrounds
Container	#1a1c20 → #333539	Cards, panels
On-Surface	#E2E2E8	Primary text
Error	#FFB4AB	Errors, destructive
Component Patterns
Cards: Glassmorphic panels with backdrop-blur, subtle borders
Buttons: Neon glow on primary, outlined for secondary
Modals: Dark backdrop + blur, centered content
Loading: Pulse animation skeletons
Empty states: Icon + message + CTA
Error states: Red-tinted card with retry button

Role-Based UI
Role	Pages Accessible	Nav Pattern
Player (User)	/, /lobby, /match/*, /rewards, /profile, /leaderboard	BottomNav (Home, Leaderboard, Rewards)
Venue Admin	/admin	Tab navigation within page
Owner	/owner	Tab navigation within page
TV	/tv	No navigation (auto-rotating display)
8. Navigation Flow

QR Scan → /cafe/[slug]
              │
              ▼
     Has token? ──No──→ OTPFlow (phone → code → displayName)
              │                         │
             Yes                        ▼
              │                   Token stored
              ▼                         │
         /cafe/[slug]/lobby ◄───────────┘
              │
              ▼
     Select match → Enter match code
              │
              ▼
     /cafe/[slug]/match/[matchId]
         ├── Pre-match phase → Card swipe predictions
         └── Live phase → Per-over predictions + leaderboard
              │
              ├── /cafe/[slug]/leaderboard (via BottomNav)
              └── /cafe/[slug]/rewards (via BottomNav)

Direct access (no QR):
  / → /lobby → /match/[matchId]
9. What's Missing / Gaps to Fill
Based on analyzing backend endpoints vs frontend implementation:

Gap	Backend Support	Frontend Status
TV Display	Socket events for leaderboard, pulse, hype, round winners	/tv page exists but needs full implementation
Bold Calls	bold_call category in predictions	Not differentiated in UI
Hot Takes	hot_take category generated per round	Shown as regular predictions
Rivalry Calls	rivalry_call generated at innings break	Shown as regular predictions
Reward Expiry Timer	expiresAt field on rewards	No countdown shown to user
Geofencing	latitude/longitude/radiusMeters on Venue	Not implemented client-side
Season Leaderboard	Not in v1 scope	—
SMS Reminders	Not in v1 scope	—
10. Recommended Folder Structure (Scalable)
The current structure is solid. Here's the recommended evolution:


frontend/src/
├── app/                          # Next.js App Router pages
│   ├── (player)/                 # Route group for player pages
│   │   ├── lobby/page.tsx
│   │   ├── match/[matchId]/page.tsx
│   │   ├── rewards/page.tsx
│   │   ├── profile/page.tsx
│   │   └── leaderboard/page.tsx
│   ├── (venue)/                  # Route group for venue pages
│   │   └── admin/page.tsx
│   ├── (platform)/               # Route group for owner
│   │   └── owner/page.tsx
│   ├── cafe/[slug]/              # Venue-scoped routes (keep as-is)
│   ├── tv/page.tsx
│   └── layout.tsx
├── components/
│   ├── game/                     # Game-specific components
│   │   ├── LiveGame.tsx
│   │   ├── PreMatchCards.tsx
│   │   ├── PredictionCard.tsx    # Extract from LiveGame
│   │   ├── BoostSelector.tsx     # Extract boost UI
│   │   └── StreakIndicator.tsx   # Extract streak display
│   ├── leaderboard/
│   │   └── Leaderboard.tsx
│   ├── rewards/
│   │   ├── RewardBanner.tsx
│   │   └── RewardCard.tsx        # NEW: individual reward with timer
│   ├── auth/
│   │   └── OTPFlow.tsx
│   ├── avatar/
│   │   ├── AvatarPreview.tsx
│   │   ├── AvatarCustomizer.tsx
│   │   └── avatarAssets.ts
│   ├── tv/                       # NEW: TV display components
│   │   ├── TVLeaderboard.tsx
│   │   ├── PredictionPulse.tsx
│   │   ├── HypeAlert.tsx
│   │   └── RoundWinnerReveal.tsx
│   └── ui/                       # Shared UI primitives
│       ├── Header.tsx
│       ├── BottomNav.tsx
│       ├── MaterialIcon.tsx
│       ├── Modal.tsx             # NEW: reusable modal
│       ├── Skeleton.tsx          # NEW: loading skeleton
│       └── Badge.tsx             # NEW: status badges
├── context/
│   └── GameContext.tsx
├── hooks/                        # NEW: custom hooks
│   ├── useSocket.ts              # Socket connection + cleanup
│   ├── useAuth.ts                # Auth state + redirect
│   ├── usePredictions.ts         # Prediction fetching + caching
│   └── useCountdown.ts           # Timer for expiring predictions/rewards
├── lib/
│   ├── api.ts                    # REST client
│   ├── socket.ts                 # Socket.IO instance
│   └── navigation.ts             # Route helpers
├── types/
│   ├── avatar.ts
│   ├── match.ts                  # NEW: Match, Prediction, etc.
│   └── api.ts                    # NEW: API request/response types
└── globals.css
11. Key Starter Code
Custom Hooks (new additions)
hooks/useAuth.ts — Auth guard + token management:


'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import { api } from '@/lib/api';

export function useAuth(redirectTo = '/login') {
  const { state, dispatch } = useGame();
  const router = useRouter();

  useEffect(() => {
    const token = state.token || localStorage.getItem('token');
    if (!token) { router.replace(redirectTo); return; }

    if (!state.user) {
      api.getMe(token).then(user => {
        dispatch({ type: 'SET_USER', payload: user });
      }).catch(() => {
        localStorage.removeItem('token');
        router.replace(redirectTo);
      });
    }
  }, [state.token]);

  return { user: state.user, token: state.token, isAuthenticated: !!state.token };
}
hooks/useSocket.ts — Socket room management:


'use client';
import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

export function useSocket(venueId: string, matchId: string) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!venueId || !matchId) return;
    const socket = getSocket();
    socketRef.current = socket;
    socket.emit('joinVenueMatch', { venueId, matchId });

    return () => {
      socket.emit('leaveVenueMatch', { venueId, matchId });
    };
  }, [venueId, matchId]);

  return socketRef.current;
}
hooks/useCountdown.ts — Expiry timer for predictions/rewards:


'use client';
import { useState, useEffect } from 'react';

export function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { secondsLeft, isExpired: secondsLeft <= 0, formatted: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` };
}
TypeScript Types (new file)
types/match.ts:


export interface Match {
  id: string;
  externalId?: string;
  team1: string;
  team2: string;
  team1Short: string;
  team2Short: string;
  team1Players: string[];
  team2Players: string[];
  startTime: string;
  status: 'upcoming' | 'live' | 'completed';
  currentPhase: string;
  currentOver: number;
  currentInnings: number;
  scoreData: Record<string, any>;
}

export interface Prediction {
  id: string;
  matchId: string;
  category: 'pre_match' | 'per_over' | 'hot_take' | 'bold_call' | 'rivalry_call';
  round: number;
  overNumber?: number;
  question: string;
  options: { key: string; label: string; points: number }[];
  correctOption?: string;
  status: 'open' | 'locked' | 'resolved';
  expiresAt?: string;
  userAnswer?: string;
}

export interface Participant {
  id: string;
  userId: string;
  matchId: string;
  venueId: string;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
  boostsUsedRound: number;
  allInUsed: boolean;
  currentRound: number;
  totalPredictions: number;
  correctPredictions: number;
}

export interface Reward {
  id: string;
  round: number;
  position: number;
  rewardText: string;
  code: string;
  status: 'active' | 'redeemed' | 'expired';
  expiresAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarConfig: string;
  points: number;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
  accuracy?: number;
}
Reusable Modal Component
components/ui/Modal.tsx:


'use client';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative glass-panel rounded-2xl p-6 w-full max-w-md"
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
          >
            {title && <h2 className="text-lg font-bold text-[var(--md-on-surface)] mb-4">{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
Loading Skeleton
components/ui/Skeleton.tsx:


export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--md-surface-container)] rounded-lg ${className}`} />;
}

export function PredictionCardSkeleton() {
  return (
    <div className="glass-panel rounded-2xl p-4 space-y-3">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
12. Error Handling Strategy

// In lib/api.ts — already exists, enhance with:
async function handleResponse<T>(promise: Promise<Response>): Promise<T> {
  const res = await promise;
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || 'Something went wrong');
  }
  return res.json();
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
Per-page error handling pattern:

Network errors → Toast notification + retry button
401 → Auto-redirect to login, clear token
403 → "Access denied" message (venue not approved, etc.)
404 → "Not found" with back navigation
Validation (400) → Inline field errors
13. Summary
Your frontend is already well-built with the core architecture in place. The main areas to enhance:

Extract reusable hooks (useAuth, useSocket, useCountdown) from inline useEffect blocks
Add TypeScript types for all API responses (currently mostly any)
TV Display page — needs full implementation with rotating leaderboard/pulse/hype views
Differentiate prediction categories — hot takes, bold calls, and rivalry calls should have distinct visual treatment
Reward expiry countdown — show remaining time on active rewards
Geofencing — add browser Geolocation API check against venue coordinates
Component extraction — break LiveGame (~500 lines) into smaller components (PredictionCard, BoostSelector, etc.)
The architecture is sound — Next.js App Router with Context + Socket.IO is the right choice for this real-time game. No need for Redux/Zustand at this scale.