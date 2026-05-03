"use client";

// 5v5 results page. Two states:
//   - status === "voided"       → soft message, no scoring.
//   - status === "completed"    → big winner banner, MOTM card, full
//                                 5-a-side scoreboard with per-role banana
//                                 badges + win/loss highlights.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Trophy } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import {
  fiveVsFiveApi,
  ROLE_VIEW,
  type FiveVsFiveResultDto,
  type RoleNumber,
  type TeamSide,
} from "@/lib/fiveVsFiveApi";

export default function FiveVsFiveResults() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId as string;
  const [data, setData] = useState<FiveVsFiveResultDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("jaffa_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const r = await fiveVsFiveApi.getResults(roomId);
        setData(r);
      } finally {
        setLoading(false);
      }
    })();
  }, [roomId, router]);

  if (loading) {
    return (
      <div className="bg-[#0d0d0d] text-white min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#6b7280] w-7 h-7" />
      </div>
    );
  }
  if (!data) return null;

  if (data.status === "voided") {
    return (
      <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
        <Header />
        <main className="pt-24 px-4 max-w-2xl mx-auto space-y-5">
          <section className="game-card p-8 text-center">
            <div className="text-5xl mb-3">🥲</div>
            <h2 className="text-2xl font-black uppercase mb-2" style={{ fontFamily: "'Bungee', cursive" }}>
              Room Voided
            </h2>
            <p className="text-[#9ca3af] text-sm">
              This room didn&apos;t fill all 10 slots before the match started, so no points or bananas were awarded.
            </p>
            <button
              onClick={() => router.push("/5v5")}
              className="mt-6 btn-sticker btn-orange px-6 py-2.5 text-sm"
            >
              Back to 5v5
            </button>
          </section>
        </main>
        <BottomNav />
      </div>
    );
  }

  const summary = data.summary;
  if (!summary) {
    return (
      <div className="bg-[#0d0d0d] text-white min-h-screen flex items-center justify-center">
        <p className="text-[#9ca3af] text-sm">Results not ready yet — check back after the match.</p>
      </div>
    );
  }

  const t1Short = data.match?.team1Short || data.match?.team1 || "Team 1";
  const t2Short = data.match?.team2Short || data.match?.team2 || "Team 2";
  const winnerShort =
    summary.winnerTeam === "team1" ? t1Short
    : summary.winnerTeam === "team2" ? t2Short
    : "TIED";

  // Index per-user data for the scoreboard.
  const perUserById = new Map(summary.perUser.map((p) => [p.userId, p]));
  const userById = new Map(data.slots.map((s) => [s.userId, s.user]));

  const motms = summary.motmUserIds
    .map((id) => ({ id, user: userById.get(id) || null, points: perUserById.get(id)?.points ?? 0 }))
    .filter((m) => m.user);

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 max-w-2xl mx-auto space-y-5">
        {/* Winner banner */}
        <motion.section
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="game-card p-6 text-center"
          style={{
            background: summary.winnerTeam === "tie" ? "#1a1a1a" : "rgba(255,214,10,0.06)",
            borderColor: "#ffd60a",
            boxShadow: "6px 6px 0 0 #ffd60a",
          }}
        >
          <div className="text-[10px] uppercase tracking-widest text-[#9ca3af] font-bold mb-2">
            Winner
          </div>
          <div className="text-4xl font-black uppercase mb-1" style={{ fontFamily: "'Bungee', cursive", color: "#ffd60a" }}>
            {winnerShort} {summary.winnerTeam !== "tie" && "🍌"}
          </div>
          <div className="text-xs text-[#9ca3af]">
            Team totals: <span className="text-white font-bold">{summary.teamTotals.team1}</span> · <span className="text-white font-bold">{summary.teamTotals.team2}</span>
          </div>
        </motion.section>

        {/* MOTM */}
        {motms.length > 0 && (
          <motion.section
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="game-card p-5 text-center"
            style={{ borderColor: "#ff6341", boxShadow: "4px 4px 0 0 #ff6341" }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-[#ff6341]" />
              <div className="text-[10px] uppercase tracking-widest text-[#ff6341] font-bold">
                Player of the Match
              </div>
            </div>
            <div className="space-y-2">
              {motms.map((m) => (
                <div key={m.id}>
                  <div
                    className="text-2xl font-black uppercase"
                    style={{ fontFamily: "'Bungee', cursive" }}
                  >
                    {m.user?.displayName}
                  </div>
                  <div className="text-xs text-[#9ca3af] mt-0.5">
                    <span className="text-white font-bold">{m.points}</span> pts
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Per-role scoreboard */}
        <section className="space-y-3">
          <h3
            className="text-base font-black uppercase pl-3"
            style={{ fontFamily: "'Bungee', cursive", borderLeft: "4px solid #3b9eff" }}
          >
            Role-by-role
          </h3>
          {([1, 2, 3, 4, 5] as RoleNumber[]).map((role) => {
            const t1 = data.slots.find((s) => s.role === role && s.teamSide === "team1");
            const t2 = data.slots.find((s) => s.role === role && s.teamSide === "team2");
            const t1Pts = t1 ? perUserById.get(t1.userId)?.points ?? 0 : 0;
            const t2Pts = t2 ? perUserById.get(t2.userId)?.points ?? 0 : 0;
            const winner: TeamSide | "tie" = summary.roleWinners[role];
            const view = ROLE_VIEW[role];
            return (
              <div
                key={role}
                className="game-card p-3"
                style={{ borderColor: `${view.color}66` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base leading-none">{view.emoji}</span>
                  <span
                    className="text-[11px] font-black uppercase tracking-wider"
                    style={{ color: view.color, fontFamily: "'Bungee', cursive" }}
                  >
                    {view.title}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <RoleSide
                    name={t1?.user?.displayName || "—"}
                    points={t1Pts}
                    won={winner === "team1"}
                    bananas={t1 ? perUserById.get(t1.userId)?.bananas ?? 0 : 0}
                    accent="#ff6341"
                  />
                  <RoleSide
                    name={t2?.user?.displayName || "—"}
                    points={t2Pts}
                    won={winner === "team2"}
                    bananas={t2 ? perUserById.get(t2.userId)?.bananas ?? 0 : 0}
                    accent="#3b9eff"
                  />
                </div>
              </div>
            );
          })}
        </section>

        <button
          onClick={() => router.push("/5v5")}
          className="w-full btn-sticker btn-orange py-3 text-sm font-bold uppercase"
        >
          Back to 5v5 Lobby
        </button>
      </main>

      <BottomNav />
    </div>
  );
}

function RoleSide({
  name,
  points,
  won,
  bananas,
  accent,
}: {
  name: string;
  points: number;
  won: boolean;
  bananas: number;
  accent: string;
}) {
  return (
    <div
      className="rounded px-3 py-2"
      style={{
        background: won ? "rgba(34,197,94,0.10)" : "#0d0d0d",
        border: `1px solid ${won ? "#22c55e" : "#2a2a2a"}`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-bold text-white text-xs truncate" style={{ color: accent }}>
          {name}
        </span>
        {won && (
          <span className="text-[9px] font-black uppercase text-[#22c55e]">WIN</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px]">
        <span className="text-[#9ca3af]">
          <span className="text-white font-bold">{points}</span> pts
        </span>
        {bananas > 0 && (
          <span className="text-[#ffd60a] font-bold">+{bananas} 🍌</span>
        )}
      </div>
    </div>
  );
}
