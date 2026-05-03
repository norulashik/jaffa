"use client";

// Standalone Past Battles page (formerly the collapsible "Past Battles"
// section at the bottom of /lobby). Now reachable from the bottom nav,
// where it replaces the "Week Pts" tab. Same data shape, same row UI,
// same /match navigation behaviour as before — just lifted into its own
// route so the home dashboard stays focused.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";

type PastMatch = Awaited<ReturnType<typeof api.getMyPastMatches>>["matches"][number];

export default function PastBattlesPage() {
  const router = useRouter();
  const { dispatch } = useGame();
  const [matches, setMatches] = useState<PastMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("jaffa_token")) {
      router.replace("/login");
      return;
    }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (p: number) => {
    setLoading(true);
    try {
      const data = await api.getMyPastMatches(p, 10);
      setMatches((prev) => (p === 1 ? data.matches : [...prev, ...data.matches]));
      setHasMore(p < data.totalPages);
      setPage(p);
    } catch {
      // Empty state on failure.
    } finally {
      setLoading(false);
    }
  };

  // Hydrate context + localStorage so the destination /match page picks up
  // the right (match, venue, room) tuple synchronously — same pattern the
  // lobby used.
  const navigateToMatch = (
    pm: PastMatch,
    roomCtx: { id: string; code: string } | null,
  ) => {
    try {
      if (pm.matchId) localStorage.setItem("jaffa_match_id", pm.matchId);
      if (pm.venueId) localStorage.setItem("jaffa_venue_id", pm.venueId);
      else localStorage.removeItem("jaffa_venue_id");
      if (roomCtx) {
        localStorage.setItem("jaffa_room_id", roomCtx.id);
        localStorage.setItem("jaffa_room_code", roomCtx.code);
      } else {
        localStorage.removeItem("jaffa_room_id");
        localStorage.removeItem("jaffa_room_code");
      }
    } catch {}
    if (pm.venueId) {
      dispatch({
        type: "SET_VENUE",
        venueId: pm.venueId,
        venueName: pm.venueName || "",
      });
    }
    if (pm.matchId) {
      dispatch({ type: "SET_MATCH", matchId: pm.matchId });
    }
    if (roomCtx) {
      dispatch({ type: "SET_ROOM", roomId: roomCtx.id, roomCode: roomCtx.code });
    }
    const qs = pm.venueId ? `?venueId=${pm.venueId}` : "";
    const roomQs = roomCtx ? `${qs ? "&" : "?"}roomId=${roomCtx.id}` : "";
    router.push(`/match/${pm.matchId}${qs}${roomQs}`);
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 max-w-2xl mx-auto">
        <h2
          className="text-3xl font-bold tracking-tight mb-6 uppercase"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          PAST BATTLES
        </h2>

        {loading && matches.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-[#6b7280]" />
          </div>
        ) : matches.length === 0 ? (
          <div className="game-card flex flex-col items-center py-12 text-center">
            <Trophy size={48} className="text-[#6b7280] mb-4" />
            <h3
              className="text-xl font-bold text-white mb-2 uppercase"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              NO BATTLES YET
            </h3>
            <p className="text-sm text-[#6b7280] max-w-[260px]">
              Once you play a match, it&apos;ll show up here with your stats.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map((pm) => {
              const dt = pm.startTime ? new Date(pm.startTime) : null;
              const dateStr = dt
                ? dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                : "";
              const acc = pm.myStats.totalPredictions > 0
                ? Math.round((pm.myStats.correctPredictions / pm.myStats.totalPredictions) * 100)
                : 0;
              const rowKey = pm.matchId + ":" + pm.venueId;
              const hasRooms = !!pm.rooms && pm.rooms.length > 0;
              const isExpanded = expandedRooms.has(rowKey);

              const headerBody = (
                <>
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className="text-sm font-bold text-white uppercase"
                      style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                    >
                      {pm.team1Short || "T1"} vs {pm.team2Short || "T2"}
                    </span>
                    <span className="info-pill text-[10px]">{dateStr}</span>
                  </div>
                  {pm.venueName && (
                    <div className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2">
                      {pm.venueName}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-[#9ca3af]">
                    <span>
                      <span className="text-[#ffd60a] font-bold">{pm.myStats.totalPoints}</span> pts
                    </span>
                    <span>·</span>
                    <span>
                      {pm.myStats.correctPredictions}/{pm.myStats.totalPredictions} correct
                    </span>
                    <span>·</span>
                    <span>{acc}%</span>
                    {hasRooms ? (
                      <button
                        type="button"
                        className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#ff6341] font-bold"
                        onClick={() => {
                          setExpandedRooms((prev) => {
                            const next = new Set(prev);
                            if (next.has(rowKey)) next.delete(rowKey);
                            else next.add(rowKey);
                            return next;
                          });
                        }}
                      >
                        {pm.rooms!.length} {pm.rooms!.length === 1 ? "room" : "rooms"}
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    ) : (
                      <span className="ml-auto text-[#6b7280]">›</span>
                    )}
                  </div>
                </>
              );

              return (
                <div key={rowKey} className="space-y-1">
                  {hasRooms ? (
                    <div className="w-full game-card text-left">{headerBody}</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateToMatch(pm, null)}
                      className="w-full game-card text-left hover:border-[#ff6341] transition-colors"
                    >
                      {headerBody}
                    </button>
                  )}

                  {hasRooms && isExpanded && (
                    <div className="pl-3 space-y-1">
                      {pm.rooms!.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => navigateToMatch(pm, { id: room.id, code: room.code })}
                          className="w-full text-left px-3 py-2 rounded border border-[#333] bg-[#141414] hover:border-[#ff6341] hover:bg-[#1a1a1a] transition-colors flex items-center justify-between"
                        >
                          <div className="flex flex-col">
                            <span
                              className="text-xs font-bold text-white uppercase"
                              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                            >
                              {room.name}
                            </span>
                            <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">
                              Code {room.code}
                            </span>
                          </div>
                          <span className="text-[#ff6341] text-sm">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-center py-3">
                <Loader2 size={18} className="animate-spin text-[#6b7280]" />
              </div>
            )}
            {!loading && hasMore && (
              <button
                onClick={() => load(page + 1)}
                className="w-full btn-sticker py-2 text-xs uppercase tracking-widest font-bold"
                style={{ background: "#1a1a1a", color: "#fff", border: "2px solid #333" }}
              >
                Load more
              </button>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
