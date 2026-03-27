"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiCastle, GiPodiumWinner, GiTrophyCup, GiMeeple } from "react-icons/gi";

const navItems = [
  { key: "home", href: "/lobby", icon: GiCastle, label: "Home" },
  { key: "leaderboard", href: "/leaderboard", icon: GiPodiumWinner, label: "Ranks" },
  { key: "rewards", href: "/rewards", icon: GiTrophyCup, label: "Rewards" },
  { key: "profile", href: "/profile", icon: GiMeeple, label: "Profile" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] border-t-[3px] border-[#ff6341]"
      style={{ boxShadow: "0 -4px 0 0 #000000" }}
    >
      <div className="flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const isActive =
            item.key === "home"
              ? pathname === "/lobby" ||
                pathname?.startsWith("/match/") ||
                pathname === "/"
              : pathname === item.href || pathname?.startsWith(item.href + "/");

          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              href={item.href}
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
