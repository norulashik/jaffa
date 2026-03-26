# JAFFA — Feature Fixes & Changes Guide

Feed this file to Claude Code working on the same JAFFA project (different version) to apply all fixes.

---

## Files Modified

| File | Type |
|------|------|
| `backend/src/models/MatchParticipant.ts` | Backend Model |
| `backend/src/services/predictionEngine.ts` | Backend Service |
| `backend/src/services/sportsmonkApi.ts` | Backend Service |
| `backend/src/routes/admin.ts` | Backend Route |
| `frontend/src/components/Leaderboard.tsx` | Frontend Component |
| `frontend/src/app/page.tsx` | Frontend Page |

---

## 1. Pre-Match Points Storage (`round0Points`)

**Problem:** Pre-match prediction points (round 0) had no dedicated column — they were added to `totalPoints` but never tracked per-round, so the leaderboard couldn't show pre-match standings separately.

**Fix:** Add `round0Points` field to MatchParticipant model.

**File:** `backend/src/models/MatchParticipant.ts`

Add `round0Points` everywhere `round1Points` through `round6Points` exist:

```typescript
// In the interface:
interface MatchParticipantAttributes {
  // ... existing fields ...
  totalPoints: number;
  round0Points: number;  // ADD THIS
  round1Points: number;
  // ...
}

// In the Optional creation attributes:
interface MatchParticipantCreationAttributes extends Optional<MatchParticipantAttributes,
  "id" | "totalPoints" | "round0Points" | "round1Points" | "round2Points" | ...> {}
//                        ^^^^^^^^^^^^^^ ADD THIS

// In the class:
class MatchParticipant extends Model<...> {
  public round0Points!: number;  // ADD THIS
  // ...
}

// In the .init() column definitions:
round0Points: { type: DataTypes.INTEGER, defaultValue: 0 },  // ADD THIS

// In the indexes array:
{ fields: ["matchId", "venueId", "round0Points"] },  // ADD THIS
```

---

## 2. Remove MOTM (Man of the Match) Question

**Problem:** Sportsmonk free trial doesn't provide player names, so MOTM question can't be resolved.

**Fix:** Remove the MOTM question from `generatePreMatchPredictions()` entirely. The function should return **4 questions** (not 5):

**File:** `backend/src/services/predictionEngine.ts`

The 4 pre-match questions should be:
1. **Who wins tonight?** — team picker
2. **Toss + decision** — 4 options (team1_bat, team1_field, team2_bat, team2_field)
3. **Which team hits more sixes?** — team picker
4. **First wicket — how does it fall?** — caught/bowled/lbw/run_out/stumped

Remove any question about "Match hero" / "Man of the Match" / "Pick your match hero" that references player names.

Also remove any MOTM resolution logic from `sportsmonkApi.ts` — specifically any block in `resolvePreMatchPrediction()` that fetches player data or matches MOTM.

---

## 3. Toss Question Locks 2 Min Before Toss (32 Min Before Match)

**Problem:** Toss question stayed open until match start, but toss happens ~30 min before. Users could see the toss result and still answer.

**Fix:** Add `expiresAt` to the toss question and accept `matchStartTime` parameter.

**File:** `backend/src/services/predictionEngine.ts`

```typescript
export function generatePreMatchPredictions(
  matchId: string,
  team1: string, team2: string,
  team1Short: string, team2Short: string,
  team1Players: string[], team2Players: string[],
  matchStartTime?: Date  // ADD THIS PARAMETER
): Array<{
  matchId: string;
  category: string;
  round: number;
  question: string;
  options: { key: string; label: string; points: number; image?: string; team?: string; color?: string }[];
  expiresAt?: Date;  // ADD THIS TO RETURN TYPE
}> {
```

For the toss question specifically, add the expiry:

```typescript
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
  // Toss is ~30 min before match, lock 2 min before toss = 32 min before match
  ...(matchStartTime ? { expiresAt: new Date(matchStartTime.getTime() - 32 * 60 * 1000) } : {}),
},
```

