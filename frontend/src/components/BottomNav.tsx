"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MaterialIcon from "./MaterialIcon";
import { useGame } from "@/context/GameContext";

export default function BottomNav() {
  const pathname = usePathname();
  const { state } = useGame();
  const [prefix, setPrefix] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const slug = localStorage.getItem("jaffa_venue_slug");
    if (slug) setPrefix(`/cafe/${slug}`);
    setMounted(true);
  }, []);

  // Only link to match if context still has it (cleared when match completes)
  const matchId = state.matchId;
  const homeHref = `${prefix}${matchId ? `/match/${matchId}` : "/lobby"}`;

  const navItems = [
    { key: "home", href: homeHref, icon: "home", label: "Home" },
    { key: "leaderboard", href: `${prefix}/leaderboard`, icon: "leaderboard", label: "Ranks" },
    { key: "my-picks", href: `${prefix}/my-picks`, icon: "psychology", label: "My Picks" },
    { key: "rewards", href: `${prefix}/rewards`, icon: "military_tech", label: "Rewards" },
  ];

  // Don't render links until client-side prefix is resolved (prevents hydration mismatch)
  if (!mounted) {
    return (
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-[#111317]/80 backdrop-blur-2xl rounded-t-[2rem] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
        {navItems.map((item) => (
          <div key={item.key} className="flex flex-col items-center justify-center text-slate-500 px-4 py-1">
            <MaterialIcon icon={item.icon} className="mb-1" />
            <span className="font-[family-name:var(--font-label)] text-[10px] font-bold uppercase tracking-widest">
              {item.label}
            </span>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-[#111317]/80 backdrop-blur-2xl rounded-t-[2rem] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
      {navItems.map((item) => {
        const isActive = item.key === "home"
          ? pathname === "/lobby" || pathname?.startsWith("/match/") || pathname?.includes("/lobby") || pathname?.includes("/match/")
          : pathname === item.href || pathname?.startsWith(item.href + "/") || pathname?.includes(`/${item.key}`);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`flex flex-col items-center justify-center active:scale-95 transition-all duration-200 ease-out ${
              isActive
                ? "text-[#00FFAB] bg-[#00FFAB]/10 rounded-xl px-4 py-1 shadow-[0_0_15px_rgba(0,255,171,0.3)]"
                : "text-slate-500 hover:text-[#14d1ff]"
            }`}
          >
            <MaterialIcon
              icon={item.icon}
              filled={isActive}
              className="mb-1"
            />
            <span className="font-[family-name:var(--font-label)] text-[10px] font-bold uppercase tracking-widest">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
