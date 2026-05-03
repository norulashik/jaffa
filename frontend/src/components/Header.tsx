"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/context/GameContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";
import NotificationBell from "@/components/NotificationBell";
import { ShoppingBag } from "lucide-react";

export default function Header() {
  const { state } = useGame();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const homeHref = mounted && isCafeRoute() ? cafeUrl("/lobby") : "/lobby";
  const profileHref = mounted && isCafeRoute() ? cafeUrl("/profile") : "/profile";
  const initial = state.user?.displayName
    ? state.user.displayName.charAt(0).toUpperCase()
    : "?";

  return (
    <header
      className="sticky top-0 z-50 bg-[#1a1a1a] border-b-[3px] border-[#ff6341]"
      style={{ boxShadow: "0 4px 0 0 #000000" }}
    >
      {/* 3-column layout: left controls | centered logo | right controls */}
      <div className="grid grid-cols-3 items-center px-3 py-2 relative">
        {/* Left: spacer for grid balance */}
        <div />

        {/* Center: Logo — absolutely positioned so it doesn't push header height */}
        <div className="flex justify-center">
          <Link
            href={homeHref}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
          >
            <img
              src="/jaffa-logo.png"
              alt="JAFFA"
              style={{ height: "120px", width: "auto", maxWidth: "280px", objectFit: "contain" }}
            />
          </Link>
        </div>

        {/* Right: Bell + Profile avatar */}
        <div className="flex items-center justify-end gap-2">
          <NotificationBell />
          <button
            type="button"
            aria-label="Store"
            className="border-2 border-[#ff6341] rounded-[3px] w-9 h-9 flex items-center justify-center bg-[#1a1a1a]"
            style={{ boxShadow: "2px 2px 0 0 #ff6341" }}
          >
            <ShoppingBag className="w-4 h-4 text-[#ff6341]" />
          </button>
          <button
            onClick={() => router.push(profileHref)}
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
