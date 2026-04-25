"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GiCastle, GiPodiumWinner, GiCrownCoin } from "react-icons/gi";
import { GiAlarmClock } from "react-icons/gi";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";
import { useGame } from "@/context/GameContext";

const navItems = [
  { key: "home", href: "/lobby", icon: GiCastle, label: "Home" },
  { key: "leaderboard", href: "/leaderboard", icon: GiPodiumWinner, label: "Ranks" },
  { key: "redeem", href: "/redeem", icon: GiCrownCoin, label: "Week Pts" },
  { key: "my-picks", href: "/my-picks", icon: GiAlarmClock, label: "My Picks" },
];

export default function BottomNav() {
  const { state } = useGame();
  const pathname = usePathname();
  const router = useRouter();
  const [storedMatchId, setStoredMatchId] = useState<string | null>(null);
  const [storedVenueId, setStoredVenueId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const normalizedPathname = pathname?.replace(/^\/cafe\/[^/]+/, "") || pathname || "/";
  const activeMatchId = state.matchId || storedMatchId;
  const activeVenueId = state.venueId || storedVenueId;

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    setStoredMatchId(localStorage.getItem("jaffa_match_id"));
    setStoredVenueId(localStorage.getItem("jaffa_venue_id"));
  }, [state.matchId, state.venueId, pathname]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] border-t-[3px] border-[#ff6341]"
      style={{ boxShadow: "0 -4px 0 0 #000000" }}
    >
      <div className="flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          // HOME with an active match scopes back to that match's page so the
          // user stays in the same "battle" context (same source for MyPicks
          // and Ranks). Lands on /lobby only when there's no active match.
          // venueId is appended so the match page can scope correctly.
          const href =
            item.key === "home" && activeMatchId
              ? `/match/${activeMatchId}${activeVenueId ? `?venueId=${activeVenueId}` : ""}`
              : item.href;
          const resolvedHref = mounted && isCafeRoute() ? cafeUrl(href) : href;
          const isActive =
            item.key === "home"
              ? normalizedPathname?.startsWith("/match/") ||
                (!activeMatchId && normalizedPathname === "/lobby")
              : item.key === "my-picks"
              ? normalizedPathname === "/my-picks"
              : normalizedPathname === item.href || normalizedPathname?.startsWith(item.href + "/");

          const Icon = item.icon;

          // Double-tap on HOME forces a jump to /lobby even if there's an
          // active match — escape hatch for the user who explicitly wants
          // the global home.
          const lobbyHref = mounted && isCafeRoute() ? cafeUrl("/lobby") : "/lobby";
          const handleDoubleClick = item.key === "home"
            ? (e: React.MouseEvent) => { e.preventDefault(); router.push(lobbyHref); }
            : undefined;

          return (
            <Link
              key={item.key}
              href={resolvedHref}
              onDoubleClick={handleDoubleClick}
              className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-[3px] transition-all ${
                isActive
                  ? "text-[#ff6341] border-b-[3px] border-[#ff6341]"
                  : "text-white/50 border-b-[3px] border-transparent hover:text-white/80"
              }`}
            >
              <div className="relative">
                <Icon className="text-2xl" />
                {item.key === "redeem" && (
                  <span
                    className="absolute -top-1.5 -right-3 bg-[#ff6341] text-black text-[8px] font-black px-1 rounded-[2px] leading-tight"
                    style={{ border: "1px solid #000" }}
                  >
                    {state.weeklyPoints}
                  </span>
                )}
              </div>
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
