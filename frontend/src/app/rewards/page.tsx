"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { Trophy, Star, Gift, Lock, Copy } from "lucide-react";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";
import { toast } from "sonner";

export default function RewardsPage() {
  const { state } = useGame();
  const router = useRouter();
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

  const matchId = state.matchId || (typeof window !== "undefined" ? localStorage.getItem("jaffa_match_id") : null);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }

    loadRewards();
    const interval = setInterval(loadRewards, 15000);
    return () => clearInterval(interval);
  }, [matchId, router]);

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

  const handleReveal = async (reward: any) => {
    if (!revealedCodes.has(reward.id)) {
      setRevealedCodes((prev) => new Set([...prev, reward.id]));
      toast.success("Reward code revealed");
      return;
    }

    try {
      await navigator.clipboard.writeText(reward.code);
      toast.success("Reward code copied");
    } catch {
      toast.error("Could not copy reward code");
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen">
      <Header />

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto">
        <h2
          className="text-4xl font-extrabold tracking-tight mb-6 uppercase"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          REWARDS
        </h2>

        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-8 h-8 animate-spin rounded-[2px]"
              style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }}
            />
          </div>
        ) : rewards.length === 0 ? (
          <div className="game-card flex flex-col items-center py-12 text-center">
            <Gift size={48} className="text-[#6b7280] mb-4" />
            <h3
              className="text-xl font-bold text-white mb-2 uppercase"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              NO REWARDS YET
            </h3>
            <p className="text-sm text-[#6b7280] max-w-[240px]">
              Win rounds and matches to earn rewards from the venue!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {rewards.map((reward: any) => {
              const isRedeemed = reward.status === "redeemed";
              const isExpired = reward.status === "expired";
              const isActive = reward.status === "active";

              const cardClass = isActive
                ? "card-orange"
                : isRedeemed
                ? "card-green"
                : "game-card opacity-60";

              return (
                <motion.div
                  key={reward.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cardClass}
                  style={isActive ? { boxShadow: "0 0 20px rgba(255, 99, 65, 0.3)" } : undefined}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      {reward.type === "round" ? (
                        <Trophy size={16} className={isActive ? "text-[#ff6341]" : "text-[#6b7280]"} />
                      ) : (
                        <Star size={16} className={isActive ? "text-[#ff6341]" : "text-[#6b7280]"} />
                      )}
                      <span className="info-pill">
                        {reward.type === "round" ? `ROUND ${reward.round} WINNER` : "MATCH WINNER"}
                      </span>
                    </div>
                    {isActive ? (
                      <span className="live-badge">ACTIVE</span>
                    ) : (
                      <span className="info-pill">
                        {isRedeemed ? "REDEEMED" : "EXPIRED"}
                      </span>
                    )}
                  </div>

                  <h3
                    className="text-lg font-bold text-white mb-1"
                    style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                  >
                    {reward.rewardText || "Reward"}
                  </h3>
                  <p className="text-xs text-[#6b7280] mb-4">
                    Rank #{reward.rank} · {reward.venueName || "Venue"}
                  </p>

                  {isActive && reward.code ? (
                    <button
                      onClick={() => handleReveal(reward)}
                      className="w-full btn-sticker btn-orange flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-xs font-black"
                    >
                      {revealedCodes.has(reward.id) ? (
                        <>
                          <span
                            className="text-base tracking-[0.3em]"
                            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                          >
                            {reward.code}
                          </span>
                          <Copy size={14} />
                        </>
                      ) : (
                        <>
                          REVEAL CODE
                          <Lock size={14} />
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      className="w-full btn-gray py-3 text-xs font-bold uppercase tracking-widest text-center cursor-not-allowed opacity-60"
                      disabled
                    >
                      {isRedeemed ? "ALREADY CLAIMED" : isExpired ? "EXPIRED" : "\u2014"}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
