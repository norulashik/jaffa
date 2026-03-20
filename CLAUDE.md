# JAFFA - IPL Match Prediction Game for Cafes & Sports Bars

## Overview
A web-based prediction game where people watching IPL matches at cafes/sports bars can predict match outcomes, earn points, and win rewards/discounts from the venue.

## Tech Stack
- **Frontend:** Next.js + Tailwind CSS (PWA)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Real-time:** Socket.IO
- **Auth:** Phone OTP (MSG91/Twilio)
- **Cricket Data:** Free API (test) → Sportsmonk (production)
- **Hosting:** AWS Amplify (frontend) + AWS EC2 (backend + DB)

## Core Concepts

### Entry Flow
- QR code at venue → Web app (PWA) → Phone OTP → Geofencing (150-200m)
- No app download required
- Session persists 24hrs, no re-login during match, silent token refresh

### Prediction Types
1. **Pre-match (7 questions, card swipe flow):**
   - Q1: Pick your match hero (player faces)
   - Q2: First ball outcome (dot/runs/boundary/wicket)
   - Q3: Match winner + margin (close/comfortable/blowout)
   - Q4: Powerplay vibe (snooze/steady/aggressive/massacre)
   - Q5: Toss + decision (combined)
   - Q6: Will we see a century? (Yes/No)
   - Q7: Wildcard (hat-trick / 100 off 50 balls / super over)

2. **Per-over (2 questions from rotating pool of 10):**
   - Runs this over (1-5 / 6-10 / 11+)
   - Wicket this over? (Yes/No)
   - Six this over? (Yes/No)
   - Boundary off first ball? (Yes/No)
   - Dot balls (0-2 / 3-4 / 5+)
   - Wide or no-ball? (Yes/No)
   - Will [batter] score 10+? (Yes/No)
   - More than 2 boundaries? (Yes/No)
   - Maiden over? (Yes/No)
   - Runs off last ball (0 / 1-2 / 3+)
   - No question repeats within 3 overs

3. **Hot Takes (per round start):** Debatable, opinion-based questions
4. **Bold Calls (pre-match + innings break):** High risk, high reward
5. **Rivalry Calls (2nd innings only):** Chase-specific predictions

### Match Structure - 4 Rounds
- Round 1: Pre-match + Powerplay (Overs 1-6)
- Round 2: Middle overs (7-15)
- Round 3: Death overs (16-20) + Innings break
- Round 4: 2nd innings

### Points System
- Scaled by difficulty (10-100 points)
- 2 Boosts per round (2x multiplier)
- Streak bonus at 3 correct (2x on next prediction)
- 1 All-In per match (3x multiplier, jump 5-8 spots)
- No negative points ever

### Dual Leaderboard
- **Round Leaderboard:** Resets each phase, top 3 win round rewards
- **Match Leaderboard:** Cumulative, top 3 win grand prize

### Reward Redemption
- Winners get a 4-digit code
- Valid until end of next round
- One-use, staff verifies via dashboard
- Late joiners only see unresolved pre-match questions

### Venue Admin
- Configure rewards before match (templates or custom)
- Dashboard: engagement stats, verify redemption codes, see leaderboard
- QR code/standee generation (PDF download)
- Set-and-forget: matches auto-trigger from IPL schedule

### TV Display (separate URL for venue's additional screen)
- 60% of time: Live Round Leaderboard (top 10, position arrows, streak icons)
- Prediction Pulse: Punchy one-liners like a commentator, not stats
- Hype Moments: All-In alerts, streak alerts, lead changes
- Round Winner Announcement: Dramatic reveal, reward info
- Match Leaderboard: Shown every 5-6 overs

### Prediction Pulse Style
- Short, punchy, one-line commentary
- Funny, relatable to youth
- Examples: "Only 3 of you called that wicket. Respect." / "Too easy. No points for being basic."

## v1 Scope (Pilot)
- QR → OTP → Join match
- Pre-match 7 questions (card swipe)
- Per-over 2 predictions from rotating pool
- 4 rounds with dual leaderboard
- Points with boosts, streaks, All-In
- Reward code generation + staff redemption
- Venue admin dashboard
- TV display (leaderboard + pulse + hype + round winners)
- Session persistence

## v2 (Post-pilot)
- SMS reminders before matches
- Group/friends play
- Season leaderboard
- Venue analytics deep-dive
- Social features (trash talk, reactions)
