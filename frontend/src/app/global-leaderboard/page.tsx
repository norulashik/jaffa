"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { isCafeRoute, cafeUrl } from "@/lib/navigation";
import { GiCrownCoin } from "react-icons/gi";
import { MapPin, ArrowLeft } from "lucide-react";

export default function GlobalLeaderboardPage() {
  const router = useRouter();
  const { state: gameState } = useGame();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [myRank, setMyRank] = useState(0);
  const [myCity, setMyCity] = useState<string | null>(null);
  const [myState, setMyState] = useState<string | null>(null);
  const [scope, setScope] = useState<"city" | "state" | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }
    loadLeaderboard();
  }, [scope]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const data = await api.getGlobalLeaderboard(scope);
      setLeaderboard(data.leaderboard);
      setMyRank(data.myRank);
      setMyCity(data.myCity);
      setMyState(data.myState);
    } catch {
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 space-y-5 max-w-2xl mx-auto">
        {/* Back + Title */}
        <section>
          <button
            onClick={() => router.push("/profile")}
            className="flex items-center gap-2 text-[#6b7280] hover:text-white transition-colors mb-3"
          >
            <ArrowLeft size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Profile</span>
          </button>
          <h2
            className="text-2xl font-bold tracking-tight uppercase text-white"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            GLOBAL LEADERBOARD
          </h2>
          <p className="text-xs text-[#6b7280] mt-1">
            Lifetime points across all matches
          </p>
        </section>

        {/* My Stats Banner */}
        <div
          className="game-card flex items-center justify-between"
          style={{ border: "2px solid #ff6341", boxShadow: "0 0 20px rgba(255,99,65,0.2)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 flex items-center justify-center rounded-[3px] font-black"
              style={{
                background: "#ff6341",
                color: "#000",
                border: "2px solid #000",
                boxShadow: "2px 2px 0 0 #000",
                fontFamily: "'Bungee', 'Impact', cursive",
              }}
            >
              #{myRank}
            </div>
            <div>
              <p
                className="font-bold text-sm text-[#ff6341] uppercase"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                YOUR RANK
              </p>
              {myCity && (
                <p className="text-[10px] text-[#6b7280] flex items-center gap-1">
                  <MapPin size={10} /> {myCity}{myState ? `, ${myState}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              <GiCrownCoin className="text-lg text-[#ff6341]" />
              <span
                className="text-2xl font-black text-[#ff6341]"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                {gameState.userId
                  ? leaderboard.find((p) => p.userId === gameState.userId)?.lifetimePoints ?? "—"
                  : "—"}
              </span>
            </div>
            <p className="text-[9px] text-[#6b7280] font-bold uppercase">Lifetime Pts</p>
          </div>
        </div>

        {/* Scope Tabs */}
        <div className="w-full bg-[#0d0d0d] border-2 border-[#2a2a2a] rounded-[3px] p-1 flex gap-1">
          {(["city", "state", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex-1 rounded-[2px] py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
                scope === s
                  ? "bg-[#ff6341] text-black border-2 border-black shadow-[2px_2px_0_0_#000]"
                  : "text-white/50"
              }`}
            >
              {s === "city"
                ? myCity || "CITY"
                : s === "state"
                ? myState || "STATE"
                : "ALL INDIA"}
            </button>
          ))}
        </div>

        {/* Leaderboard */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div
              className="w-8 h-8 animate-spin rounded-[2px]"
              style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }}
            />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-white/40 font-bold uppercase tracking-wider text-sm">
              {scope !== "all" && !myCity
                ? "Play a match to set your location"
                : "No players yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((player: any, index: number) => {
              const isMe = player.userId === gameState.userId;
              const rank = player.rank || index + 1;

              return (
                <motion.div
                  key={player.userId}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: index * 0.025 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[4px] border-2 ${
                    isMe
                      ? "border-[#ff6341] bg-[#1a0800]"
                      : "border-[#2a2a2a] bg-[#1a1a1a]"
                  }`}
                  style={{
                    boxShadow: isMe
                      ? "4px 4px 0 0 #ff6341"
                      : "2px 2px 0 0 #2a2a2a",
                  }}
                >
                  {/* Rank badge */}
                  <div
                    className="w-8 h-8 flex items-center justify-center font-black text-sm rounded-[3px] flex-shrink-0"
                    style={{
                      background:
                        rank === 1
                          ? "#ff6341"
                          : rank === 2
                          ? "#c0c0c0"
                          : rank === 3
                          ? "#cd7f32"
                          : "#2a2a2a",
                      color: rank <= 3 ? "#000" : "#6b7280",
                      border: rank <= 3 ? "2px solid #000" : "2px solid #333",
                      boxShadow: rank <= 3 ? "2px 2px 0 0 #000" : "none",
                      fontFamily: "'Bungee', 'Impact', cursive",
                    }}
                  >
                    {rank}
                  </div>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`font-bold text-sm truncate block ${
                        isMe ? "text-[#ff6341]" : "text-white"
                      }`}
                      style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                    >
                      {player.displayName}
                      {isMe && " (You)"}
                    </span>
                    {player.city && (
                      <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">
                        {player.city}
                        {player.state ? `, ${player.state}` : ""}
                      </span>
                    )}
                  </div>

                  {/* Points */}
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-lg font-black ${
                        isMe ? "text-[#ff6341]" : "text-white"
                      }`}
                      style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                    >
                      {player.lifetimePoints}
                    </div>
                    <div className="text-[9px] text-[#6b7280] font-bold uppercase">
                      pts
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* My rank if not in top 50 */}
            {myRank > 50 && (
              <div
                className="text-center py-3 mt-2 rounded-[4px] border-2 border-[#ff6341]"
                style={{ background: "#1a0800" }}
              >
                <span className="text-xs text-[#6b7280] font-bold uppercase">Your Rank: </span>
                <span
                  className="text-lg font-black text-[#ff6341]"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  #{myRank}
                </span>
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
