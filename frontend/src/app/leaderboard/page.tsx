"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import Leaderboard from "@/components/Leaderboard";
import { Trophy } from "lucide-react";
import { useGame } from "@/context/GameContext";

export default function LeaderboardPage() {
  const { state } = useGame();

  // Use context values with localStorage fallback
  const [matchId, setMatchId] = useState(state.matchId);
  const [venueId, setVenueId] = useState(state.venueId);

  useEffect(() => {
    if (!matchId) setMatchId(localStorage.getItem("jaffa_match_id"));
    if (!venueId) setVenueId(localStorage.getItem("jaffa_venue_id"));
  }, [state.matchId, state.venueId]);

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

        {matchId && venueId ? (
          <Leaderboard
            matchId={matchId}
            venueId={venueId}
          />
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
