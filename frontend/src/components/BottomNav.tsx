"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiCastle, GiPodiumWinner, GiTrophyCup, GiMeeple } from "react-icons/gi";
import { cafeUrl } from "@/lib/navigation";
import { useGame } from "@/context/GameContext";

const navItems = [
  { key: "home", href: "/lobby", icon: GiCastle, label: "Home" },
  { key: "leaderboard", href: "/leaderboard", icon: GiPodiumWinner, label: "Ranks" },
  { key: "rewards", href: "/rewards", icon: GiTrophyCup, label: "Rewards" },
  { key: "profile", href: "/profile", icon: GiMeeple, label: "Profile" },
];

export default function BottomNav() {
  const { state } = useGame();
  const pathname = usePathname();
  const [storedMatchId, setStoredMatchId] = useState<string | null>(null);
  const normalizedPathname = pathname?.replace(/^\/cafe\/[^/]+/, "") || pathname || "/";
  const activeMatchId = state.matchId || storedMatchId;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStoredMatchId(localStorage.getItem("jaffa_match_id"));
  }, [state.matchId, pathname]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] border-t-[3px] border-[#ff6341]"
      style={{ boxShadow: "0 -4px 0 0 #000000" }}
    >
      <div className="flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const href =
            item.key === "home" && activeMatchId
              ? `/match/${activeMatchId}`
              : item.href;
          const resolvedHref = cafeUrl(href) || href;
          const isActive =
            item.key === "home"
              ? normalizedPathname?.startsWith("/match/") ||
                (!activeMatchId && normalizedPathname === "/lobby")
              : normalizedPathname === item.href || normalizedPathname?.startsWith(item.href + "/");

          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              href={resolvedHref}
              className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-[3px] transition-all ${
                isActive
                  ? "text-[#ff6341] border-b-[3px] border-[#ff6341]"
                  : "text-white/50 border-b-[3px] border-transparent hover:text-white/80"
              }`}
            >
              <Icon className="text-2xl" />
              <span className="text-[10px] font-black uppercase tracking-wider">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
