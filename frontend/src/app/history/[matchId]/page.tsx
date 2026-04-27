"use client";

/**
 * Past-match detail page. Screenshot-friendly layout so the user can send it
 * to customer support when something about points / ranks / rewards looks off.
 *
 * Sections:
 *   1. Match header — teams, date, final score, winner.
 *   2. My stats — total points, rank, correct/total, best streak.
 *   3. Rewards I won in this match (4-digit code, position, status).
 *   4. Full leaderboard — my row highlighted, paginated.
 *
 * All data comes from existing endpoints:
 *   - api.getMatch(matchId)
 *   - api.getMatchLeaderboard(matchId, venueId, page, pageSize)  [paginated]
 *   - api.getMyRewards(matchId)
 *   - api.getMatchState(matchId, venueId)  (for my participant row)
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";
import { ArrowLeft, Trophy, Gift, Target } from "lucide-react";

type Reward = {
  id: string;
  code: string;
  rewardText: string;
  position: number;
  round: number;
  status: "active" | "redeemed" | "expired";
  redeemedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

function MatchHistoryPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const matchId = String(params?.matchId || "");
  const venueId = search?.get("venueId") || "";

  const [match, setMatch] = useState<any | null>(null);
  const [myParticipant, setMyParticipant] = useState<any | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;
    if (!token) { router.replace("/login"); return; }
    const stored = typeof window !== "undefined" ? localStorage.getItem("jaffa_user") : null;
    if (stored) {
      try { setMyUserId(JSON.parse(stored).id || null); } catch { /* noop */ }
    }
  }, [router]);

  // Initial load: match + state + rewards + leaderboard p1.
  useEffect(() => {
    if (!matchId || !venueId) {
      setError("Match or venue missing from URL");
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const [m, state, lb, rw] = await Promise.all([
          api.getMatch(matchId),
          api.getMatchState(matchId, venueId),
          api.getMatchLeaderboard(matchId, venueId) as any,
          api.getMyRewards(matchId) as any,
        ]);
        setMatch(m);
        setMyParticipant(state?.participant || null);
        setLeaderboard(lb?.leaderboard || []);
        setTotalPages(lb?.totalPages || 1);
        setTotalCount(lb?.totalCount || 0);
        setPage(lb?.page || 1);
        setRewards((rw || []).filter((r: Reward) => r));
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load match history");
      } finally {
        setLoading(false);
      }
    })();
  }, [matchId, venueId]);

  // Pagination: load a specific leaderboard page.
  const loadLbPage = async (p: number) => {
    try {
      const lb = (await api.getMatchLeaderboard(matchId, venueId)) as any;
      // api.getMatchLeaderboard today doesn't take page. Call raw endpoint for pagination.
      const token = localStorage.getItem("jaffa_token");
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");
      const res = await fetch(`${apiBase}/leaderboard/${matchId}/${venueId}/match?page=${p}&pageSize=25`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
      setPage(data.page || p);
      void lb;
    } catch (e: any) {
      setError(e?.message || "Failed to load leaderboard page");
    }
  };

  const scoreData = match?.scoreData || {};
  const inn1 = scoreData.innings1;
  const inn2 = scoreData.innings2;
  const winner = scoreData.winner as string | undefined;
  const playerOfMatch = scoreData.playerOfMatch as string | undefined;

  const matchDate = useMemo(() => {
    const d = match?.startTime ? new Date(match.startTime) : null;
    return d ? d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";
  }, [match]);

  const myAccuracy = myParticipant?.totalPredictions > 0
    ? Math.round((myParticipant.correctPredictions / myParticipant.totalPredictions) * 100)
    : 0;

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 space-y-6 max-w-2xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-xs text-[#9ca3af] hover:text-white"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <h2
          className="text-3xl font-bold tracking-tight uppercase text-white"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          MATCH HISTORY
        </h2>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 animate-spin rounded-[2px]" style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }} />
          </div>
        )}

        {error && (
          <div className="game-card" style={{ borderColor: "#ff6341" }}>
            <p className="text-[#ff6341] text-sm font-bold">{error}</p>
          </div>
        )}

        {!loading && match && (
          <>
            {/* Match header */}
            <section className="game-card">
              <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold mb-2">{matchDate}</div>
              <div
                className="text-2xl font-bold text-white uppercase mb-2"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                {match.team1Short || "T1"} vs {match.team2Short || "T2"}
              </div>
              {(inn1 || inn2) && (
                <div className="text-xs text-[#9ca3af] space-y-1">
                  {inn1 && (
                    <div>
                      {inn1.teamShort}: <span className="text-white font-bold">{inn1.score}/{inn1.wickets}</span>
                      {inn1.overs ? ` (${inn1.overs} ov)` : ""}
                    </div>
                  )}
                  {inn2 && (
                    <div>
                      {inn2.teamShort}: <span className="text-white font-bold">{inn2.score}/{inn2.wickets}</span>
                      {inn2.overs ? ` (${inn2.overs} ov)` : ""}
                    </div>
                  )}
                </div>
              )}
              {winner && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#22c55e] uppercase">
                  <Trophy size={14} /> Winner: {winner}
                </div>
              )}
              {playerOfMatch && (
                <div className="mt-1 text-xs text-[#ffd60a]">
                  Player of the match: <span className="font-bold">{playerOfMatch}</span>
                </div>
              )}
            </section>

            {/* My stats */}
            {myParticipant && (
              <section className="game-card">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={16} className="text-[#ff6341]" />
                  <h3
                    className="text-sm font-bold text-white uppercase tracking-widest"
                    style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                  >
                    Your Performance
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <Stat label="TOTAL POINTS" value={myParticipant.totalPoints} color="#ffd60a" />
                  <Stat label="ACCURACY" value={`${myAccuracy}%`} color="#22c55e" />
                  <Stat label="CORRECT" value={`${myParticipant.correctPredictions}/${myParticipant.totalPredictions}`} color="#ffffff" />
                  <Stat label="BEST STREAK" value={myParticipant.bestStreak} color="#ff6341" />
                </div>
              </section>
            )}

            {/* Rewards */}
            <section className="game-card">
              <div className="flex items-center gap-2 mb-3">
                <Gift size={16} className="text-[#ffd60a]" />
                <h3
                  className="text-sm font-bold text-white uppercase tracking-widest"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  Rewards ({rewards.length})
                </h3>
              </div>
              {rewards.length === 0 ? (
                <p className="text-xs text-[#6b7280] italic">No rewards won in this match.</p>
              ) : (
                <div className="space-y-2">
                  {rewards.map((r) => (
                    <div
                      key={r.id}
                      className="border rounded-[3px] p-3"
                      style={{
                        borderColor: r.status === "redeemed" ? "#22c55e" : r.status === "expired" ? "#6b7280" : "#ffd60a",
                        background: "#1a1a1a",
                      }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-[#9ca3af] uppercase tracking-widest font-bold">
                          {r.round === 0 ? "Grand Prize" : `Round ${r.round}`} · #{r.position}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest"
                          style={{
                            color: r.status === "redeemed" ? "#22c55e" : r.status === "expired" ? "#6b7280" : "#ffd60a",
                          }}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white mb-1">{r.rewardText}</div>
                      <div className="flex items-center gap-3 text-xs text-[#9ca3af]">
                        <span>Code: <span className="font-mono font-bold text-white">{r.code}</span></span>
                        {r.redeemedAt && (
                          <span>· Redeemed {new Date(r.redeemedAt).toLocaleDateString("en-IN")}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Full leaderboard */}
            <section>
              <h3
                className="text-lg font-bold text-white mb-3 pl-3 uppercase"
                style={{
                  fontFamily: "'Bungee', 'Impact', cursive",
                  borderLeft: "4px solid #ffd60a",
                }}
              >
                Final Leaderboard ({totalCount})
              </h3>
              <div className="space-y-1">
                {leaderboard.map((row) => {
                  const isMe = myUserId && row.userId === myUserId;
                  return (
                    <div
                      key={row.userId}
                      className="flex items-center gap-3 px-3 py-2.5"
                      style={{
                        border: isMe ? "2px solid #ff6341" : "1px solid #2a2a2a",
                        background: isMe ? "rgba(255, 99, 65, 0.08)" : "#141414",
                        borderRadius: "4px",
                      }}
                    >
                      <span
                        className="text-xs font-bold w-8 text-center"
                        style={{ color: row.rank <= 3 ? "#ffd60a" : "#6b7280" }}
                      >
                        #{row.rank}
                      </span>
                      <span className={`flex-1 text-sm ${isMe ? "text-white font-bold" : "text-[#d1d5db]"}`}>
                        {row.displayName || "Player"}
                        {isMe && <span className="text-[#ff6341] text-[10px] ml-2">(you)</span>}
                      </span>
                      <span className="text-sm font-bold text-[#ffd60a]">{row.totalPoints}</span>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 text-xs">
                  <button
                    disabled={page <= 1}
                    onClick={() => loadLbPage(page - 1)}
                    className="btn-sticker px-4 py-2 disabled:opacity-40"
                    style={{ background: "#1a1a1a", border: "2px solid #333", color: "#fff" }}
                  >
                    Prev
                  </button>
                  <span className="text-[#9ca3af]">Page {page} / {totalPages}</span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => loadLbPage(page + 1)}
                    className="btn-sticker px-4 py-2 disabled:opacity-40"
                    style={{ background: "#1a1a1a", border: "2px solid #333", color: "#fff" }}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>

            <p className="text-[10px] text-[#6b7280] text-center italic mt-6">
              Something look wrong? Screenshot this page and send it to support.
            </p>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

// Suspense wrapper required because MatchHistoryPageInner reads
// useSearchParams (Next 16 errors during build otherwise).
export default function MatchHistoryPage() {
  return (
    <Suspense fallback={<div className="bg-[#0d0d0d] text-white min-h-screen" />}>
      <MatchHistoryPageInner />
    </Suspense>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="border border-[#2a2a2a] rounded-[3px] p-3 bg-[#141414]">
      <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color, fontFamily: "'Bungee', 'Impact', cursive" }}>
        {value}
      </div>
    </div>
  );
}
