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

  const readLs = (k: string) => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(k);
    return !v || v === "null" || v === "undefined" ? null : v;
  };

  const urlMatchId = searchParams?.get("matchId") || null;
  const urlVenueId = searchParams?.get("venueId") || null;

  const [matchId, setMatchId] = useState(urlMatchId || state.matchId || readLs("jaffa_match_id"));
  const [venueId, setVenueId] = useState(urlVenueId || state.venueId || readLs("jaffa_venue_id"));
  const [roomId, setRoomId] = useState(state.roomId || readLs("jaffa_room_id"));
  const [seasonRooms, setSeasonRooms] = useState<any[]>([]);
  const [selectedSeasonRoomId, setSelectedSeasonRoomId] = useState<string | null>(null);
  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(null);
  const [resolvedRoomIsSeason, setResolvedRoomIsSeason] = useState(false);
  const [hasValidMatchContext, setHasValidMatchContext] = useState(false);
  const [contextResolved, setContextResolved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }
    const nextMatchId = urlMatchId || state.matchId || readLs("jaffa_match_id");
    const nextVenueId = urlVenueId || state.venueId || readLs("jaffa_venue_id");
    const nextRoomId = state.roomId || readLs("jaffa_room_id");
    setMatchId((prev) => (prev === nextMatchId ? prev : nextMatchId));
    setVenueId((prev) => (prev === nextVenueId ? prev : nextVenueId));
    setRoomId((prev) => (prev === nextRoomId ? prev : nextRoomId));
  }, [state.matchId, state.venueId, state.roomId, urlMatchId, urlVenueId, router]);

  useEffect(() => {
    let cancelled = false;

    const resolveLeaderboardContext = async () => {
      setContextResolved(false);

      let validatedRoomId: string | null = null;
      let validatedRoomIsSeason = false;
      if (roomId) {
        try {
          const roomResult = await api.getRoom(roomId);
          if (cancelled) return;
          if (roomResult?.room?.id) {
            validatedRoomId = roomId;
            validatedRoomIsSeason = Boolean(roomResult.room.isSeasonRoom);
          }
        } catch {
          validatedRoomId = null;
          validatedRoomIsSeason = false;
        }
      }

      if (matchId && venueId) {
        try {
          const matchState: any = await api.getMatchState(matchId, venueId, validatedRoomId);
          if (cancelled) return;
          // Only treat the match context as valid for showing Round /
          // Full-Match tabs when the match is actually LIVE. If it's
          // "completed" or "upcoming", a stale matchId in localStorage
          // (from a previous match the user watched) would otherwise
          // resurface those tabs with old data. Fall through to the
          // season-leaderboard path below for all non-live cases.
          if (matchState?.match && matchState.match.status === "live") {
            setHasValidMatchContext(true);
            setResolvedRoomId(validatedRoomId);
            setResolvedRoomIsSeason(validatedRoomIsSeason);

            if (matchState.participant) {
              const liveInn = matchState.match?.currentInnings || matchState.match?.scoreData?.currentInnings || 1;
              const liveOver = matchState.match?.currentOver || matchState.match?.scoreData?.currentOver || 0;
              const totalOvers = matchState.match?.totalOvers || 20;
              const derived = deriveRound(liveInn, liveOver, totalOvers);
              const server = Number(matchState.participant.currentRound) || 1;
              const effective = Math.max(server, derived);
              if (effective > (state.currentRound || 0)) {
                dispatch({
                  type: "UPDATE_PARTICIPANT",
                  data: {
                    currentRound: effective,
                    totalPoints: matchState.participant.totalPoints || 0,
                    currentStreak: matchState.participant.currentStreak || 0,
                    boostsUsedThisRound: matchState.participant.boostsUsedRound || 0,
                    boostsUsedRound: matchState.participant.boostsUsedRound || 0,
                    allInUsed: Boolean(matchState.participant.allInUsed),
                    allInUsedInnings1: Boolean(matchState.participant.allInUsedInnings1),
                    allInUsedInnings2: Boolean(matchState.participant.allInUsedInnings2),
                  },
                });
              }
            }

            setContextResolved(true);
            return;
          }
        } catch {
          // Fall through to season-room fallback.
        }
      }

      setHasValidMatchContext(false);
      setResolvedRoomId(validatedRoomId);
      setResolvedRoomIsSeason(validatedRoomIsSeason);

      try {
        const result = await api.getMyRooms();
        if (cancelled) return;
        const joinedSeasonRooms = (result.rooms || []).filter((room: any) => room.isSeasonRoom);
        setSeasonRooms(joinedSeasonRooms);
        const preferredSeasonRoomId =
          validatedRoomId && joinedSeasonRooms.some((room: any) => room.id === validatedRoomId)
            ? validatedRoomId
            : joinedSeasonRooms[0]?.id || null;
        setSelectedSeasonRoomId(preferredSeasonRoomId);
      } catch {
        if (!cancelled) {
          setSeasonRooms([]);
          setSelectedSeasonRoomId(null);
        }
      } finally {
        if (!cancelled) setContextResolved(true);
      }
    };

    resolveLeaderboardContext();
    return () => { cancelled = true; };
  }, [matchId, venueId, roomId, state.currentRound, dispatch]);

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

        {!contextResolved ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="game-card flex flex-col items-center py-10">
              <Trophy size={48} className="text-[#6b7280] mb-4 animate-pulse" />
              <p className="text-sm text-[#6b7280] max-w-[240px]">
                Loading leaderboard...
              </p>
            </div>
          </div>
        ) : hasValidMatchContext && matchId && resolvedRoomId ? (
          <RoomLeaderboard roomId={resolvedRoomId} isSeasonRoom={resolvedRoomIsSeason} />
        ) : hasValidMatchContext && matchId && venueId ? (
          <Leaderboard matchId={matchId} venueId={venueId} />
        ) : selectedSeasonRoomId ? (
          <section className="px-6 space-y-4">
            <div className="game-card">
              <label className="text-[10px] text-[#6b7280] font-bold uppercase tracking-wider block mb-2">
                Season Rooms
              </label>
              <select
                value={selectedSeasonRoomId}
                onChange={(e) => setSelectedSeasonRoomId(e.target.value)}
                className="nb-input w-full text-sm py-3"
              >
                {seasonRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            <RoomLeaderboard roomId={selectedSeasonRoomId} isSeasonRoom />
          </section>
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

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div className="bg-[#0d0d0d] text-white min-h-screen" />}>
      <LeaderboardPageInner />
    </Suspense>
  );
}