**File:** `backend/src/routes/admin.ts`

Pass `match.startTime` to `generatePreMatchPredictions()` in both the manual match creation endpoint AND the Sportsmonk import endpoint:

```typescript
// In POST /match:
const preMatchQuestions = generatePreMatchPredictions(
  match.id, team1, team2, team1Short, team2Short,
  team1Players || [], team2Players || [],
  match.startTime  // ADD THIS
);

// In POST /cricket/import/:fixtureId:
const preMatchQuestions = generatePreMatchPredictions(
  match.id, match.team1, match.team2,
  match.team1Short, match.team2Short,
  match.team1Players, match.team2Players,
  match.startTime  // ADD THIS
);
```

---

## 4. Instant Toss Resolution

**Problem:** Toss prediction waited until match end to resolve, even though the answer is known immediately.

**Fix:** In the Sportsmonk polling function, when auto-starting a match (toss detected), resolve the toss prediction immediately.

**File:** `backend/src/services/sportsmonkApi.ts`

Inside the `match.status === "upcoming"` block, after updating match to "live", add:

```typescript
// === Resolve toss prediction immediately ===
if (hasToss && fixture.toss_won_team_id && fixture.elected) {
  const tossPreds = await Prediction.findAll({
    where: { matchId: match.id, category: "pre_match", status: "open" },
  });
  for (const pred of tossPreds) {
    if (pred.question.toLowerCase().includes("toss")) {
      let tossWinnerShort: string | null = null;
      if (fixture.toss_won_team_id === fixture.localteam_id) {
        tossWinnerShort = match.team1Short;
      } else if (fixture.toss_won_team_id === fixture.visitorteam_id) {
        tossWinnerShort = match.team2Short;
      }
      if (tossWinnerShort) {
        const decision = fixture.elected === "batting" ? "bat" : "field";
        const correctOption = `${tossWinnerShort.toLowerCase()}_${decision}`;
        await resolvePrediction(pred, correctOption, io);
        console.log(`[Sportsmonk] Toss resolved immediately: ${correctOption}`);
      }
    }
  }
}
```

---

## 5. Pre-Match Questions Lock at 1st Ball

**Problem:** Pre-match questions stayed open even after the match started.

**Fix:** When the 1st ball of the match is detected (over 1, innings 1), lock all remaining open pre-match predictions.

**File:** `backend/src/services/sportsmonkApi.ts`

Inside the ball-detection block (where `ballBowled` is true), add:

```typescript
// Lock remaining pre-match questions when 1st ball of the match is bowled
if (currentOver === 1 && currentInnings === 1) {
  const openPreMatch = await Prediction.findAll({
    where: { matchId: match.id, category: "pre_match", status: "open" },
  });
  if (openPreMatch.length > 0) {
    for (const pred of openPreMatch) {
      if (pred.status === "open") {
        await pred.update({ status: "locked" });
      }
    }
    io.emit("predictionsLocked", { matchId: match.id, type: "pre_match" });
    console.log(`[Sportsmonk] Locked ${openPreMatch.length} pre-match predictions (1st ball bowled)`);
  }
}
```

---

## 6. Over 1 Questions Available 5 Min Before Match

**Problem:** Over 1 predictions only appeared when the match started, giving users no time to answer.

**Fix:** For upcoming matches, generate Over 1 predictions 5 minutes before `startTime`.

**File:** `backend/src/services/sportsmonkApi.ts`

