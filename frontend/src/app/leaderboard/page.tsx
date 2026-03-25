"use client";

import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import Leaderboard from "@/components/Leaderboard";
import { useGame } from "@/context/GameContext";

export default function LeaderboardPage() {
  const { state } = useGame();
  const { matchId, venueId, currentRound, user } = state;

  return (
    <div className="bg-background text-on-surface font-body min-h-screen overflow-x-hidden">
      <Header
        rightContent={
          <>
            <div className="bg-surface-container-highest/50 p-1.5 rounded-full hover:text-[#14d1ff] transition-colors duration-300 active:scale-95 cursor-pointer">
              <MaterialIcon icon="notifications" />
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-[#00FFAB]/20 overflow-hidden active:scale-90 transition-transform cursor-pointer bg-surface-container-highest">
              <div className="w-full h-full flex items-center justify-center">
                <MaterialIcon icon="person" className="text-on-surface-variant" />
              </div>
            </div>
          </>
        }
      />

      <main className="pt-24 pb-32 stadium-gradient-top">
        <section className="px-6 mb-4">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight">Ranks</h2>
        </section>

        {matchId && venueId ? (
          <Leaderboard
            matchId={matchId}
            venueId={venueId}
            currentRound={currentRound || 1}
            userId={user?.id}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <MaterialIcon icon="leaderboard" className="text-5xl text-on-surface-variant/30 mb-4" />
            <h3 className="font-headline text-xl font-bold text-on-surface mb-2">No active match</h3>
            <p className="font-body text-sm text-on-surface-variant max-w-[240px]">
              Join a match to see the leaderboard!
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
