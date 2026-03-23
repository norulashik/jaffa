"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import { api } from "@/lib/api";

interface LeaderboardEntry {
  rank: number;
  displayName: string;
  score: number;
  isCurrentUser?: boolean;
}

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<"round" | "overall">("round");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    // Try loading leaderboard from API
    // For now, show placeholder data matching Stitch design
  }, [activeTab]);

  // Placeholder data matching Stitch design exactly
  const podium = [
    { rank: 2, name: "Rahul.K", score: "14,200", color: "slate-400", glowClass: "silver-glow", size: "w-20 h-20", borderColor: "border-slate-400" },
    { rank: 1, name: "Vikram_Pro", score: "18,540", color: "[#FFD700]", glowClass: "gold-glow", size: "w-28 h-28", borderColor: "border-[#FFD700]" },
    { rank: 3, name: "Sid_S", score: "12,100", color: "orange-700", glowClass: "bronze-glow", size: "w-18 h-18", borderColor: "border-orange-700" },
  ];

  const listItems = [
    { rank: "04", name: "Ananya_R", score: "11,850", isUser: false },
    { rank: "05", name: "Arjun (You)", score: "10,420", isUser: true, badge: "Rising Star" },
    { rank: "06", name: "Chris_77", score: "9,940", isUser: false },
    { rank: "07", name: "RohanV", score: "9,120", isUser: false },
    { rank: "08", name: "Priya_Play", score: "8,750", isUser: false },
  ];

  return (
    <div className="bg-background text-on-surface font-body min-h-screen overflow-x-hidden">
      {/* TopAppBar */}
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
        {/* Header & Tabs */}
        <section className="px-6 mb-8">
          <h2 className="font-headline text-4xl font-extrabold mb-6 tracking-tight">Ranks</h2>
          <div className="flex p-1 bg-surface-container-lowest rounded-xl w-full max-w-md">
            <button
              onClick={() => setActiveTab("round")}
              className={`flex-1 py-3 text-center rounded-lg font-label font-bold text-sm tracking-widest uppercase transition-all duration-300 ${
                activeTab === "round"
                  ? "bg-surface-container-high text-on-surface"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Round
            </button>
            <button
              onClick={() => setActiveTab("overall")}
              className={`flex-1 py-3 text-center rounded-lg font-label font-bold text-sm tracking-widest uppercase transition-all duration-300 ${
                activeTab === "overall"
                  ? "bg-surface-container-high text-on-surface"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Overall
            </button>
          </div>
        </section>

        {/* Podium Section */}
        <section className="px-6 mb-12 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-64 h-64 bg-primary-container/5 blur-[100px] rounded-full"></div>
          <div className="flex items-end justify-center gap-2 pt-12">
            {/* Rank 2 (Silver) */}
            <div className="flex flex-col items-center flex-1 max-w-[100px]">
              <div className="relative mb-4 group">
                <div className="w-20 h-20 rounded-full border-2 border-slate-400 silver-glow overflow-hidden transform group-hover:scale-105 transition-transform bg-surface-container-highest flex items-center justify-center">
                  <MaterialIcon icon="person" className="text-3xl text-slate-400" />
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-400 text-surface font-headline font-black px-3 py-0.5 rounded-full text-xs">
                  2
                </div>
              </div>
              <span className="font-label text-xs font-bold uppercase tracking-tighter text-center">Rahul.K</span>
              <span className="font-headline text-lg font-bold text-secondary-fixed-dim">14,200</span>
            </div>

            {/* Rank 1 (Gold) */}
            <div className="flex flex-col items-center flex-1 max-w-[120px] -translate-y-6">
              <div className="relative mb-4 group">
                <div className="w-28 h-28 rounded-full border-4 border-[#FFD700] gold-glow overflow-hidden transform group-hover:scale-105 transition-transform shadow-[0_0_40px_rgba(255,215,0,0.5)] bg-surface-container-highest flex items-center justify-center">
                  <MaterialIcon icon="person" className="text-5xl text-[#FFD700]" />
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#FFD700] text-surface font-headline font-black px-4 py-1 rounded-full text-sm">
                  1
                </div>
                <MaterialIcon
                  icon="military_tech"
                  filled
                  className="absolute -top-8 left-1/2 -translate-x-1/2 text-[#FFD700] text-3xl animate-bounce"
                />
              </div>
              <span className="font-label text-sm font-extrabold uppercase tracking-tight text-center">Vikram_Pro</span>
              <span className="font-headline text-2xl font-black text-primary-container">18,540</span>
            </div>

            {/* Rank 3 (Bronze) */}
            <div className="flex flex-col items-center flex-1 max-w-[100px]">
              <div className="relative mb-4 group">
                <div className="w-18 h-18 rounded-full border-2 border-orange-700 bronze-glow overflow-hidden transform group-hover:scale-105 transition-transform bg-surface-container-highest flex items-center justify-center">
                  <MaterialIcon icon="person" className="text-3xl text-orange-700" />
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-orange-700 text-on-surface font-headline font-black px-3 py-0.5 rounded-full text-xs">
                  3
                </div>
              </div>
              <span className="font-label text-xs font-bold uppercase tracking-tighter text-center">Sid_S</span>
              <span className="font-headline text-lg font-bold text-tertiary-fixed-dim">12,100</span>
            </div>
          </div>
        </section>

        {/* Leaderboard List */}
        <section className="px-4 space-y-3">
          {/* Table Header */}
          <div className="flex px-6 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60">
            <span className="w-12">Rank</span>
            <span className="flex-1">User</span>
            <span className="w-20 text-right">Points</span>
          </div>

          {listItems.map((item) =>
            item.isUser ? (
              /* Current User (Highlighted) */
              <div
                key={item.rank}
                className="flex items-center px-6 py-5 bg-primary-container/10 border-l-4 border-primary-container rounded-xl relative shadow-[0_0_20px_rgba(0,255,171,0.1)]"
              >
                <span className="w-12 font-headline font-black text-primary-container">{item.rank}</span>
                <div className="flex-1 flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full border-2 border-primary-container bg-surface-container-highest flex items-center justify-center">
                      <MaterialIcon icon="person" className="text-primary-container" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary-container rounded-full border-2 border-surface animate-pulse"></span>
                  </div>
                  <div>
                    <span className="font-body font-extrabold text-primary-container block">{item.name}</span>
                    <span className="font-label text-[9px] uppercase tracking-widest text-on-primary-container font-bold bg-primary-container/20 px-1.5 rounded">
                      {item.badge}
                    </span>
                  </div>
                </div>
                <span className="w-20 text-right font-headline font-black text-primary-container">{item.score}</span>
              </div>
            ) : (
              /* Regular Item */
              <div
                key={item.rank}
                className="flex items-center px-6 py-4 bg-surface-container-low rounded-xl group hover:bg-surface-container-high transition-colors"
              >
                <span className="w-12 font-headline font-bold text-on-surface-variant">{item.rank}</span>
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center">
                    <MaterialIcon icon="person" className="text-sm text-on-surface-variant" />
                  </div>
                  <span className="font-body font-semibold">{item.name}</span>
                </div>
                <span className="w-20 text-right font-headline font-bold">{item.score}</span>
              </div>
            )
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
