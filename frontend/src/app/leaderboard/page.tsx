"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import Leaderboard from "@/components/Leaderboard";
import RoomLeaderboard from "@/components/RoomLeaderboard";
import { Trophy } from "lucide-react";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";

// Mirrors backend predictionEngine.getCurrentRound. Used as a client-side
// fallback so the Ranks page can populate context.currentRound even when
// the user lands here before opening the match page.
function deriveRound(currentInnings: number, currentOver: number, totalOvers: number = 20): number {
  if (!currentInnings || currentInnings === 0) return 0;
  const overs = totalOvers || 20;
  let ppEnd = Math.min(6, overs);
  let midEnd = Math.ceil(overs * 0.75);
  if (overs <= 3) { ppEnd = 1; midEnd = 2; }
  else if (ppEnd >= midEnd) { midEnd = ppEnd + 1; }
  if (currentInnings === 1) {
    if (currentOver <= ppEnd) return 1;
    if (currentOver <= midEnd) return 2;
    return 3;
  }
  if (currentOver <= ppEnd) return 4;
  if (currentOver <= midEnd) return 5;
  return 6;
}

function LeaderboardPageInner() {
  const { state, dispatch } = useGame();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolution order for matchId / venueId:
  //   1. URL query (?matchId=&venueId=) — forwarded by BottomNav when
  //      the user taps Ranks from a match page. Most authoritative because
  //      it's set at click time, immune to state-hydration races.
  //   2. GameContext state — set by the match page on mount.
  //   3. localStorage — fallback for hydration / hard reloads.
  // Treat the strings "null"/"undefined" as missing for the LS path —
  // legacy poison from old past-battle nav code.
  const readLs = (k: string) => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(k);
    return !v || v === "null" || v === "undefined" ? null : v;
  };
  const urlMatchId = searchParams?.get("matchId") || null;
  const urlVenueId = searchParams?.get("venueId") || null;

  const [matchId, setMatchId] = useState(urlMatchId || state.matchId || readLs("jaffa_match_id"));
  const [venueId, setVenueId] = useState(urlVenueId || state.venueId || readLs("jaffa_venue_id"));
  const [roomId, setRoomId] = useState(state.roomId);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }
    // Re-derive from the same priority order on every state change so
    // changes to GameContext (e.g. user joins a different match in
    // another tab and the context broadcasts) flow through.
    const next = urlMatchId || state.matchId || readLs("jaffa_match_id");
    const nextV = urlVenueId || state.venueId || readLs("jaffa_venue_id");
    if (next && next !== matchId) setMatchId(next);
    if (nextV && nextV !== venueId) setVenueId(nextV);
    if (!roomId) setRoomId(readLs("jaffa_room_id"));
  }, [state.matchId, state.venueId, state.roomId, urlMatchId, urlVenueId, matchId, venueId, roomId, router]);

  // Pull match state when this page is the user's first stop, so context's
  // currentRound is set before <Leaderboard> mounts. Without this, the round
  // pills would default to R1 even mid-match, until the user visits the
  // match page. We take max(server, derived) so a stale backend round still
  // leads to the correct UI.
  useEffect(() => {
    if (!matchId || !venueId) return;
    let cancelled = false;
    api.getMatchState(matchId, venueId).then((ms: any) => {
      if (cancelled || !ms?.participant) return;
      const liveInn = ms.match?.currentInnings || ms.match?.scoreData?.currentInnings || 1;
      const liveOver = ms.match?.currentOver || ms.match?.scoreData?.currentOver || 0;
      const totalOvers = ms.match?.totalOvers || 20;
      const derived = deriveRound(liveInn, liveOver, totalOvers);
      const server = Number(ms.participant.currentRound) || 1;
      const effective = Math.max(server, derived);
      // Only push UP — the Leaderboard sync is also monotonic, but mirroring
      // the rule here keeps the context honest if multiple pages disagree.
      if (effective > (state.currentRound || 0)) {
        dispatch({
          type: "UPDATE_PARTICIPANT",
          data: {
            currentRound: effective,
            totalPoints: ms.participant.totalPoints || 0,
            currentStreak: ms.participant.currentStreak || 0,
            boostsUsedThisRound: ms.participant.boostsUsedRound || 0,
            boostsUsedRound: ms.participant.boostsUsedRound || 0,
            allInUsed: Boolean(ms.participant.allInUsed),
            allInUsedInnings1: Boolean(ms.participant.allInUsedInnings1),
            allInUsedInnings2: Boolean(ms.participant.allInUsedInnings2),
          },
        });
      }
    }).catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [matchId, venueId, state.currentRound, dispatch]);

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen">
      <Header />

      <main className="pt-24 pb-32">
        <section className="px-6 mb-4">
          <h2
            className="text-4xl font-extrabold tracking-tight uppercase"
            style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}
          >
            RANKS
          </h2>
        </section>

        {matchId && roomId ? (
          <RoomLeaderboard roomId={roomId} />
        ) : matchId && venueId ? (
          <Leaderboard
            matchId={matchId}
            venueId={venueId}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="game-card flex flex-col items-center py-10">
              <Trophy size={48} className="text-[#6b7280] mb-4" />
              <h3
                className="text-xl font-bold text-white mb-2 uppercase"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                NO ACTIVE MATCH
              </h3>
              <p className="text-sm text-[#6b7280] max-w-[240px]">
                Join a match to see the leaderboard!
              </p>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

// Suspense wrapper required because LeaderboardPageInner reads
// useSearchParams (Next 16 errors during build otherwise). Fallback
// mirrors the page's idle background so there's no visible flash.
export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div className="bg-[#0d0d0d] text-white min-h-screen" />}>
      <LeaderboardPageInner />
    </Suspense>
  );
}
