"use client";

import { useState } from "react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";

const rewards = [
  {
    id: "1",
    icon: "coffee",
    iconColor: "text-primary-container",
    iconBg: "bg-primary-container/10",
    badge: "EXCLUSIVE",
    badgeColor: "text-secondary-container bg-secondary-container/10",
    title: "Free Coffee at Café Jaffa",
    description: "Redeemable at any stadium branch. Valid for 48 hours.",
    active: true,
    hasFlipHint: true,
    hasGlow: true,
  },
  {
    id: "2",
    icon: "shopping_bag",
    iconColor: "text-secondary-container",
    iconBg: "bg-secondary-container/10",
    badge: "MERCH",
    badgeColor: "text-primary-container bg-primary-container/10",
    title: "10% Off Next Order",
    description: "Applicable on all official team jerseys and caps.",
    active: true,
    hasFlipHint: true,
  },
  {
    id: "3",
    icon: "confirmation_number",
    iconColor: "text-tertiary-fixed-dim",
    iconBg: "bg-tertiary-fixed-dim/10",
    badge: "RARE",
    badgeColor: "text-slate-400 bg-white/5",
    title: "Double XP Booster",
    description: "Get 2x points for your next 3 match predictions.",
    active: true,
    hasFlipHint: true,
  },
  {
    id: "4",
    icon: "fastfood",
    iconColor: "text-slate-500",
    iconBg: "bg-surface-container-highest",
    badge: "Used",
    badgeColor: "text-slate-500 bg-white/5",
    title: "BOGO Burger Combo",
    description: "Buy one get one free at stadium food stalls.",
    active: false,
  },
];

export default function RewardsProfile() {
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

  const handleReveal = (id: string) => {
    setRevealedCodes((prev) => new Set([...prev, id]));
  };

  return (
    <div className="bg-surface text-on-surface font-body">
      {/* TopAppBar */}
      <Header
        rightContent={
          <>
            <div className="hidden md:flex gap-8 font-label text-sm uppercase tracking-widest">
              <a className="text-slate-400 hover:text-[#14d1ff] transition-colors duration-300" href="/lobby">Home</a>
              <a className="text-slate-400 hover:text-[#14d1ff] transition-colors duration-300" href="/leaderboard">Ranks</a>
              <a className="text-[#00FFAB] transition-colors duration-300" href="/rewards">Rewards</a>
              <a className="text-slate-400 hover:text-[#14d1ff] transition-colors duration-300" href="/profile">Profile</a>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-highest border-2 border-primary-container/30 overflow-hidden flex items-center justify-center">
              <MaterialIcon icon="person" className="text-on-surface-variant" />
            </div>
          </>
        }
      />

      <main className="pt-24 pb-32 px-6 max-w-5xl mx-auto">
        {/* Profile Stats Section */}
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-8 stadium-glow">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-container/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-primary-container shadow-[0_0_20px_rgba(0,255,171,0.2)] bg-surface-container-highest flex items-center justify-center">
                    <MaterialIcon icon="person" className="text-4xl text-primary-container" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-secondary-container text-on-secondary-container text-[10px] font-black px-2 py-1 rounded uppercase tracking-tighter">
                    LVL 24
                  </div>
                </div>
                <div>
                  <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface uppercase mb-1">
                    JAFFA MASTER
                  </h1>
                  <p className="font-label text-xs text-primary-container tracking-[0.2em] font-bold uppercase">
                    Pro Predictor
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 md:gap-12 w-full md:w-auto">
                <div className="text-center md:text-left">
                  <span className="block font-label text-[10px] text-slate-500 uppercase tracking-widest mb-1">Matches</span>
                  <span className="font-headline text-3xl font-black text-on-surface">24</span>
                </div>
                <div className="text-center md:text-left">
                  <span className="block font-label text-[10px] text-slate-500 uppercase tracking-widest mb-1">Win Rate</span>
                  <span className="font-headline text-3xl font-black text-secondary-container">68%</span>
                </div>
                <div className="text-center md:text-left">
                  <span className="block font-label text-[10px] text-slate-500 uppercase tracking-widest mb-1">Best Streak</span>
                  <span className="font-headline text-3xl font-black text-primary-container">12</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Rewards Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-headline text-2xl font-bold tracking-tight uppercase">Unlocked Rewards</h2>
            <div className="h-px flex-1 bg-white/5 mx-6"></div>
            <button className="font-label text-[10px] font-bold text-primary-container border border-primary-container/30 px-4 py-2 rounded uppercase tracking-widest hover:bg-primary-container/10 transition-colors">
              History
            </button>
          </div>

          {/* Rewards Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rewards.map((reward) => (
              <div
                key={reward.id}
                className={`${
                  reward.active
                    ? "group relative overflow-hidden rounded-xl bg-surface-container-high hover:bg-surface-container-highest transition-all duration-300"
                    : "relative overflow-hidden rounded-xl bg-surface-container-low opacity-60"
                } ${reward.hasFlipHint ? "reward-flip-hint" : ""} ${reward.hasGlow ? "stadium-glow" : ""}`}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`w-12 h-12 rounded-lg ${reward.iconBg} flex items-center justify-center`}>
                      <MaterialIcon icon={reward.icon} className={reward.iconColor} />
                    </div>
                    <span className={`font-label text-[10px] font-black ${reward.badgeColor} px-2 py-1 rounded`}>
                      {reward.badge}
                    </span>
                  </div>
                  <h3 className={`font-headline text-xl font-bold leading-tight mb-2 uppercase ${
                    reward.active ? "text-on-surface" : "text-slate-500"
                  }`}>
                    {reward.title}
                  </h3>
                  <p className={`font-body text-sm mb-8 ${reward.active ? "text-slate-400" : "text-slate-600"}`}>
                    {reward.description}
                  </p>
                  {reward.active ? (
                    <button
                      onClick={() => handleReveal(reward.id)}
                      className="w-full py-4 bg-primary-container text-on-primary-container font-label text-xs font-black uppercase tracking-[0.2em] rounded group-hover:shadow-[0_0_20px_rgba(0,255,171,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      {revealedCodes.has(reward.id) ? "JAFFA-" + reward.id.padStart(4, "0") : "Reveal Code"}
                      <MaterialIcon icon={revealedCodes.has(reward.id) ? "content_copy" : "lock_open"} className="text-sm" />
                    </button>
                  ) : (
                    <button
                      className="w-full py-4 bg-surface-container-highest text-slate-600 font-label text-xs font-black uppercase tracking-[0.2em] rounded flex items-center justify-center gap-2 cursor-not-allowed"
                      disabled
                    >
                      Claimed
                      <MaterialIcon icon="check_circle" className="text-sm" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* BottomNavBar Shell (Mobile only) */}
      <BottomNav />
    </div>
  );
}