In the `match.status === "upcoming"` block, in the `else` branch (when match hasn't started yet), add:

```typescript
// Check if we should generate Over 1 predictions early (5 min before match)
const now = new Date();
const fiveMinBefore = new Date(match.startTime.getTime() - 5 * 60 * 1000);
if (now >= fiveMinBefore) {
  const existingOver1 = await Prediction.findAll({
    where: { matchId: match.id, overNumber: 1, round: 1, category: "per_over" },
  });
  if (existingOver1.length === 0) {
    const over1Preds = generatePerOverPredictions(match.id, 1, 1, "");
    for (const p of over1Preds) {
      await Prediction.create(p as any);
    }
    io.emit("newPrediction", { matchId: match.id, type: "per_over", overNumber: 1, round: 1 });
    console.log(`[Sportsmonk] Over 1 predictions generated early (5 min before match)`);
  }
}
```

---

## 7. First Wicket Instant Resolution

**Problem:** "First wicket — how does it fall?" waited until match end to resolve, even though the answer is known as soon as the first wicket falls.

**Fix:** On every over completion (in the over-completion logic), check if a wicket has fallen and resolve immediately.

**File:** `backend/src/services/sportsmonkApi.ts`

Inside the over-completion block (after fetching ball-by-ball data), add:

```typescript
// === Resolve "first wicket" pre-match prediction if a wicket has fallen ===
const firstWicketPred = await Prediction.findOne({
  where: { matchId: match.id, category: "pre_match", status: "locked" },
});
if (firstWicketPred && firstWicketPred.question.toLowerCase().includes("first wicket")) {
  const wicketBall = balls.find((b: BallData) => b.score?.is_wicket || b.score?.out || b.batsmanout_id);
  if (wicketBall) {
    const dismissalName = (wicketBall.score?.name || "").toLowerCase();
    let correctOption: string | null = null;
    if (dismissalName.includes("run out")) correctOption = "run_out";
    else if (dismissalName.includes("stumped") || dismissalName.includes("stumping")) correctOption = "stumped";
    else if (dismissalName.includes("lbw") || dismissalName.includes("leg before")) correctOption = "lbw";
    else if (dismissalName.includes("bowled")) correctOption = "bowled";
    else if (dismissalName.includes("caught")) correctOption = "caught";
    else correctOption = "caught"; // default
    await resolvePrediction(firstWicketPred, correctOption, io);
    console.log(`[Sportsmonk] First wicket resolved immediately: ${correctOption}`);
  }
}
```

---

## 8. Hot Take Resolution at Phase Boundaries

**Problem:** Hot take questions were never resolved during the match — they only got resolved (if at all) at match end.

**Fix:** Add a `resolveHotTakeAtPhaseEnd()` function and call it when a round changes.

**File:** `backend/src/services/sportsmonkApi.ts`

Add this new function:

```typescript
function resolveHotTakeAtPhaseEnd(
  prediction: Prediction,
  round: number,
  balls: BallData[],
  runs: any[],
  inningsStr: string
): string | null {
  const q = prediction.question.toLowerCase();

  // Round 1: "More runs in the powerplay — first 3 overs or last 3?"
  if (round === 1 && q.includes("first 3")) {
    let first3 = 0, last3 = 0;
    for (const b of balls) {
      if (b.scoreboard !== "S1") continue;
      const overIdx = Math.floor(b.ball);
      if (overIdx < 3) first3 += b.score?.runs || 0;
      else if (overIdx < 6) last3 += b.score?.runs || 0;
    }
    return first3 >= last3 ? "first_3" : "last_3";
  }

  // Round 2: "Highest partnership this innings — how big will it be?"
  if (round === 2 && q.includes("highest partnership")) {
    let highestPartnership = 0;
    let currentPartnership = 0;
    for (const b of balls) {
      if (b.scoreboard !== "S1") continue;
      currentPartnership += b.score?.runs || 0;
      if (b.score?.is_wicket || b.batsmanout_id) {
        highestPartnership = Math.max(highestPartnership, currentPartnership);
        currentPartnership = 0;
      }
    }
    highestPartnership = Math.max(highestPartnership, currentPartnership);
    if (highestPartnership < 30) return "under_30";
    if (highestPartnership <= 50) return "30_50";
    if (highestPartnership <= 75) return "50_75";
    return "75_plus";
  }

  // Round 5: "How many wickets fall in the chase by over 15?"
  if (round === 5 && q.includes("wickets fall in the chase")) {
    const inn2Balls = balls.filter((b: BallData) => b.scoreboard === "S2" && b.ball < 15);
    let wkts = 0;
    for (const b of inn2Balls) {
      if (b.score?.is_wicket || b.batsmanout_id) wkts++;
    }
    if (wkts <= 2) return "0_2";
    if (wkts <= 4) return "3_4";
    if (wkts <= 6) return "5_6";
    return "7_plus";
  }

  return null;
}
```

Then in the round-change block (where `newRound !== prevRound`), call it:

```typescript
// === Resolve hot take for the ending round at phase boundary ===
const endingHotTakes = await Prediction.findAll({
  where: { matchId: match.id, category: "hot_take", status: "open", round: prevRound },
});
for (const pred of endingHotTakes) {
  const hotTakeAnswer = resolveHotTakeAtPhaseEnd(pred, prevRound, balls, runs, prevInningsStr);
  if (hotTakeAnswer) {
    await resolvePrediction(pred, hotTakeAnswer, io);
    console.log(`[Sportsmonk] Hot take resolved at phase end (round ${prevRound}): "${pred.question}" → ${hotTakeAnswer}`);
  }
}
```

---

## 9. Phase-Specific Leaderboard with Previous Phase Navigation

**Problem:** Once a new phase started, users couldn't see previous phase leaderboards. There was only a "Round" vs "Match" toggle.

**Fix:** Replace the 2-button toggle with horizontally scrollable phase tabs showing all rounds up to current.

**File:** `frontend/src/components/Leaderboard.tsx`

Full replacement — the component should have:

```typescript
const PHASE_NAMES: Record<number, string> = {
  1: "Powerplay",
  2: "Middle Overs",
  3: "Death Overs",
  4: "Powerplay",
  5: "Middle Overs",
  6: "Death Overs",
};

const PHASE_INNINGS: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2,
};
```

State:
- `selectedRound` (defaults to `currentRound`, auto-updates via `useEffect` when `currentRound` changes)
- `view`: "round" | "match"

UI: A horizontally scrollable row of pill buttons:
- One button per round from 1 to `currentRound`, labeled like `"Powerplay · Inn 1"`, `"Middle Overs · Inn 2"` etc.
- Current round has a pulsing dot indicator
- Active tab highlighted in `#00FFAB` with black text
- Final button is "Overall" (switches to match leaderboard view)
- Auto-scrolls active tab into view using `scrollIntoView`

```tsx
// Tab rendering:
{rounds.map((round) => {
  const isActive = view === "round" && selectedRound === round;
  return (
    <button
      key={round}
      data-active={isActive}
      onClick={() => { setSelectedRound(round); setView("round"); }}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
        isActive
          ? "bg-[#00FFAB] text-black"
          : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
      }`}
    >
      {PHASE_NAMES[round]} · Inn {PHASE_INNINGS[round]}
      {round === currentRound && (
        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse" />
      )}
    </button>
  );
})}
```

Scroll container styles:
```tsx
<div
  ref={tabsRef}
  className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4"
  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
