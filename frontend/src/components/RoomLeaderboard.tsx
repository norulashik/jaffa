"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { connectSocket } from "@/lib/socket";
import { Crown } from "lucide-react";

interface RoomLeaderboardProps {
  roomId: string;
  isSeasonRoom?: boolean;
}

const ROUND_LABELS: Record<number, string> = {
  1: "R1",
  2: "R2",
  3: "R3",
  4: "R4",
  5: "R5",
  6: "R6",
};

function CapBadge({ type }: { type: "orange" | "violet" }) {
  const isOrange = type === "orange";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[3px] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
        isOrange
          ? "bg-[#2a1200] text-[#ffb347] border-[#ff8a1e]"
          : "bg-[#1c1230] text-[#c4b5fd] border-[#8b5cf6]"
      }`}
    >
      <Crown className={`w-3.5 h-3.5 ${isOrange ? "text-[#ff8a1e]" : "text-[#8b5cf6]"}`} />
      {isOrange ? "Orange Cap" : "Violet Cap"}
    </span>
  );
}

export default function RoomLeaderboard({ roomId, isSeasonRoom = false }: RoomLeaderboardProps) {
  const { state } = useGame();
  const { currentRound, userId } = state;

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"round" | "match" | "season">(isSeasonRoom ? "season" : "match");
  const [selectedRound, setSelectedRound] = useState(currentRound || 1);
  const [hasActiveSeasonMatch, setHasActiveSeasonMatch] = useState(!isSeasonRoom);

  useEffect(() => {
    if (currentRound && currentRound > 0) {
      setSelectedRound(currentRound);
    }
  }, [currentRound]);

  useEffect(() => {
    let cancelled = false;

    if (!isSeasonRoom) {
      setHasActiveSeasonMatch(true);
      return;
    }

    api.getRoom(roomId)
      .then((result) => {
        if (cancelled) return;
        const currentSeasonMatch = result.currentSeasonMatch;
        const active = Boolean(
          currentSeasonMatch && ["live", "upcoming"].includes(currentSeasonMatch.status)
        );
        setHasActiveSeasonMatch(active);
      })
      .catch(() => {
        if (!cancelled) {
          setHasActiveSeasonMatch(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, isSeasonRoom]);

  useEffect(() => {
    if (isSeasonRoom && !hasActiveSeasonMatch && activeTab !== "season") {
      setActiveTab("season");
    }
  }, [isSeasonRoom, hasActiveSeasonMatch, activeTab]);

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
      } else if (activeTab === "season") {
        const result = await api.getRoomSeasonLeaderboard(roomId);
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
        {(!isSeasonRoom || hasActiveSeasonMatch) && (
          <>
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
          </>
        )}
        {isSeasonRoom && (
          <button
            onClick={() => setActiveTab("season")}
            className={tabClass(activeTab === "season")}
          >
            Season Leaderboard
          </button>
        )}
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
            const showOrangeCap = activeTab === "season" && player.capStatus === "orange";
            const showVioletCap = activeTab === "season" && player.capStatus === "violet";

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
                  {(showOrangeCap || showVioletCap) && (
                    <div className="mb-1">
                      <CapBadge type={showOrangeCap ? "orange" : "violet"} />
                    </div>
                  )}
                  <span className={`player-name truncate block ${isMe ? "text-[#ff6341]" : ""}`}>
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
                  <div className="text-[10px] text-white/40 font-bold uppercase">
                    {activeTab === "season" ? `${player.matchCount || 0} matches` : "pts"}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
