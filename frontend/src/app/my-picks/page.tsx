"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { Target, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";

const getCategoryLabel = (pred: any, currentOver?: number) => {
  if (pred.category === "per_over") {
    const n = pred.overNumber;
    // Live player questions piggyback on category="per_over" but carry subjectType.
    if (pred.subjectType === "batsman_innings") return "Live: at crease";
    if (pred.subjectType === "bowler_innings") return "Live: bowling";
    if (n == null) return "Over";
    if (currentOver != null) {
      if (n === currentOver) return `Over ${n} — live`;
      if (n === currentOver + 1) return `Next over`;
    }
    return `Over ${n}`;
  }
  if (pred.category === "hot_take") return "Hot Take";
  if (pred.category === "rivalry_call") return "Rivalry Call";
  if (pred.category === "bold_call") return "Bold Call";
  if (pred.category === "pre_match") return "Pre-Match";
  return pred.category?.replace(/_/g, " ") || "Predict";
};

const getOptionLabel = (pred: any, key: string) =>
  pred.options?.find((o: any) => (o.key || o.label) === key)?.label || key;

type ScopeAgg = { totalAnswered: number; correctCount: number; correctPct: number };

const bandLabel = (pct: number): string | null => {
  if (pct <= 0 || pct > 50) return null;
  if (pct <= 5) return "top 5% — elite call";
  if (pct <= 10) return "top 10%";
  if (pct <= 25) return "top 25%";
  return "top 50%";
};

// Spotify-style percentile badge: only shown for resolved+correct picks
// where at least one scope (global or venue) had ≤50% correct. Leads with
// the tighter (rarer-correct) scope. Requires a minimum sample so a single
// lucky pick doesn't read as "top 1%".
const MIN_SAMPLE = 5;
function PercentileBadge({ aggregates }: { aggregates: { global?: ScopeAgg; venue?: ScopeAgg } | null | undefined }) {
  if (!aggregates) return null;

  const g = aggregates.global && aggregates.global.totalAnswered >= MIN_SAMPLE ? aggregates.global : undefined;
  const v = aggregates.venue && aggregates.venue.totalAnswered >= MIN_SAMPLE ? aggregates.venue : undefined;

  const gLabel = g ? bandLabel(g.correctPct) : null;
  const vLabel = v ? bandLabel(v.correctPct) : null;
  if (!gLabel && !vLabel) return null;

  // Lead with the tighter scope (smaller correctPct = rarer correct = bigger flex).
  const gPct = g?.correctPct ?? Infinity;
  const vPct = v?.correctPct ?? Infinity;
  const leadIsVenue = vLabel && (!gLabel || vPct <= gPct);
  const primary = leadIsVenue ? `${vLabel} in your group` : `${gLabel} globally`;
  const secondary = leadIsVenue
    ? gLabel && `${gLabel} globally`
    : vLabel && `${vLabel} in your group`;

  return (
    <div className="mt-2 text-[11px] font-bold flex items-center gap-1 flex-wrap">
      <span style={{ color: "#22c55e" }}>🏆 You&apos;re in the {primary}</span>
      {secondary && <span className="text-[#6b7280]">· {secondary}</span>}
    </div>
  );
}

