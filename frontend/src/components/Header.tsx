"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GiCrownCoin, GiAlarmClock } from "react-icons/gi";
import { useGame } from "@/context/GameContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Header() {
  const { state } = useGame();
  const router = useRouter();

  const initial = state.user?.displayName
    ? state.user.displayName.charAt(0).toUpperCase()
    : "?";

  return (
    <header
      className="sticky top-0 z-50 bg-[#1a1a1a] border-b-[3px] border-[#ff6341]"
      style={{ boxShadow: "0 4px 0 0 #000000" }}
    >
      <div className="flex items-center justify-between px-4 py-1">
        {/* Left: Logo */}
        <Link href="/lobby" className="flex-shrink-0">
          <img
            src="/jaffa-logo.png"
            alt="JAFFA"
            className="h-10 sm:h-12 w-auto object-contain"
          />
        </Link>

        {/* Right: Points, Notifications, Profile */}
        <div className="flex items-center gap-3">
          {/* Points chip */}
          <div
            className="flex items-center gap-1.5 bg-[#ff6341] text-black px-3 py-1.5 rounded-[3px] border-2 border-black"
            style={{ boxShadow: "3px 3px 0 0 #000000" }}
          >
            <GiCrownCoin className="text-lg" />
            <span className="font-black text-sm tracking-wide">
              {state.totalPoints}
            </span>
          </div>

          {/* Notification button */}
          <button
            onClick={() => router.push("/my-picks")}
            className="relative bg-[#0d0d0d] border-2 border-[#2a2a2a] rounded-[3px] p-2 hover:border-[#ff6341] transition-colors"
            style={{ boxShadow: "2px 2px 0 0 #2a2a2a" }}
          >
            <GiAlarmClock className="text-xl text-white/70" />
          </button>

          {/* Profile button */}
          <button
            onClick={() => router.push("/profile")}
            className="border-2 border-[#ff6341] rounded-[3px] overflow-hidden"
            style={{ boxShadow: "2px 2px 0 0 #ff6341" }}
          >
            <Avatar className="size-9 rounded-[2px]">
              <AvatarFallback className="bg-[#ff6341] text-black font-black text-sm rounded-[2px]">
                {initial}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>
    </header>
  );
}
