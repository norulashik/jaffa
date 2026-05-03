"use client";

// Personal dashboard rendered at the top of /lobby. Three pieces:
//   1. Accuracy ring     — circular progress, % at center, "Accuracy" below.
//                           Subtle streak chip overlaid for an at-a-glance
//                           "you're on a heater" cue.
//   2. Region rank card  — "#1" big, "in Hyderabad" below (city preferred,
//                           falls back to state, then a CTA to set location).
//   3. Lifetime points   — "500" big, "Lifetime points" below.
//
// All data comes from a single /auth/stats call (cityRank + stateRank were
// added there for this dashboard so we don't need a second leaderboard
// fetch on home).

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Flame, MapPin, Star } from "lucide-react";
import { api } from "@/lib/api";

type Stats = {
  matchesPlayed: number;
  totalCorrect: number;
  totalPredictions: number;
  accuracy: number;
  lifetimePoints: number;
  city: string | null;
  state: string | null;
  cityRank: number | null;
  cityTotal: number;
  stateRank: number | null;
  stateTotal: number;
};

const SIZE = 168;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export default function HomeDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getUserStats()
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { /* keep skeleton on failure */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Prefer city for the region rank — that's the "in Hyderabad #1" framing
  // the product brief asked for. Fall back to state, then to a "set
  // location" CTA when neither is on file.
  const regionLabel = stats?.city || stats?.state || null;
  const regionRank = stats?.city
    ? stats?.cityRank
    : stats?.state
    ? stats?.stateRank
    : null;
  const regionTotal = stats?.city ? stats?.cityTotal : stats?.stateTotal;

  const accuracy = stats?.accuracy ?? 0;
  const dashOffset = CIRC * (1 - accuracy / 100);

  return (
    <div className="space-y-4">
      {/* Accuracy ring */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="game-card p-5 flex flex-col items-center"
      >
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} className="-rotate-90">
            {/* track */}
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              stroke="#1f1f1f" strokeWidth={STROKE} fill="none"
            />
            {/* progress */}
            <motion.circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              stroke="#ff6341"
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={CIRC}
              initial={{ strokeDashoffset: CIRC }}
              animate={{ strokeDashoffset: loading ? CIRC : dashOffset }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="text-5xl font-black text-white leading-none"
              style={{ fontFamily: "'Bungee', cursive" }}
            >
              {loading ? "—" : `${accuracy}%`}
            </div>
            <div className="text-[10px] mt-1 font-bold uppercase tracking-widest text-[#9ca3af]">
              Accuracy
            </div>
          </div>
        </div>

        {/* Sub-stats line under the ring — predictions answered + streak chip */}
        <div className="mt-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider">
          <span className="text-[#9ca3af]">
            {stats?.totalCorrect ?? 0}/{stats?.totalPredictions ?? 0} correct
          </span>
          {stats?.matchesPlayed ? (
            <>
              <span className="text-[#3a3a3a]">•</span>
              <span className="flex items-center gap-1 text-[#ff6341]">
                <Flame className="w-3 h-3" /> {stats.matchesPlayed} battles
              </span>
            </>
          ) : null}
        </div>
      </motion.div>

      {/* Two stat squares */}
      <div className="grid grid-cols-2 gap-3">
        <StatSquare
          accent="#ffd60a"
          icon={<MapPin className="w-3 h-3" />}
          big={
            loading ? "—"
            : !regionLabel ? "—"
            : regionRank ? `#${regionRank}` : "—"
          }
          captionTop={regionLabel ? "Rank in" : "Region"}
          captionBottom={
            !regionLabel
              ? <Link href="/profile" className="underline">Set location</Link>
              : regionLabel
          }
          subline={regionRank && regionTotal ? `of ${regionTotal}` : null}
        />
        <StatSquare
          accent="#ff6341"
          icon={<Star className="w-3 h-3" />}
          big={loading ? "—" : (stats?.lifetimePoints ?? 0).toLocaleString()}
          captionTop="Lifetime"
          captionBottom="Points"
        />
      </div>
    </div>
  );
}

function StatSquare({
  accent,
  icon,
  big,
  captionTop,
  captionBottom,
  subline,
}: {
  accent: string;
  icon: React.ReactNode;
  big: React.ReactNode;
  captionTop: React.ReactNode;
  captionBottom: React.ReactNode;
  subline?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="game-card p-4 flex flex-col items-center text-center"
      style={{ borderColor: accent, boxShadow: `4px 4px 0 0 ${accent}` }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
        style={{ color: accent }}
      >
        {icon} {captionTop}
      </div>
      <div
        className="text-4xl font-black text-white mt-1 mb-0.5"
        style={{ fontFamily: "'Bungee', cursive" }}
      >
        {big}
      </div>
      <div className="text-xs font-bold text-white/80 leading-tight">
        {captionBottom}
      </div>
      {subline && (
        <div className="text-[10px] text-[#6b7280] mt-1">{subline}</div>
      )}
    </motion.div>
  );
}