function MyPicksPageInner() {
  const { state } = useGame();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"correct" | "wrong" | "all" | "pending">("all");
  // Drawer state for the over-wise grouping (mirrors the in-match MY PICKS).
  // Empty Set = all collapsed; we add the user's tap targets to expand them.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Resolution order: URL query first (BottomNav forwards ?matchId=&venueId=
  // when the user taps My Picks from a match page — most authoritative,
  // immune to GameContext hydration races), then GameContext state, then
  // localStorage. Treat the strings "null"/"undefined" as missing — legacy
  // poison from old past-battle nav code.
  const readLs = (k: string) => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(k);
    return !v || v === "null" || v === "undefined" ? null : v;
  };
  const matchId =
    searchParams?.get("matchId") || state.matchId || readLs("jaffa_match_id");
  const venueId =
    searchParams?.get("venueId") || state.venueId || readLs("jaffa_venue_id");

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }

    if (matchId && venueId) {
      loadPredictions();
      const interval = setInterval(loadPredictions, 10000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [matchId, venueId, router]);

  const loadPredictions = async () => {
    if (!matchId || !venueId) return;
    try {
      const preds = await api.getPredictions(matchId, venueId);
      setPredictions(preds || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const answeredPreds = predictions.filter(
    (p: any) => p.userAnswer?.selectedOption
  );
  // Backend now returns predictions newest-first via createdAt DESC, so we
  // don't need to reverse here. Latest pick lands at the top of the list.
  const allPicks = [...answeredPreds];

  // Derive the current over from resolved per-over predictions: the highest
  // resolved overNumber is the most recently completed over, so the live over
  // is that + 1. Anything above the live over is "Next over" — the UI label.
  const resolvedOverNumbers = predictions
    .filter((p: any) => p.category === "per_over" && p.status === "resolved" && p.overNumber)
    .map((p: any) => p.overNumber as number);
  const currentOver = resolvedOverNumbers.length
    ? Math.max(...resolvedOverNumbers) + 1
    : undefined;

  // Stat counts
  const correctCount = answeredPreds.filter((p: any) => p.status === "resolved" && p.userAnswer?.selectedOption === p.correctOption).length;
  const wrongCount = answeredPreds.filter((p: any) => p.status === "resolved" && p.userAnswer?.selectedOption !== p.correctOption).length;
  const pendingCount = answeredPreds.filter((p: any) => p.status !== "resolved").length;

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen">
      <Header />

      <main className="pt-24 pb-32 px-4 max-w-2xl mx-auto">
        <h2
          className="text-4xl font-extrabold tracking-tight mb-6 uppercase"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          MY PICKS
        </h2>

        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-8 h-8 animate-spin rounded-[2px]"
              style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }}
            />
          </div>
        ) : !matchId || !venueId ? (
          <div className="game-card flex flex-col items-center py-12 text-center">
            <Target size={48} className="text-[#6b7280] mb-4" />
            <h3
              className="text-xl font-bold text-white mb-2 uppercase"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              NO ACTIVE MATCH
            </h3>
            <p className="text-sm text-[#6b7280] max-w-[240px]">
              Join a match to see your predictions!
            </p>
          </div>
        ) : allPicks.length === 0 ? (
          <div className="game-card flex flex-col items-center py-12 text-center">
            <HelpCircle size={48} className="text-[#6b7280] mb-4" />
            <h3
              className="text-xl font-bold text-white mb-2 uppercase"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              NO PICKS YET
            </h3>
            <p className="text-sm text-[#6b7280] max-w-[240px]">
              Make predictions during the match to see them here!
            </p>
          </div>
        ) : (
          <>
            {/* Filter buttons */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              <button
                onClick={() => setActiveFilter("correct")}
                className={`p-3 text-center cursor-pointer transition-all ${activeFilter === "correct" ? "card-green ring-2 ring-[#22c55e]" : "card-green"}`}
              >
                <div className="stat-number text-xl" style={{ color: "#22c55e" }}>
                  {correctCount}
                </div>
                <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold">Correct</div>
              </button>
              <button
                onClick={() => setActiveFilter("wrong")}
                className={`p-3 text-center cursor-pointer transition-all ${activeFilter === "wrong" ? "card-orange ring-2 ring-[#ff6341]" : "card-orange"}`}
              >
                <div className="stat-number text-xl" style={{ color: "#ff6341" }}>
                  {wrongCount}
                </div>
                <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold">Wrong</div>
              </button>
              <button
                onClick={() => setActiveFilter("all")}
                className={`p-3 text-center cursor-pointer transition-all ${activeFilter === "all" ? "game-card ring-2 ring-[#ff6341]" : "game-card"}`}
              >
                <div className="stat-number text-xl" style={{ color: "#ffffff" }}>
                  {allPicks.length}
                </div>
                <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold">All</div>
              </button>
              <button
                onClick={() => setActiveFilter("pending")}
                className={`p-3 text-center cursor-pointer transition-all ${activeFilter === "pending" ? "card-yellow ring-2 ring-[#ffd60a]" : "card-yellow"}`}
              >
                <div className="stat-number text-xl" style={{ color: "#ffd60a" }}>
                  {pendingCount}
                </div>
                <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold">Pending</div>
              </button>
            </div>

            {/* Filtered picks — bucketed into per-over drawers + an "Others"
                drawer (hot takes, bold/rivalry calls, live-player, pre-match,
                punter card). Each drawer is collapsed until tapped. */}
            {(() => {
              const filtered = allPicks.filter((pred: any) => {
                const selectedKey = pred.userAnswer?.selectedOption;
                const isClosed = pred.status === "resolved";
                switch (activeFilter) {
                  case "correct": return isClosed && selectedKey && selectedKey === pred.correctOption;
                  case "wrong": return isClosed && selectedKey && selectedKey !== pred.correctOption;
                  case "pending": return selectedKey && !isClosed;
                  case "all": return true;
                }
              });

              const overBuckets = new Map<number, any[]>();
              const others: any[] = [];
              for (const p of filtered) {
                if (p.category === "per_over" && typeof p.overNumber === "number") {
                  const arr = overBuckets.get(p.overNumber) || [];
                  arr.push(p);
                  overBuckets.set(p.overNumber, arr);
                } else {
                  others.push(p);
                }
              }
              // Latest over first — matches the "newest at top" theme.
              const overKeys = Array.from(overBuckets.keys()).sort((a, b) => b - a);

              const toggleGroup = (key: string) => {
                setExpandedGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              };

              const renderPickCard = (pred: any) => {
                const selectedKey = pred.userAnswer?.selectedOption;
                const selectedLabel = getOptionLabel(pred, selectedKey);
                const isClosed = pred.status === "resolved";
                const isCorrect = isClosed ? selectedKey === pred.correctOption : undefined;
                const pointsEarned = pred.userAnswer?.pointsEarned || (isCorrect ? (pred.options?.find((o: any) => (o.key || o.label) === selectedKey)?.points || 10) : 0);
                const correctAnswerLabel = isClosed && !isCorrect && pred.correctOption
                  ? getOptionLabel(pred, pred.correctOption)
                  : null;

                let statusText = "PENDING";
                let statusColor = "#ffd60a";
                let cardClass = "game-card";
                if (isClosed && isCorrect === true) {
                  statusText = `+${pointsEarned || 0} pts`;
                  statusColor = "#22c55e";
                  cardClass = "card-green";
                } else if (isClosed && isCorrect === false) {
                  statusText = "WRONG";
                  statusColor = "#ff6341";
                  cardClass = "card-orange";
                }

                return (
                  <motion.div
                    key={pred.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cardClass}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="info-pill">
                        {getCategoryLabel(pred, currentOver)}
                      </span>
                      <span className="text-xs font-bold" style={{ color: statusColor }}>
                        {statusText}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white mb-2">{pred.question}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs px-3 py-1 font-bold"
                        style={{
                          background: isClosed && isCorrect === false
                            ? "rgba(255, 99, 65, 0.15)"
                            : isClosed && isCorrect === true
                            ? "rgba(34, 197, 94, 0.15)"
                            : "#1a1a1a",
                          border: `2px solid ${
                            isClosed && isCorrect === false
                              ? "#ff6341"
                              : isClosed && isCorrect === true
                              ? "#22c55e"
                              : "#333"
                          }`,
                          borderRadius: "4px",
                          color: isClosed && isCorrect === false
                            ? "#ff6341"
                            : isClosed && isCorrect === true
                            ? "#22c55e"
                            : "#ccc",
                        }}
                      >
                        Your pick: {selectedLabel}
                      </span>
                      {correctAnswerLabel && (
                        <span className="text-xs text-[#6b7280]">
                          Answer: {correctAnswerLabel}
                        </span>
                      )}
                    </div>
                    {isClosed && isCorrect === false && pred.userAnswer?.feedbackText && (
                      <p className="text-xs mt-2 text-[#ff9b80] italic">
                        {pred.userAnswer.feedbackText}
                      </p>
                    )}
                    {isClosed && isCorrect === true && (
                      <PercentileBadge aggregates={pred.aggregates} />
                    )}
                  </motion.div>
                );
              };

              const renderGroup = (key: string, title: string, picks: any[]) => {
                if (picks.length === 0) return null;
                const open = expandedGroups.has(key);
                return (
                  <div key={key} className="border-2 border-[#2a2a2a] rounded-[3px] bg-[#0d0d0d]">
                    <button
                      onClick={() => toggleGroup(key)}
                      className="w-full flex justify-between items-center px-3 py-2.5"
                    >
                      <span className="text-xs font-black text-white/80 uppercase tracking-wider">
                        {title} ({picks.length})
                      </span>
                      {open ? (
                        <ChevronUp className="w-4 h-4 text-white/60" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-white/60" />
                      )}
                    </button>
                    {open && (
                      <div className="px-2 pb-2 space-y-2">
                        {picks.map(renderPickCard)}
                      </div>
                    )}
                  </div>
                );
              };

              if (filtered.length === 0) {
                return (
                  <div className="text-center text-white/40 text-sm font-bold uppercase tracking-wider py-10">
                    No picks in this filter
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {overKeys.map((n) =>
                    renderGroup(`over-${n}`, `Over ${n}`, overBuckets.get(n) || [])
                  )}
                  {renderGroup("others", "Others", others)}
                </div>
              );
            })()}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

// Suspense wrapper required because MyPicksPageInner reads
// useSearchParams (Next 16 errors during build otherwise). Fallback
// mirrors the page's idle background so there's no visible flash.
export default function MyPicksPage() {
  return (
    <Suspense fallback={<div className="bg-[#0d0d0d] text-white min-h-screen" />}>
      <MyPicksPageInner />
    </Suspense>
  );
}
