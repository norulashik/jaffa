"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { IoFlame, IoTrophy } from "react-icons/io5";
import CricketAvatar from "./CricketAvatar";

interface LeaderboardProps {
  matchId: string;
  venueId: string;
  currentRound: number;
  userId?: string;
}

export default function Leaderboard({ matchId, venueId, currentRound, userId }: LeaderboardProps) {
  const [view, setView] = useState<"round" | "match">("round");
  const [roundData, setRoundData] = useState<any[]>([]);
  const [matchData, setMatchData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [matchId, venueId, currentRound, view]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      if (view === "round") {
        const data = await api.getRoundLeaderboard(matchId, venueId, currentRound);
        setRoundData(data.leaderboard);
      } else {
        const data = await api.getMatchLeaderboard(matchId, venueId);
        setMatchData(data.leaderboard);
      }
    } catch (err) {
      console.error("Leaderboard error:", err);
    }
    setLoading(false);
  };

  const data = view === "round" ? roundData : matchData;

  return (
    <div className="p-4">
      {/* Toggle */}
      <div className="flex bg-slate-900 rounded-xl p-1 mb-4">
        <button
          onClick={() => setView("round")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "round"
              ? "bg-orange-500 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Round {currentRound}
        </button>
        <button
          onClick={() => setView("match")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "match"
              ? "bg-orange-500 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Overall Match
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 animate-pulse">Loading...</div>
      ) : data.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-slate-400">No players yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((player: any, index: number) => {
            const isMe = player.userId === userId;
            const rank = player.rank || index + 1;

            return (
              <motion.div
                key={player.userId}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: index * 0.03 }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                  isMe
                    ? "bg-orange-500/10 border border-orange-500/30"
                    : rank <= 3
                    ? "bg-slate-800/80"
                    : "bg-slate-900"
                }`}
              >
                {/* Avatar + Rank */}
                <div className="relative">
                  {player.avatarConfig ? (
                    <CricketAvatar config={player.avatarConfig} size="sm" mood={isMe ? "excited" : "idle"} />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      rank === 1 ? "bg-yellow-500 text-black" :
                      rank === 2 ? "bg-slate-300 text-black" :
                      rank === 3 ? "bg-orange-600 text-white" :
                      "bg-slate-800 text-slate-400"
                    }`}>
                      {rank <= 3 ? <IoTrophy /> : rank}
                    </div>
                  )}
                  {player.avatarConfig && (
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                      rank === 1 ? "bg-yellow-500 text-black" :
                      rank === 2 ? "bg-slate-300 text-black" :
                      rank === 3 ? "bg-orange-600 text-white" :
                      "bg-slate-700 text-slate-300"
                    }`}>
                      {rank}
                    </div>
                  )}
                </div>

                {/* Name + streak */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-medium truncate ${isMe ? "text-orange-400" : "text-white"}`}>
                      {player.displayName}
                      {isMe && " (You)"}
                    </span>
                    {player.currentStreak >= 3 && (
                      <span className="flex items-center text-xs text-yellow-400">
                        <IoFlame /> {player.currentStreak}
                      </span>
                    )}
                  </div>
                  {view === "match" && (
                    <div className="text-xs text-slate-500">
                      {player.accuracy}% accuracy
                    </div>
                  )}
                </div>

                {/* Points */}
                <div className="text-right">
                  <div className={`font-bold ${isMe ? "text-orange-400" : "text-white"}`}>
                    {view === "round" ? player.points : player.totalPoints}
                  </div>
                  <div className="text-xs text-slate-500">pts</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
