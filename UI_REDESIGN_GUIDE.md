# JAFFA — UI Redesign Guide

A handoff document for redesigning the JAFFA cricket-prediction app from scratch. Covers the full user journey from "Enter Arena" through match end, every page along the way, the data each page needs, the existing design tokens you may want to keep or replace, and the state model that ties it all together.

**Audience:** A designer (or a designer + dev pair) starting a clean redesign without rewriting backend or game logic. Backend endpoints, socket events, prediction rules, and points math are stable — the redesign work is purely the UI surface.

**Out of scope of this doc:** `/admin/*`, `/owner/*`, `/tv/*`, `/safe` — staff/diagnostic surfaces. Redesign covers user-facing pages only.

---

## Table of Contents

1. [The user journey at a glance](#1-the-user-journey-at-a-glance)
2. [App shell — Header, BottomNav, Cafe routing](#2-app-shell)
3. [Page-by-page reference](#3-page-by-page-reference)
4. [Match page — the four phases in depth](#4-match-page--the-four-phases-in-depth)
5. [Punter Card — design + flow detail](#5-punter-card)
6. [Game model concepts (rounds, boosts, points)](#6-game-model-concepts)
7. [GameContext state model](#7-gamecontext-state-model)
8. [API reference](#8-api-reference)
9. [Socket.IO event reference](#9-socketio-event-reference)
10. [Existing design tokens](#10-existing-design-tokens)
11. [Hard constraints for any redesign](#11-hard-constraints)

---

## 1. The user journey at a glance

```
                    ┌─────────────────────────────┐
                    │  /  Splash ("ENTER ARENA")  │
                    └─────────────┬───────────────┘
                                  │ tap
                    ┌─────────────▼───────────────┐
                    │  /login   phone + nickname  │
                    └─────────────┬───────────────┘
                                  │ logged in
                    ┌─────────────▼───────────────┐
              ┌─────│  /lobby    match discovery  │─────┐
              │     └──┬───────────────┬─────┬────┘     │
              │        │               │     │          │
        past battle    join match    create  join    /room/[id]
              │        │               │  room       (friend room)
              │        │               │     │          │
              │  /punter-card/[matchId]│     │          │
              │  (10 pre-match Qs,     │     │          │
              │   midnight on day-of)  │     │          │
              │        │               ▼     ▼          │
              │        │     /room/create or /room/join │
              │        │               │                │
              │        │               └─► /room/[id] ──┤
              │        │                                │
              │        ▼                                │
              │  ┌─────────────────────────────┐        │
              │  │  /match/[matchId]           │◄───────┘
              │  │  ┌──────────────────────┐   │
              │  │  │ Phase 1: Pre-match   │   │ ← cards swipe; toss/wickets/etc.
              │  │  ├──────────────────────┤   │
              │  │  │ Phase 2: Live        │   │ ← per-over picks, boosts, all-in
              │  │  │ ─ Innings break ─    │   │ ← target banner
              │  │  │ Phase 2 (innings 2)  │   │ ← rivalry calls appear
              │  │  ├──────────────────────┤   │
              │  │  │ Phase 3: Completed   │   │ ← BATTLE OVER, results frozen
              │  │  └──────────────────────┘   │
              │  └─────────┬───────────────────┘
              │            │ optional drill-downs
              │            ▼
              │  /my-picks (per-match history)
              │  /leaderboard (round + match ranks)
              │  /redeem (weekly points spend)
              │  /recap/[matchId] (post-match story)
              │  /rewards (4-digit codes)
              └────────────────────────────────────────────► back to /lobby
```

Most users follow: **enter arena → lobby → punter card (optional) → match → recap → lobby**.

---

## 2. App shell

Every page (except `/`, `/login`, `/admin`, `/owner`, `/safe`, `/tv`) sits inside a fixed shell:

### Header — `frontend/src/components/Header.tsx`

- Sticky top, full width.
- Three-column grid: spacer | centered logo | (notification bell + profile avatar).
- Logo click navigates to `/lobby` if no active match, else `/match/<activeMatchId>`.
- Avatar click → `/profile`.
- Visible on every shell page.

### BottomNav — `frontend/src/components/BottomNav.tsx`

Four tabs, fixed bottom, respects iOS safe-area-inset.

| Tab | Icon | Route |
|-----|------|-------|
| **Home** | castle | `/match/<activeMatchId>?venueId=…` if match, else `/lobby`. **Double-tap forces `/lobby`** (escape hatch). |
| **Ranks** | podium | `/leaderboard?matchId=<id>` |
| **Week Pts** | crown coin | `/redeem` (badge shows `state.weeklyPoints`) |
| **My Picks** | alarm clock | `/my-picks` |

Active tab = orange text + bottom orange border.

### Cafe routing — `frontend/src/lib/navigation.ts`

The app supports a multi-tenant URL prefix `/cafe/<slug>/…`. When the user enters via a venue's QR code:

- `cafe/[slug]/layout.tsx` validates the slug via `GET /api/venues/by-slug/:slug`, populates localStorage with `jaffa_venue_id`, `jaffa_venue_name`, `jaffa_venue_slug`.
- All child pages mirror the global routes (`/cafe/<slug>/lobby`, `/cafe/<slug>/match/[matchId]`, etc.).
- Helpers `cafeUrl(path)` and `isCafeRoute()` let any page emit cafe-prefixed nav links.
- Practical effect for design: the URL changes, but the **page UI is identical**. A redesign doesn't need separate cafe variants — just keep nav helpers wrapping every `router.push` call.

---

## 3. Page-by-page reference

### `/` — Splash / "Enter Arena"
`frontend/src/app/page.tsx`

- Brand intro + onboarding splash. Single CTA: **ENTER ARENA**.
- If a JWT token is already in localStorage → redirect to `/lobby` (skip splash).
- Accepts `?v=<venueId>&m=<matchId>` query params for deep-link entry; stores in localStorage.
- **Navigates to:** `/login` (or directly `/lobby` if logged in).

### `/login` — Phone + nickname
`frontend/src/app/login/page.tsx`

- Two inputs: phone, display name. Submit → token + user.
- Two auth modes (server config decides which):
  - **OTP path (default prod):** `POST /api/auth/send-otp` → user enters code → `POST /api/auth/verify-otp` returns `{ token, user, isNewUser }`.
  - **Phone-direct path (dev only, gated by `ALLOW_UNSAFE_PHONE_LOGIN`):** `POST /api/auth/phone-login` returns same shape immediately.
- If already logged in → redirect, no form flash. Suppression flag prevents the form rendering before the auth check finishes.
- **Navigates to:** `/lobby` (or `/cafe/<slug>/lobby` if cafe route).

### `/lobby` — Match discovery hub
`frontend/src/app/lobby/page.tsx`

The central hub. Shows:

- **Live matches** (status=`live`) — primary CTA (Join via match code).
- **Upcoming matches** (status=`upcoming`) — collapsed by default; "Notify Me" if too early.
- **Past matches** (this user's completed participations) — collapsed; tapping a row sets localStorage `jaffa_match_id`/`jaffa_venue_id` and navigates to `/match/<id>?venueId=<v>` (read-only).
- **Friends rooms** — "My Rooms" (auto-loaded), Create Room, Join Room buttons. Only shown to **global** users (not cafe users).

API calls:

- `GET /api/matches` — returns merged list (DB + Sportsmonk).
- `GET /api/rooms/my` — current user's active rooms.
- `GET /api/matches/my-past?page=N&pageSize=10` — paginated history.
- `POST /api/matches/import/:fixtureId` — converts a Sportsmonk fixture into a local match record (called when joining a not-yet-imported live match).
- `POST /api/admin/validate-match-code` — checks the 4-digit code typed in the join modal.

State of note: `codeModal` (the match-code input modal), `pastExpanded` / `upcomingExpanded` (collapsible sections).

### `/match/[matchId]` — Live prediction dashboard
`frontend/src/app/match/[matchId]/page.tsx`

The single most complex page. Renders one of four phases — see [section 4](#4-match-page--the-four-phases-in-depth).

### `/punter-card/[matchId]` — Pre-match 10-question card
`frontend/src/app/punter-card/[matchId]/page.tsx`

Standalone page (not inside `/match`) for the 10 pre-match Punter Card questions. Opens at midnight IST on match day. See [section 5](#5-punter-card).

### `/my-picks` — All my predictions
`frontend/src/app/my-picks/page.tsx`

Scoped to the current `state.matchId` (with `localStorage.jaffa_match_id` fallback so past-battle nav works). Shows every prediction the user submitted in this match, grouped by over (per-over Qs) plus an "Others" bucket (pre-match, hot takes, punter card).

For each pick: question, the user's selection, status (correct / wrong / pending), points earned, and a "rarity badge" (e.g. "top 5% — elite call") computed from the global aggregates returned alongside.

API: `GET /api/predictions/:matchId/my-predictions?venueId=…`.

Empty state: "NO ACTIVE MATCH" if no match in context.

### `/leaderboard` — Round + match ranks
`frontend/src/app/leaderboard/page.tsx`

Two views, toggled by round pills (R1–R6 + "Match"):

- **Round view** — `GET /api/leaderboard/:matchId/:venueId/round/:round` — top players in just that round.
- **Match view** — `GET /api/leaderboard/:matchId/:venueId/match` — cumulative.

Also fires `GET /api/matches/:matchId/state` to derive the current round client-side (in case the user lands here before opening the match page).

For room context (user playing in a friends room), swaps to `GET /api/rooms/:roomId/leaderboard` and the round-room variant.

### `/global-leaderboard` — Lifetime ranks
`frontend/src/app/global-leaderboard/page.tsx`

Scope toggle: All / City / State. Shows lifetime points across every match the player has played. Requires a captured location (handled by `PUT /api/auth/location` via geolocation prompt). API: `GET /api/global-leaderboard?scope=…&page=…`.

### `/redeem` — Weekly rewards catalog
`frontend/src/app/redeem/page.tsx`

Spend `weeklyPoints` (resets every Monday) on coupons / freebies from a catalog. APIs:

- `GET /api/weekly-rewards/catalog` — items + which the user can already afford / has redeemed.
- `POST /api/weekly-rewards/redeem` — body `{ rewardKey }`, decrements points.

### `/recap/[matchId]` — Post-match story
`frontend/src/app/recap/[matchId]/page.tsx`

Narrative summary fired by `GET /api/matches/:matchId/my-story?venueId=…`. Server returns `{ summary, toneLine, beats: [{ type, title, detail, data }] }` — render the beats as a vertical story stack with icons (signature call, hot streak, clutch moment, all-in burn, etc.). Tap a beat → drill into `/my-picks?matchId=…` filtered to that data slice.

### `/rewards` — Match-scoped reward codes
`frontend/src/app/rewards/page.tsx`

The 4-digit reward codes earned by ranking top 3 in a round / match. Each row: redact-by-default, tap-to-reveal, tap-again-to-copy.

API: `GET /api/rewards/my?matchId=…`.

### `/profile` — Avatar + stats + logout
`frontend/src/app/profile/page.tsx`

User-detail page. Shows lifetime stats (matches played, accuracy, lifetime points), avatar customizer modal, location capture button, logout. APIs: `GET /api/auth/me`, `GET /api/auth/stats`, `PUT /api/auth/avatar`, `PUT /api/auth/location`.

Sub-page `/profile/punter-cards`: grid of every historical Punter Card with score tally.

### Room pages
- `/room/create` — modal-style page to create a private room. POST `/api/rooms` returns `{ room, shareLink, venueId: ROOM_VENUE_ID }`.
- `/room/join` — 6-char code input. POST `/api/rooms/join`.
- `/room/[roomId]` — room hub: members list, match details, room-scoped leaderboard. APIs: `GET /api/rooms/:roomId`, `GET /api/rooms/:roomId/leaderboard`. Socket: `joinRoom { roomId }` → live `memberJoined`/`memberLeft` events.
- `/room/[roomId]/leaderboard` — room round/match leaderboard.

Rooms use a synthetic `ROOM_VENUE_ID` so they slot into the same MatchParticipant model as venue play.

---

## 4. Match page — the four phases in depth

The `/match/[matchId]` page is a state machine. Phase decision logic is at `frontend/src/app/match/[matchId]/page.tsx` (large file — ~2k lines).

### Phase 1: **Pre-match** (round 0)

Triggered when the page loads and the match has not started yet. Only the pre-match questions are open.

- **UI:** A swipeable **card stack** — one question at a time, full-screen card. User taps an option → instant submit → 600ms checkmark animation → auto-advance.
- **7 question types** (see [section 6](#6-game-model-concepts) for full list):
  1. Match winner
  2. Toss + decision (combined)
  3. Powerplay vibe
  4. Will we see a century? (Yes/No)
  5. First wicket mode (caught / bowled / lbw / run out)
  6. Top scorer (player picker)
  7. Wildcard (hat-trick / 100-off-50 / super over)
- A subset is **gated**: toss questions remain locked until socket fires `tossLocked`; the page re-fetches and unlocks.
- **APIs:** `GET /api/predictions/:matchId?venueId=…&round=0`, `POST /api/predictions/:predictionId/answer`.
- **Sockets:** `tossLocked`, `matchStarted`, `predictionsLocked`.

### Phase 2: **Live** (rounds 1–6)

This is the bulk of the user time. Four sub-blocks rendered top-to-bottom:

1. **Scorecard hero** — current score, wickets, overs, CRR, RRR (if chasing). Polls `GET /api/matches/:matchId` every 10s + refreshes on socket `scoreUpdate`.
2. **OverBallsPanel** — last over visualised as a row of ball-chips (4 / 6 / W / · / 1). Source: `GET /api/matches/:matchId/balls`.
3. **Open predictions** — stack of cards for currently-open Qs (per-over questions, hot takes, rivalry calls). Each card:
   - Question + options.
   - Two actions before submit: tap an option (drafts the answer, doesn't lock yet) → optionally tap **2x BOOST** or **3x ALL-IN** → tap **LOCK IN** to submit.
   - Locked cards animate down into the My Picks accordion.
4. **My Picks accordion** — collapsible list of locked predictions, grouped by over.

- **APIs:**
  - `GET /api/predictions/:matchId?venueId=…` — refresh on every socket prediction event.
  - `POST /api/predictions/:predictionId/answer` — body `{ selectedOption, boostType: "none"|"boost"|"all_in", venueId }`.
  - `GET /api/matches/:matchId/state?venueId=…` — participant stats, player count.
  - `GET /api/leaderboard/:matchId/:venueId/match` — for inline rank display.
- **Sockets:** `scoreUpdate`, `newPrediction`, `predictionsLocked`, `predictionResolved`, `predictionPulse` (with commentary), `myPredictionWin` (user-scoped, fires the win popup), `inningsBreak`, `oversReduced`, `hypeEvent`.

### Phase 2.5: **Innings break**

Transient phase between innings 1 and 2. Server fires `inningsBreak { target, team1Score, team1Wickets }` → page renders a target-banner overlay until innings 2 predictions arrive.

### Phase 3: **Completed**

Triggered when `match.status === "completed"`. UI changes:

- **BATTLE OVER** sticker at the top.
- Result line: e.g. "SRH won by 5 wickets" or "GT won by 12 runs". Computed client-side from `scoreData`.
- All open prediction cards disappear.
- My Picks remains read-only.
- A "View Recap" link appears → navigates to `/recap/[matchId]`.

### Side state always present during the match

- **GameContext** (see [section 7](#7-gamecontext-state-model)): `totalPoints`, `currentStreak`, `currentRound`, `boostsUsedThisRound`, `allInUsedInnings1/2`. The header / bottom nav / inline rank chips read from here.
- **WinPopup** — global overlay component rendered once at the layout level. Subscribes to socket `myPredictionWin`; pops a celebration card with the points just earned, dismissible.

---

## 5. Punter Card

This is the user's flagship engagement feature. It deserves its own section because the recent redesign there should set the visual direction for the rest of the redesign.

### What it is

10 pre-match questions players answer **before the match starts**. Opens at **midnight IST** on match day, locks at first ball.

The 10 questions:

| # | Template key | Question | Options |
|---|---|---|---|
| 1 | `punter_motm` | Player of the Match | up to 24 players (both teams interleaved) |
| 2 | `punter_top_batter` | Top Batter | up to 16 batters |
| 3 | `punter_top_bowler` | Top Bowler | up to 16 bowlers/all-rounders |
| 4 | `punter_inn1_50` | 1st Innings — Any player to score 50 | Yes / No |
| 5 | `punter_inn1_100` | 1st Innings — Any player to score 100 | Yes / No |
| 6 | `punter_inn2_50` | 2nd Innings — Any player to score 50 | Yes / No |
| 7 | `punter_inn2_100` | 2nd Innings — Any player to score 100 | Yes / No |
| 8 | `punter_highest_at_1st_dismissal` | Team with highest score at 1st dismissal | Team A / Draw / Team B |
| 9 | `punter_match_winner` | Winner (incl. Super Over) | Team A / Team B |
| 10 | `punter_toss_winner` | Coin toss winner | Team A / Team B |

Points scale with odds (`oddsToPoints`): Yes-50 ≈ 5pts, No-100 ≈ 5pts, Top Batter pos-1 ≈ 35pts, last Punter MOTM pos-24 ≈ 200pts.

### Page layout (current, post-redesign)

`frontend/src/app/punter-card/[matchId]/page.tsx`

- **Background:** per-match team-color gradient (driven by both teams' brand colors via `frontend/src/lib/teamColors.ts`).
- **Watermark:** giant faded "JAFFA" wordmark behind everything for depth.
- **Sticky header:** back arrow + "PUNTER CARD" eyebrow + "T1 VS T2" title + Share/Copy buttons (visible only when all 10 answered).
- **Hero pill** (centered under header): vertical glass-morphism stack — date, team1 crest, "VS", team2 crest, time. Crests come from `frontend/src/components/TeamBadge.tsx` which loads `/team-logos/<short>.png` and falls back to a styled text disc.
- **Question cards:** chunky `rounded-3xl` glass tiles, status pill at top (PENDING / LOCKED / +N PTS / MISSED), Bungee question typography, picks as 2-col chunky pill buttons with glowing PTS chips.
- **Sticky bottom Lock-In bar:** floating glass panel inset from screen edges, shows "N picks ready" + Lock In CTA.
- **Hidden ShareCard:** off-screen 1080×1350 div rendered by `html-to-image` → JPEG when the user taps Share. Inlines logos as base64 (see `teamLogos.ts`) so the rasterizer always paints them.

### APIs

- `GET /api/punter-card/:matchId?venueId=…` — returns `{ match, questions: [{...q, userAnswer}], allAnswered }`.
- `POST /api/punter-card/:matchId/answer` — body `{ venueId, answers: [{ predictionId, selectedOption }] }`. Batch submit; allows updates until match starts.
- `GET /api/punter-card/my/cards` — all the user's historical cards.

### Why it's the design touchstone

The Punter Card is the only page that already follows the "chunky / NFT-card / gamified" visual language the user wants. The rest of the app (lobby, match, my-picks, leaderboard, redeem, profile) still uses an older flat-slate look. The redesign should propagate the punter card's visual DNA outward.

---

## 6. Game model concepts

### Rounds (R0–R6)

| Round | Overs | Innings | Phase |
|-------|-------|---------|-------|
| R0 | — | — | Pre-match (toss + 7 cards) |
| R1 | 1–6 | 1st | Powerplay |
| R2 | 7–15 | 1st | Middle |
| R3 | 16–20 | 1st | Death |
| R4 | 1–6 | 2nd | Chase powerplay |
| R5 | 7–15 | 2nd | Chase middle |
| R6 | 16–20 | 2nd | Chase death |

Source: `frontend/src/app/leaderboard/page.tsx:17–32` (`deriveRound`).

### Prediction categories

| Category | When it appears | Cardinality | Notes |
|---|---|---|---|
| `pre_match` | Before first ball (R0) | 7 questions, swipe-card flow | Toss Qs locked until toss called. |
| `per_over` | Every over | 2 questions per over from rotating pool | No template repeats within 3 overs. |
| `per_over` (player-keyed) | Every batter's first ball / every bowler's first over | 1 per new batter, 1 per new bowler | Same category, but `subjectType=batsman_innings`/`bowler_innings`/etc. and `playerId` set. Lock 30s after creation; resolved at innings end. |
| `hot_take` | Per-round start | Variable, opt-in, debatable | "Either opener score 50+?", "Will Pat reach a century?" |
| `bold_call` | Pre-match + innings break | Rare | High-multiplier, typically 1–2 per match. |
| `rivalry_call` | 2nd innings only | Variable | Chase-specific ("Will chase end in middle?"). |
| `punter_card` | Midnight on match day → first ball | Always 10 | See [section 5](#5-punter-card). |

### Points + multipliers

| Mechanism | Multiplier | Limit | Notes |
|---|---|---|---|
| **Boost** | 2× | 2 per round | Player-selected before lock-in. |
| **Streak bonus** | +5 / +10 / +20 | None | At 3rd correct (+5), 5th (+10), 10th+ (+20). |
| **All-In** | 3× | 1 per innings | Penalty: −30 if wrong. Limited to 1 per innings 1 (R1–R3) and 1 per innings 2 (R4–R6). |
| **Wrong** | 0× | — | No points. Streak resets. |

`backend/src/services/pointsEngine.ts:55–96`. Total points never go below 0.

### Leaderboards

| Type | Scope | Resets | Reward |
|---|---|---|---|
| Round | venue + match + round | per round | Top 3 in each round → 4-digit code |
| Match | venue + match | per match | Top 3 cumulative → grand-prize 4-digit code |
| Extras | venue + match | per match | Aggregates pre_match + punter_card points only |
| Weekly | global | every Monday (ISO week) | Spend at `/redeem` catalog |
| Global lifetime | all | never | Bragging rights (`/global-leaderboard`) |

### Reward code redemption

1. Top-3 finisher gets a unique **4-digit code** stored in `Reward` table (`code`, `userId`, `matchId`, `round`, `position`, `rewardText`, `expiresAt`).
2. Player sees the code on `/recap/[matchId]` or `/rewards`.
3. Player tells / shows the code to venue staff.
4. Staff types code into venue dashboard → `POST /api/rewards/redeem` (venue-auth).
5. Server validates: code exists, status=active, not expired, venue matches. Marks `status=redeemed`, sets `redeemedAt`.
6. Staff sees: reward text + player name + round + position.

Brute-force protection: 20 attempts/min/venue, strict `^[0-9]{4}$` regex, transactional update.

---

## 7. GameContext state model

`frontend/src/context/GameContext.tsx`. Single React reducer hydrated on app boot, persisted to localStorage.

### State fields

| Field | Type | Source |
|---|---|---|
| `user` | `User \| null` | `SET_USER` after login |
| `token` | `string \| null` | `SET_USER` / `SET_TOKEN` |
| `userId` | `string \| null` | derived from `user.id` |
| `venueId` | `string \| null` | `SET_VENUE` (cafe entry, room join, or match join) |
| `venueName` | `string \| null` | `SET_VENUE` |
| `venueSlug` | `string \| null` | `SET_VENUE` |
| `matchId` | `string \| null` | `SET_MATCH` (from join) |
| `roomId` | `string \| null` | `SET_ROOM` |
| `roomCode` | `string \| null` | `SET_ROOM` |
| `currentRound` | `number` | `SET_ROUND` (cleared by `CLEAR_MATCH`) |
| `boostsUsedThisRound` | `number` | `USE_BOOST` (resets on `SET_ROUND`) |
| `allInUsedInnings1` | `boolean` | `USE_ALL_IN` (innings=1) |
| `allInUsedInnings2` | `boolean` | `USE_ALL_IN` (innings=2) |
| `currentStreak` | `number` | `UPDATE_STREAK` |
| `bestStreak` | `number` | `UPDATE_STREAK` (monotonic up) |
| `totalPoints` | `number` | `ADD_POINTS` (clamped ≥0) |
| `weeklyPoints` | `number` | `SET_WEEKLY_POINTS` (from `/api/weekly-rewards/points`) |
| `roundPoints` | `Record<number, number>` | `ADD_POINTS` bucketed by round |
| `totalPredictions` | `number` | `CLEAR_MATCH` resets |
| `correctPredictions` | `number` | `CLEAR_MATCH` resets |
| `isLoading` | `boolean` | true until hydration completes |

### localStorage keys (persisted)

```
jaffa_token         // JWT (24h server TTL)
jaffa_user          // serialised user object
jaffa_venue_id      // current venue / room venue
jaffa_venue_name    // display only
jaffa_venue_slug    // for cafe URL prefix
jaffa_match_id      // last-active match
jaffa_room_id       // active friends room
jaffa_room_code     // shareable code
```

### Hydration flow on boot

1. Purge any `"null"` / `"undefined"` poison values left in localStorage by older builds.
2. If no `jaffa_token` → restore venue/match/room IDs from localStorage and exit (`isLoading=false`).
3. If token present → `GET /api/auth/me` (5s timeout):
   - Success → `SET_USER`, restore venue/match/room.
   - Failure → drop token, `isLoading=false`.
4. Background `GET /api/weekly-rewards/points` → `SET_WEEKLY_POINTS` (non-blocking).

A redesign should preserve this hydration shape — it's what makes the app feel "logged in instantly" on returning visits.

---

## 8. API reference

All paths prefixed with `/api/`. Auth column: `User` = `Authorization: Bearer <jaffa_token>`, `Venue` = bearer venue token, `None` = public.

### Auth

| Method + Path | Auth | Notes |
|---|---|---|
| `POST /auth/send-otp` | None (rate-limited 3/15min) | `{ phone }` → OTP sent |
| `POST /auth/verify-otp` | None (rate-limited 10/15min) | `{ phone, code, displayName }` → `{ token, user, isNewUser }` or `{ needsDisplayName: true }` |
| `POST /auth/phone-login` | None (dev only) | `{ phone, displayName }` → `{ token, user, isNewUser }` |
| `GET /auth/me` | User | current user object |
| `GET /auth/stats` | User | `{ matchesPlayed, totalCorrect, totalPredictions, accuracy, lifetimePoints, city, state }` |
| `PUT /auth/avatar` | User | `{ avatarConfig }` |
| `PUT /auth/location` | User | `{ latitude, longitude }` → `{ city, state }` |

### Matches

| Method + Path | Auth | Returns / Notes |
|---|---|---|
| `GET /matches` | None | merged list of live + upcoming + DB matches with `team1Img`/`team2Img` Sportsmonk URLs |
| `GET /matches/:matchId` | None | full match object |
| `POST /matches/:matchId/join` | User | `{ venueId, matchCode, latitude?, longitude? }` → MatchParticipant; geofence-validates, fires `playerCount` socket |
| `GET /matches/:matchId/state?venueId=…` | User | `{ match, participant, openPredictions[], playerCount }` |
| `GET /matches/:matchId/balls` | None | per-over ball chips for the OverBallsPanel |
| `GET /matches/:matchId/scorecard` | None | live batting/bowling stats from Sportsmonk |
| `GET /matches/my-past?page=N&pageSize=10` | User | paginated completed-match summaries |
| `GET /matches/:matchId/my-story?venueId=…` | User | recap payload `{ summary, toneLine, beats[] }` |

### Predictions

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /predictions/:matchId?venueId=…&round=N&status=open` | User | predictions + `userAnswer` + `aggregates: { global, venue }` |
| `POST /predictions/:predictionId/answer` | User | `{ selectedOption, boostType, venueId }` — enforces 1 boost/round, 1 all-in/innings |
| `GET /predictions/:matchId/my-predictions?venueId=…` | User | every prediction the user submitted in this match |

### Punter Card

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /punter-card/:matchId?venueId=…` | User | 10 questions + answers + `allAnswered` flag |
| `POST /punter-card/:matchId/answer` | User | `{ venueId, answers: [{ predictionId, selectedOption }] }` |
| `GET /punter-card/my/cards` | User | every card with score tally |

### Leaderboards

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /leaderboard/:matchId/:venueId/match?page=…&pageSize=…` | None | match-cumulative |
| `GET /leaderboard/:matchId/:venueId/round/:round?page=…` | None | per-round |
| `GET /leaderboard/:matchId/:venueId/extras` | None | pre_match + punter_card sub-totals |
| `GET /leaderboard/:matchId/:venueId/count` | None | `{ count }` of participants |
| `GET /global-leaderboard?scope=all\|city\|state&page=…` | User | lifetime rankings + `myRank` + location detection state |

### Rewards

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /rewards/my?matchId=…` | User | this user's reward codes |
| `POST /rewards/redeem` | Venue | `{ code: "0000"-"9999" }` → reward + player info |
| `GET /rewards/venue?matchId=…` | Venue | venue-side codes for staff dashboard |

### Weekly rewards

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /weekly-rewards/points` | User | `{ weeklyPoints, weekNumber }` |
| `GET /weekly-rewards/catalog` | User | `{ weeklyPoints, catalog[], redemptions }` |
| `POST /weekly-rewards/redeem` | User | `{ rewardKey }` |

### Rooms

| Method + Path | Auth | Notes |
|---|---|---|
| `POST /rooms` | User | `{ matchId, name, isPublic, maxPlayers }` → `{ room, shareLink, venueId }` |
| `GET /rooms/my` | User | active rooms the user is in |
| `GET /rooms/public` | User | discoverable public rooms |
| `GET /rooms/:roomId` | User | room + members |
| `POST /rooms/join` | User | `{ code }` |
| `POST /rooms/join-random` | User | `{ matchId }` — joins fullest public room |
| `POST /rooms/:roomId/leave` | User | transfers host if needed |
| `GET /rooms/:roomId/leaderboard` | User | room-scoped match leaderboard |
| `GET /rooms/:roomId/leaderboard/round/:round` | User | room round leaderboard |

### Venues

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /venues/:venueId` | None | venue config (used during join-match for geofence) |
| `GET /venues/by-slug/:slug` | None | cafe-route validation |
| `POST /venues/login` | None | venue staff login |
| `POST /venues/register` | None | venue self-signup (pending approval) |

---

## 9. Socket.IO event reference

The frontend opens a single socket connection (see `frontend/src/lib/socket.ts`) and joins per-match / per-room rooms via the events below.

### Client → Server

| Event | Payload | Purpose |
|---|---|---|
| `joinVenueMatch` | `{ venueId, matchId }` | subscribe to live updates for this match |
| `leaveVenueMatch` | `{ venueId, matchId }` | clean up on navigation away |
| `joinRoom` | `{ roomId }` | subscribe to friends-room events |
| `leaveRoom` | `{ roomId }` | |
| `joinTV` | `{ venueId, matchId }` | TV display mode (not user-facing) |

### Server → Client

**Match-wide** (broadcast to `match:{matchId}` and `venue:{venueId}:{matchId}`):

| Event | Payload | Triggers UI |
|---|---|---|
| `scoreUpdate` | `{ matchId, currentInnings, currentOver, overs, balls, runs, wickets }` | scorecard hero refresh, OverBallsPanel rerender |
| `newPrediction` | `{ matchId, type, overNumber?, round? }` | re-fetch predictions list |
| `predictionsLocked` | `{ matchId, overNumber?, type? }` | freeze cards, mark "LOCKED" |
| `predictionResolved` | `{ predictionId, matchId, correctOption, selectedOption, isCorrect }` | animate card to win/loss state |
| `predictionPulse` | `{ predictionId, matchId, ..., commentary }` | resolution + commentary line |
| `predictionVoided` | `{ predictionId, matchId, reason }` | grey-out card |
| `matchStarted` | `{ matchId }` | transition pre-match → live |
| `tossLocked` | `{ matchId }` | unlock the post-toss pre-match Qs |
| `inningsBreak` | `{ matchId, target, team1Score, team1Wickets }` | overlay banner |
| `oversReduced` | `{ matchId, totalOvers, lockedPredictions }` | recompute round mapping |
| `matchEnd` | `{ matchId, winner, playerOfMatch? }` | trigger Phase 3 transition |

**User-scoped** (broadcast to `user:{userId}`):

| Event | Payload | UI |
|---|---|---|
| `myPredictionWin` | `{ predictionId, pointsEarned, selectedOption }` | global WinPopup overlay |

**Venue-scoped** (`venue:{venueId}:{matchId}`):

| Event | Payload | UI |
|---|---|---|
| `playerCount` | `{ count }` | live player counter widget |
| `hypeEvent` | `{ type, playerName, prediction, selectedOption? }` | TV display + venue dashboard hype banner |
| `leaderboardUpdate` | `{ matchId, positions[] }` | leaderboard inline refresh |
| `roundWinner` | `{ round, winners[] }` | round-end announcement |

**Room-scoped** (`room:{roomId}`):

| Event | Payload | UI |
|---|---|---|
| `memberJoined` | `{ userId, displayName, avatarConfig, memberCount }` | room member list |
| `memberLeft` | `{ userId, displayName, memberCount }` | |
| `roomLeaderboardUpdate` | `{ matchId, positions[] }` | room leaderboard refresh |

---

## 10. Existing design tokens

Today's design language. Decide per-token whether to keep, evolve, or discard for the redesign.

### Color palette (`frontend/src/app/globals.css:5–57`)

| Token | Hex | Where used |
|---|---|---|
| Primary orange | `#ff6341` | brand, CTAs, sticky-bottom Lock-In, BottomNav active border |
| Orange dark | `#e8501e` | hover/pressed |
| Yellow | `#ffd60a` | points, rewards, premium accent |
| Blue | `#3b9eff` | streak badges, info |
| Green | `#22c55e` | correct-answer feedback, success |
| Page bg | `#0d0d0d` | global background |
| Card bg | `#1a1a1a` | cards, modals, header, BottomNav |
| Gray muted | `#6b7280` / `#9ca3af` / `#4b5563` | secondary text, borders, ghost-button outlines |

For the Punter Card redesign we introduced **per-team brand colors** (`frontend/src/lib/teamColors.ts`) — CSK mustard, KKR purple, RR magenta, etc. — driving per-match gradient backgrounds. If you keep that direction, every page that's "scoped to a match" should pull in the playing teams' colors.

### Typography (`frontend/src/app/globals.css:99–146`)

- **Bungee** (Google Fonts) — display, headings, all-caps labels. Heavy condensed cartoony sans, defines the "JAFFA voice".
- **Barlow** — body / UI text. Geometric sans, bold-friendly.

Conventions:
- All headings, buttons, navigation items: **UPPERCASE + 0.05em letter-spacing**.
- Body weight: 600 default. Buttons: 800–900.

### Component idiom — "neo-brutalist sticker"

Almost every UI primitive uses the same recipe:

- 2–3px solid border (often `#000` or `#ff6341`).
- **Offset solid box-shadow** (e.g. `4px 4px 0 0 #ff6341`) — not blurred.
- Minimal `border-radius` (3–4px) — chunky, not pill-soft (except for new glass pills introduced in the punter card redesign which use `rounded-2xl`/`rounded-3xl`).
- On `:active`: translate to "press into" the shadow → `transform: translate(4px, 4px); box-shadow: 0 0 0 0`.
- Transition `0.08s ease` — snappy.

Class examples in `globals.css`: `.game-card`, `.btn-sticker`, `.btn-game`, `.btn-secondary`, `.option-btn`, `.rank-badge`, `.live-badge`, `.info-pill`, `.nb-input`.

The Punter Card redesign moves toward a more **glassmorphism + chunky pill** look (rounded-3xl, backdrop-blur, white/12% bg, 1–2px white/25% border) which sits comfortably alongside the sticker idiom. The intent is to keep the sticker style for action elements (buttons, badges) and use glass cards for content containers.

### Motion

- Framer Motion used for page transitions (`motion.div initial/animate/exit`), card stack animations on the pre-match phase, leaderboard row reorder.
- 0.08s for state changes, 0.3s for entry animations, stagger children at 0.08–0.15s.
- `DISABLE_MOTION` env flag for accessibility / testing.

### Toast / overlay

- `sonner` toaster mounted in the root layout. Style override: orange border, black bg, 2px border, offset shadow — matches the sticker idiom.
- `WinPopup` global overlay subscribes to `myPredictionWin` socket; renders a celebration card with confetti + "+N PTS" callout.

---

## 11. Hard constraints

Things the redesign **cannot break**:

1. **Mobile-first.** All real users are on phones (iOS Safari + Android Chrome). Layouts must work at 360px width first; desktop is a secondary concern.
2. **Safe-area insets.** Header has a `pt-[env(safe-area-inset-top)]` and BottomNav has `pb-[max(0.5rem,env(safe-area-inset-bottom))]`. iPhone notches and home-indicator gestures need this.
3. **Cafe vs global routes.** Every nav link must route through `cafeUrl()` so cafe users stay in their `/cafe/<slug>/…` namespace.
4. **localStorage hydration.** GameContext restores match/venue/room from localStorage on boot. Don't break the keys (`jaffa_match_id`, `jaffa_venue_id`, etc.) or the read-with-poison-guard pattern.
5. **Socket reconnection.** The match page joins `joinVenueMatch` on mount and leaves on unmount. Page redesigns must keep this lifecycle.
6. **Idempotent prediction submit.** `POST /predictions/:id/answer` is locked once `userAnswer` exists. UI must not allow double-submit / race conditions on rapid taps.
7. **Boost / All-In counters.** The frontend tracks usage in GameContext and disables the buttons accordingly. Server also enforces; never trust the client. UI must clearly show used vs available.
8. **Resolution timing is async.** A prediction can be resolved seconds after the over ends, or minutes later if Sportsmonk lags. Cards must visually indicate "PENDING" → "+N PTS" / "MISSED" without a page reload.
9. **Match end can happen mid-screen.** If the user is mid-tap on a prediction when `matchEnd` fires, the card must lock gracefully, not crash.
10. **Offline-tolerant.** A 2–5 second connectivity blip is normal in cafes. The UI must not full-page-error on a single failed fetch.

---

## Appendix A: File map for the redesigner

Read these files, in this order, to understand the working code:

1. `frontend/src/app/layout.tsx` — root providers (GameContext, NotificationProvider, WinPopup, Toaster).
2. `frontend/src/context/GameContext.tsx` — the state model.
3. `frontend/src/lib/api.ts` — every API method the UI calls, mapped to backend routes.
4. `frontend/src/lib/socket.ts` — socket connection helpers.
5. `frontend/src/lib/navigation.ts` — `cafeUrl` / `isCafeRoute`.
6. `frontend/src/components/Header.tsx` and `BottomNav.tsx` — the shell.
7. `frontend/src/app/lobby/page.tsx` — match discovery.
8. `frontend/src/app/match/[matchId]/page.tsx` — the big one.
9. `frontend/src/app/punter-card/[matchId]/page.tsx` — the visual reference.
10. `frontend/src/app/globals.css` — current design tokens.

## Appendix B: Sample API response shapes

For the redesigner who wants to mock data without booting the backend.

### `GET /api/punter-card/:matchId`

```json
{
  "matchId": "uuid",
  "match": {
    "team1": "Lucknow Super Giants",
    "team2": "Kolkata Knight Riders",
    "team1Short": "LSG",
    "team2Short": "KKR",
    "startTime": "2026-04-26T14:00:00.000Z",
    "status": "upcoming"
  },
  "questions": [
    {
      "id": "uuid",
      "templateKey": "punter_motm",
      "question": "Player of the Match",
      "category": "punter_card",
      "round": 0,
      "options": [
        { "key": "marsh", "label": "Mitchell Marsh", "points": 35 },
        { "key": "rahane", "label": "Ajinkya Rahane", "points": 36 }
      ],
      "status": "open",
      "correctOption": null,
      "userAnswer": null
    }
  ],
  "allAnswered": false
}
```

### `GET /api/predictions/:matchId?round=2`

```json
[
  {
    "id": "uuid",
    "category": "per_over",
    "round": 2,
    "overNumber": 8,
    "question": "Runs in over 8?",
    "options": [
      { "key": "low", "label": "1-5", "points": 50 },
      { "key": "medium", "label": "6-10", "points": 50 },
      { "key": "high", "label": "11+", "points": 75 }
    ],
    "status": "open",
    "userAnswer": null,
    "aggregates": {
      "global": { "totalAnswered": 432, "correctCount": 0, "correctPct": 0 },
      "venue":  { "totalAnswered": 12, "correctCount": 0, "correctPct": 0 }
    }
  }
]
```

### `GET /api/leaderboard/:matchId/:venueId/match`

```json
{
  "leaderboard": [
    {
      "rank": 1,
      "userId": "uuid",
      "displayName": "Praneeth",
      "avatarConfig": { "...": "..." },
      "totalPoints": 540,
      "currentStreak": 3,
      "bestStreak": 7,
      "correctPredictions": 18,
      "totalPredictions": 25,
      "accuracy": 0.72
    }
  ],
  "page": 1,
  "pageSize": 25,
  "totalCount": 38,
  "totalPages": 2
}
```

### `GET /api/matches/:matchId/my-story?venueId=…`

```json
{
  "summary": {
    "right": 12,
    "wrong": 6,
    "totalPredictions": 18,
    "accuracy": 0.67,
    "totalPoints": 320,
    "rank": 4
  },
  "toneLine": "Solid night. You called the chase like a pro.",
  "beats": [
    { "type": "signature_call", "title": "Called Suryavanshi's 100", "detail": "Only 4% of players got that one", "data": { "predictionId": "..." } },
    { "type": "hot_streak", "title": "5-in-a-row in R2", "detail": "Earned a +10 streak bonus", "data": { "round": 2 } },
    { "type": "all_in_burn", "title": "All-In on the wrong wicket", "detail": "−30 pts, but you bounced back", "data": { "predictionId": "..." } }
  ]
}
```

---

*Doc generated 2026-04-26.* Refresh whenever a new page is added or a major API shape changes.
