"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiCastle, GiPodiumWinner, GiSwordWound, GiAlarmClock } from "react-icons/gi";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";
import { useGame } from "@/context/GameContext";

// Tab IDs are stable; labels were renamed in the UX redesign
// ("Week Pts" → "Past Battles") and the destination changed from /redeem to
// /past-battles. The weekly-points readout moved into the profile page so
// the bottom nav can stay focused on navigation rather than mixing in a
// status badge.
const navItems = [
  { key: "home", href: "/lobby", icon: GiCastle, label: "Home" },
  { key: "leaderboard", href: "/leaderboard", icon: GiPodiumWinner, label: "Ranks" },
  { key: "past-battles", href: "/past-battles", icon: GiSwordWound, label: "Past Battles" },
  { key: "my-picks", href: "/my-picks", icon: GiAlarmClock, label: "My Picks" },
];

export default function BottomNav() {
  const { state } = useGame();
  const pathname = usePathname();
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
          // HOME single-tap progression:
          //   - on Ranks / My Picks / Past Battles with an active match → /match/<id>
          //   - on /match/<activeMatchId>                               → /lobby
          //   - no active match                                         → /lobby
          // Replaces the previous "Home always = /match/<id>, double-tap = /lobby"
          // which left users tapping Home from the match page with no
          // visible result. The progression matches the user's mental
          // model: tap Home to "back out" one level at a time.
          const isOnActiveMatch = !!activeMatchId &&
            !!normalizedPathname?.startsWith(`/match/${activeMatchId}`);
          const homeHref = activeMatchId && !isOnActiveMatch
            ? `/match/${activeMatchId}${activeVenueId ? `?venueId=${activeVenueId}` : ""}`
            : "/lobby";

          // For Ranks (/leaderboard) and My Picks (/my-picks), forward the
          // active match context as URL query params. The destination
          // pages prefer URL params over GameContext / localStorage so a
          // user who taps Ranks immediately after entering a past battle
          // never sees a "no active match" empty state due to a state
          // hydration race.
          const matchScopedQs = activeMatchId
            ? `?matchId=${activeMatchId}${activeVenueId ? `&venueId=${activeVenueId}` : ""}`
            : "";
          let href: string;
          if (item.key === "home") {
            href = homeHref;
          } else if (
            (item.key === "leaderboard" || item.key === "my-picks") &&
            activeMatchId
          ) {
            href = `${item.href}${matchScopedQs}`;
          } else {
            href = item.href;
          }
          const resolvedHref = mounted && isCafeRoute() ? cafeUrl(href) : href;
          const isActive =
            item.key === "home"
              ? normalizedPathname?.startsWith("/match/") ||
                (!activeMatchId && normalizedPathname === "/lobby")
              : item.key === "my-picks"
              ? normalizedPathname === "/my-picks"
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
              <div className="relative">
                <Icon className="text-2xl" />
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
