"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { connectSocket } from "@/lib/socket";

interface RoomLeaderboardProps {
  roomId: string;
}

const ROUND_LABELS: Record<number, string> = {
  1: "R1",
  2: "R2",
  3: "R3",
  4: "R4",
  5: "R5",
  6: "R6",
};

export default function RoomLeaderboard({ roomId }: RoomLeaderboardProps) {
  const { state } = useGame();
  const { currentRound, userId } = state;

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"round" | "match">("match");
  const [selectedRound, setSelectedRound] = useState(currentRound || 1);

  useEffect(() => {
    if (currentRound && currentRound > 0) {
      setSelectedRound(currentRound);
    }
  }, [currentRound]);

  useEffect(() => {
    loadLeaderboard();
  }, [roomId, activeTab, selectedRound]);

  // Listen for room leaderboard updates via socket
  useEffect(() => {
    const socket = connectSocket();

    const handleUpdate = () => {
      loadLeaderboard();
    };

    socket.on("roomLeaderboardUpdate", handleUpdate);
    return () => {
      socket.off("roomLeaderboardUpdate", handleUpdate);
    };
  }, [roomId, activeTab, selectedRound]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      if (activeTab === "round") {
        const result = await api.getRoomRoundLeaderboard(roomId, selectedRound);
        setData(result.leaderboard || []);
      } else {
        const result = await api.getRoomLeaderboard(roomId);
        setData(result.leaderboard || []);
      }
    } catch (err) {
      console.error("Room leaderboard error:", err);
    }
    setLoading(false);
  };

  const effectiveRound = currentRound || 1;
  const roundNumbers = Array.from({ length: effectiveRound }, (_, i) => i + 1);

  const tabClass = (isActive: boolean) =>
    `flex-1 rounded-[2px] py-2 text-xs font-black uppercase tracking-wider transition-all ${
      isActive
        ? "bg-[#ff6341] text-black border-2 border-black shadow-[2px_2px_0_0_#000]"
        : "text-white/50"
    }`;

  return (
    <div className="space-y-4">
      {/* Main tabs: Round / Full Match */}
      <div className="w-full bg-[#0d0d0d] border-2 border-[#2a2a2a] rounded-[3px] p-1 flex gap-1">
        <button
          onClick={() => setActiveTab("round")}
          className={tabClass(activeTab === "round")}
        >
          Round {selectedRound}
        </button>
        <button
          onClick={() => setActiveTab("match")}
          className={tabClass(activeTab === "match")}
        >
          Full Match
        </button>
      </div>

      {/* Round selector */}
      {activeTab === "round" && roundNumbers.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {roundNumbers.map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRound(r)}
              className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-[3px] border-2 transition-all whitespace-nowrap ${
                selectedRound === r
                  ? "bg-[#ff6341] text-black border-black shadow-[2px_2px_0_0_#000]"
                  : "bg-[#1a1a1a] text-white/50 border-[#2a2a2a]"
              }`}
            >
              {ROUND_LABELS[r] || `R${r}`}
            </button>
          ))}
        </div>
      )}

      {/* Leaderboard content */}
      {loading ? (
        <div className="py-12 text-center text-white/50 font-bold uppercase tracking-wider animate-pulse">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-white/40 font-bold uppercase tracking-wider">
            No scores yet
          </p>
          <p className="text-[10px] text-[#6b7280] mt-1">Start playing to see the leaderboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((player: any, index: number) => {
            const isMe = player.userId === userId;
            const rank = player.rank || index + 1;
            const points =
              activeTab === "round"
                ? player.roundPoints
                : player.totalPoints;

            return (
              <motion.div
                key={player.userId}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: index * 0.03 }}
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
                <div className={rank <= 3 ? "rank-badge" : "rank-badge-gray"}>
                  {rank}
                </div>

                {/* Player name */}
                <div className="flex-1 min-w-0">
                  <span
                    className={`player-name truncate block ${isMe ? "text-[#ff6341]" : ""}`}
                  >
                    {player.displayName}
                    {isMe && " (You)"}
                  </span>
                  {player.currentStreak > 0 && (
                    <span className="text-[10px] text-[#ffd60a]">
                      {player.currentStreak} streak
                    </span>
                  )}
                </div>

                {/* Points */}
                <div className="text-right">
                  <div className={`stat-number text-xl ${isMe ? "text-[#ff6341]" : ""}`}>
                    {points}
                  </div>
                  <div className="text-[10px] text-white/40 font-bold uppercase">pts</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