>
```

Auto-scroll effect:
```typescript
useEffect(() => {
  if (tabsRef.current) {
    const activeTab = tabsRef.current.querySelector("[data-active='true']");
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }
}, [selectedRound, view]);
```

---

## 10. Suspense Boundary for `useSearchParams()` (Next.js 16)

**Problem:** `next build` fails with "useSearchParams() should be wrapped in a suspense boundary" on the home page.

**Fix:** Split the page component into an inner component and wrap with `<Suspense>`.

**File:** `frontend/src/app/page.tsx`

```tsx
"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SplashScreenInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ... all existing component logic and JSX ...
}

export default function SplashScreen() {
  return (
    <Suspense>
      <SplashScreenInner />
    </Suspense>
  );
}
```

---

## 11. Deduplication Guards in Sportsmonk Polling

**Problem:** Sportsmonk polling could generate duplicate Over 1 predictions, hot takes, and rivalry calls if polled multiple times during transitions.

**Fix:** Before generating any prediction, check if it already exists.

**File:** `backend/src/services/sportsmonkApi.ts`

Pattern used everywhere:

```typescript
// Before generating Over 1 predictions:
const existingOver1 = await Prediction.findAll({
  where: { matchId: match.id, overNumber: 1, round: 1, category: "per_over" },
});
if (existingOver1.length === 0) {
  // ... generate predictions
}

