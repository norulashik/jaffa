"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface LeaderboardProps {
  matchId: string;
  venueId: string;
}

export default function Leaderboard({ matchId, venueId }: LeaderboardProps) {
  const { state } = useGame();
  const { currentRound, userId } = state;

  const [roundData, setRoundData] = useState<any[]>([]);
  const [matchData, setMatchData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"round" | "match">("round");

  useEffect(() => {
    loadLeaderboard();
  }, [matchId, venueId, currentRound, activeTab]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      if (activeTab === "round") {
        const data = await api.getRoundLeaderboard(
          matchId,
          venueId,
          currentRound || 1
        );
        setRoundData(data.leaderboard || []);
      } else {
        const data = await api.getMatchLeaderboard(matchId, venueId);
        setMatchData(data.leaderboard || []);
      }
    } catch (err) {
      console.error("Leaderboard error:", err);
    }
    setLoading(false);
  };

  const data = activeTab === "round" ? roundData : matchData;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "round" | "match")}
      >
        <TabsList className="w-full bg-[#0d0d0d] border-2 border-[#2a2a2a] rounded-[3px] p-1 h-auto">
          <TabsTrigger
            value="round"
            className="flex-1 rounded-[2px] py-2 text-xs font-black uppercase tracking-wider data-[state=active]:bg-[#ff6341] data-[state=active]:text-black data-[state=active]:border-2 data-[state=active]:border-black data-[state=active]:shadow-[2px_2px_0_0_#000] data-[state=inactive]:text-white/50"
          >
            Round {currentRound || 1}
          </TabsTrigger>
          <TabsTrigger
            value="match"
            className="flex-1 rounded-[2px] py-2 text-xs font-black uppercase tracking-wider data-[state=active]:bg-[#ff6341] data-[state=active]:text-black data-[state=active]:border-2 data-[state=active]:border-black data-[state=active]:shadow-[2px_2px_0_0_#000] data-[state=inactive]:text-white/50"
          >
            Full Match
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {loading ? (
            <div className="py-12 text-center text-white/50 font-bold uppercase tracking-wider animate-pulse">
              Loading...
            </div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-white/40 font-bold uppercase tracking-wider">
                No players yet
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.map((player: any, index: number) => {
                const isMe = player.userId === userId;
                const rank = player.rank || index + 1;
                const points =
                  activeTab === "round"
                    ? player.points
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
                    <div
                      className={
                        rank <= 3 ? "rank-badge" : "rank-badge-gray"
                      }
                    >
                      {rank}
                    </div>

                    {/* Player name */}
                    <div className="flex-1 min-w-0">
                      <span
                        className={`player-name truncate block ${
                          isMe ? "text-[#ff6341]" : ""
                        }`}
                      >
                        {player.displayName}
                        {isMe && " (You)"}
                      </span>
                      {activeTab === "match" && player.accuracy !== undefined && (
                        <span className="text-xs text-white/40 font-bold">
                          {player.accuracy}% accuracy
                        </span>
                      )}
                    </div>

                    {/* Points */}
                    <div className="text-right">
                      <div
                        className={`stat-number text-xl ${
                          isMe ? "text-[#ff6341]" : ""
                        }`}
                      >
                        {points}
                      </div>
                      <div className="text-[10px] text-white/40 font-bold uppercase">
                        pts
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
