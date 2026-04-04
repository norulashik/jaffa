"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { Target, HelpCircle } from "lucide-react";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { cafeUrl } from "@/lib/navigation";

const getCategoryLabel = (pred: any) => {
  if (pred.category === "per_over") return `Over ${pred.overNumber || ""}`;
  if (pred.category === "hot_take") return "Hot Take";
  if (pred.category === "rivalry_call") return "Rivalry Call";
  if (pred.category === "bold_call") return "Bold Call";
  if (pred.category === "pre_match") return "Pre-Match";
  return pred.category?.replace(/_/g, " ") || "Predict";
};

const getOptionLabel = (pred: any, key: string) =>
  pred.options?.find((o: any) => (o.key || o.label) === key)?.label || key;

export default function MyPicksPage() {
  const { state } = useGame();
  const router = useRouter();
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"correct" | "wrong" | "all" | "pending">("all");

  const matchId = state.matchId || (typeof window !== "undefined" ? localStorage.getItem("jaffa_match_id") : null);
  const venueId = state.venueId || (typeof window !== "undefined" ? localStorage.getItem("jaffa_venue_id") : null);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(cafeUrl("/login"));
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
  const allPicks = [...answeredPreds].reverse();

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

            {/* Filtered picks */}
            <div className="space-y-3">
              {allPicks.filter((pred: any) => {
                const selectedKey = pred.userAnswer?.selectedOption;
                const isClosed = pred.status === "resolved";
                switch (activeFilter) {
                  case "correct": return isClosed && selectedKey && selectedKey === pred.correctOption;
                  case "wrong": return isClosed && selectedKey && selectedKey !== pred.correctOption;
                  case "pending": return selectedKey && !isClosed;
                  case "all": return true;
                }
              }).map((pred: any) => {
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
                        {getCategoryLabel(pred)}
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
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