// Before generating hot takes:
const existingHotTake = await Prediction.findOne({
  where: { matchId: match.id, category: "hot_take", round: nextRound },
});
if (!existingHotTake) {
  // ... generate hot take
}

// Before generating rivalry calls:
const existingRivalryCalls = await Prediction.findAll({
  where: { matchId: match.id, category: "rivalry_call" },
});
if (existingRivalryCalls.length === 0) {
  // ... generate rivalry calls
}

// Before generating per-over predictions (2 ahead):
const existingPreds = await Prediction.findAll({
  where: { matchId: match.id, overNumber: twoAhead, round: twoAheadRound, category: "per_over" },
});
if (existingPreds.length === 0) {
  // ... generate predictions
}
```

---

## 12. End-of-Match Resolution for All Prediction Types

**Problem:** When a match ends, only pre-match predictions were resolved. Hot takes, rivalry calls, and remaining per-over predictions were left unresolved.

**Fix:** At match end (when `fixture.status === "Finished"`), resolve ALL open predictions.

**File:** `backend/src/services/sportsmonkApi.ts`

Add a `resolveEndOfMatchPrediction()` function that handles:
- "Total first innings score" → low/par/high/massive based on score
- "Will the match go to the last over?" → yes if overs >= 19
- "How many wickets fall in the chase by over 15?" → count from ball data
- "More runs in the powerplay — first 3 or last 3?" → sum from ball data
- "Biggest over in the death" → max over runs from overs 16-20
- "Chase done in which phase?" → based on when target was chased
- Remaining per-over predictions → use `resolveOverPredictionFromStats()`

Call it at match end:

```typescript
// Resolve any open hot_take and rivalry_call predictions
const otherOpenPreds = await Prediction.findAll({
  where: { matchId: match.id, category: ["hot_take", "rivalry_call"], status: "open" },
});
for (const pred of otherOpenPreds) {
  const correctOption = resolveEndOfMatchPrediction(pred, fixture, match, runs, allBalls);
  if (correctOption) {
    await resolvePrediction(pred, correctOption, io);
  }
}

// Resolve remaining open per-over predictions (last over)
const openOverPreds = await Prediction.findAll({
  where: { matchId: match.id, category: "per_over", status: "open" },
});
for (const pred of openOverPreds) {
  const overNum = pred.overNumber || 0;
  if (overNum > 0) {
    const innings = pred.round <= 3 ? "S1" : "S2";
    const overStats = computeOverStats(allBalls, overNum, innings);
    const correctOption = resolveOverPredictionFromStats(pred, overStats);
    if (correctOption) {
      await resolvePrediction(pred, correctOption, io);
    }
  }
}
```

---

## Summary of All Changes

| # | Feature | Files |
|---|---------|-------|
| 1 | `round0Points` column for pre-match points | `MatchParticipant.ts` |
| 2 | Remove MOTM question (no player names on free tier) | `predictionEngine.ts`, `sportsmonkApi.ts` |
| 3 | Toss question locks 32 min before match | `predictionEngine.ts`, `admin.ts` |
| 4 | Instant toss resolution when toss detected | `sportsmonkApi.ts` |
| 5 | Pre-match questions lock at 1st ball | `sportsmonkApi.ts` |
| 6 | Over 1 available 5 min before match | `sportsmonkApi.ts` |
| 7 | First wicket instant resolution | `sportsmonkApi.ts` |
| 8 | Hot take resolution at phase boundaries | `sportsmonkApi.ts` |
| 9 | Phase-specific leaderboard with previous phase tabs | `Leaderboard.tsx` |
| 10 | Suspense boundary fix for Next.js 16 build | `page.tsx` |
| 11 | Deduplication guards in polling | `sportsmonkApi.ts` |
| 12 | End-of-match resolution for all prediction types | `sportsmonkApi.ts` |
