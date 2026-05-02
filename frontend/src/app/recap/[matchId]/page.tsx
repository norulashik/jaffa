"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Trophy, Zap, Target, Flame, TrendingDown, TrendingUp, AlertTriangle, HelpCircle } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";

type Story = Awaited<ReturnType<typeof api.getMyStory>>;

const BEAT_ICON: Record<string, any> = {
  signature_call: Flame,
  hot_streak: TrendingUp,
  clutch: Trophy,
  bold_badge: Zap,
  all_in_burn: AlertTriangle,
  slow_start: TrendingDown,
  quiet_ending: TrendingDown,
};

const BEAT_COLOR: Record<string, string> = {
  signature_call: "#ff6341",
  hot_streak: "#22c55e",
  clutch: "#ffd60a",
  bold_badge: "#ff6341",
  all_in_burn: "#6b7280",
  slow_start: "#6b7280",
  quiet_ending: "#6b7280",
};

export default function RecapPage() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const matchId = String(params?.matchId || "");
  const venueId =
    (search?.get("venueId")) ||
    (typeof window !== "undefined" ? localStorage.getItem("jaffa_venue_id") : null) ||
    "";

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;
    if (!token) { router.replace("/login"); return; }

    if (!matchId || !venueId) { setLoading(false); setError("No match context"); return; }

    api.getMyStory(matchId, venueId, localStorage.getItem("jaffa_room_id"))
      .then((s) => setStory(s))
      .catch((e) => setError(e?.message || "Failed to load recap"))
      .finally(() => setLoading(false));
  }, [matchId, venueId, router]);

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen">
      <Header />
      <main className="pt-24 pb-32 px-4 max-w-2xl mx-auto">
        <h2
          className="text-4xl font-extrabold tracking-tight mb-6 uppercase"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          MATCH RECAP
        </h2>

        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-8 h-8 animate-spin rounded-[2px]"
              style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }}
            />
          </div>
        ) : error || !story ? (
          <div className="game-card flex flex-col items-center py-12 text-center">
            <HelpCircle size={48} className="text-[#6b7280] mb-4" />
            <h3
              className="text-xl font-bold text-white mb-2 uppercase"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              NO RECAP YET
            </h3>
            <p className="text-sm text-[#6b7280] max-w-[280px]">
              {error || "Nothing to recap — come back after some picks are resolved."}
            </p>
          </div>
        ) : (
          <>
            {/* Tone line — top billing */}
            <div className="game-card mb-4">
              <p className="text-lg font-bold text-white mb-2">{story.toneLine}</p>
              <div className="flex items-center gap-3 text-xs text-[#6b7280] flex-wrap">
                <span>
                  <span className="text-[#22c55e] font-bold">{story.summary.right}</span> right /{" "}
                  <span className="text-[#ff6341] font-bold">{story.summary.wrong}</span> wrong
                </span>
                <span>• {story.summary.accuracy}% accuracy</span>
                <span>• {story.summary.totalPoints} pts</span>
              </div>
            </div>

            {/* Beats */}
            {story.beats.length === 0 ? (
              <p className="text-xs text-[#6b7280] italic text-center py-6">
                A quiet match. Nothing dramatic — just honest picks.
              </p>
            ) : (
              <div className="space-y-3">
                {story.beats.map((beat, i) => {
                  const Icon = BEAT_ICON[beat.type] || Target;
                  const color = BEAT_COLOR[beat.type] || "#ffffff";
                  return (
                    <motion.div
                      key={`${beat.type}-${i}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="game-card flex items-start gap-3"
                    >
                      <div
                        className="flex items-center justify-center shrink-0"
                        style={{ width: 36, height: 36, background: `${color}20`, borderRadius: 6 }}
                      >
                        <Icon size={18} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white mb-0.5">{beat.title}</p>
                        <p className="text-xs text-[#b7bcc4] leading-relaxed">{beat.detail}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
