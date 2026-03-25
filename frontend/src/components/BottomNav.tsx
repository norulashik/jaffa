"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import MaterialIcon from "./MaterialIcon";
import { useGame } from "@/context/GameContext";

const staticNavItems = [
  { key: "home", icon: "home", label: "Home" },
  { key: "leaderboard", href: "/leaderboard", icon: "leaderboard", label: "Ranks" },
  { key: "rewards", href: "/rewards", icon: "military_tech", label: "Rewards" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { state } = useGame();

  const matchId = state.matchId || (typeof window !== "undefined" ? localStorage.getItem("jaffa_match_id") : null);
  const homeHref = matchId ? `/match/${matchId}` : "/lobby";

  const navItems = staticNavItems.map((item) =>
    item.key === "home" ? { ...item, href: homeHref } : item
  );

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-[#111317]/80 backdrop-blur-2xl rounded-t-[2rem] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
      {navItems.map((item) => {
        const isActive = item.key === "home"
          ? pathname === "/lobby" || pathname?.startsWith("/match/")
          : pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.key}
            href={item.href!}
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
