"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";

export default function RewardsPage() {
  const { state } = useGame();
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

  const matchId = state.matchId || (typeof window !== "undefined" ? localStorage.getItem("jaffa_match_id") : null);

  useEffect(() => {
    loadRewards();
    const interval = setInterval(loadRewards, 15000);
    return () => clearInterval(interval);
  }, [matchId]);

  const loadRewards = async () => {
    try {
      const data = await api.getMyRewards(matchId || undefined);
      setRewards(data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = (id: string) => {
    setRevealedCodes((prev) => new Set([...prev, id]));
  };

  return (
    <div className="bg-background text-on-surface font-body min-h-screen">
      <Header
        rightContent={
          <div className="w-10 h-10 rounded-full bg-surface-container-highest border-2 border-primary-container/30 overflow-hidden flex items-center justify-center">
            <MaterialIcon icon="person" className="text-on-surface-variant" />
          </div>
        }
      />

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto">
        <h2 className="font-headline text-4xl font-extrabold tracking-tight mb-6">Rewards</h2>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rewards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MaterialIcon icon="military_tech" className="text-5xl text-on-surface-variant/30 mb-4" />
            <h3 className="font-headline text-xl font-bold text-on-surface mb-2">No rewards yet</h3>
            <p className="font-body text-sm text-on-surface-variant max-w-[240px]">
              Win rounds and matches to earn rewards from the venue!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {rewards.map((reward: any) => {
              const isRedeemed = reward.status === "redeemed";
              const isExpired = reward.status === "expired";
              const isActive = reward.status === "active";

              return (
                <div
                  key={reward.id}
                  className={`rounded-xl p-5 border ${
                    isActive
                      ? "bg-surface-container-low border-primary-container/20 stadium-glow"
                      : "bg-surface-container-low/50 border-white/5 opacity-60"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <MaterialIcon
                        icon={reward.type === "round" ? "emoji_events" : "workspace_premium"}
                        className={isActive ? "text-primary-container" : "text-on-surface-variant/50"}
                      />
                      <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {reward.type === "round" ? `Round ${reward.round} Winner` : "Match Winner"}
                      </span>
                    </div>
                    <span className={`font-label text-[10px] font-bold px-2 py-1 rounded ${
                      isActive ? "bg-primary-container/20 text-primary-container"
                      : isRedeemed ? "bg-surface-container-highest text-on-surface-variant"
                      : "bg-error/10 text-error"
                    }`}>
                      {isActive ? "ACTIVE" : isRedeemed ? "REDEEMED" : "EXPIRED"}
                    </span>
                  </div>

                  <h3 className="font-headline text-lg font-bold text-on-surface mb-1">
                    {reward.prize || "Reward"}
                  </h3>
                  <p className="font-body text-xs text-on-surface-variant mb-4">
                    Rank #{reward.rank} · {reward.venueName || "Venue"}
                  </p>

                  {isActive && reward.code ? (
                    <button
                      onClick={() => handleReveal(reward.id)}
                      className="w-full py-3 bg-primary-container text-on-primary-container font-label text-xs font-black uppercase tracking-[0.2em] rounded hover:shadow-[0_0_20px_rgba(0,255,171,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      {revealedCodes.has(reward.id) ? reward.code : "Reveal Code"}
                      <MaterialIcon icon={revealedCodes.has(reward.id) ? "content_copy" : "lock_open"} className="text-sm" />
                    </button>
                  ) : (
                    <div className="w-full py-3 bg-surface-container-highest text-on-surface-variant/50 font-label text-xs font-bold uppercase tracking-widest rounded text-center">
                      {isRedeemed ? "Already claimed" : isExpired ? "Expired" : "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
