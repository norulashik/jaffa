"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";

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
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const matchId = state.matchId || (typeof window !== "undefined" ? localStorage.getItem("jaffa_match_id") : null);
  const venueId = state.venueId || (typeof window !== "undefined" ? localStorage.getItem("jaffa_venue_id") : null);

  useEffect(() => {
    if (matchId && venueId) {
      loadPredictions();
      const interval = setInterval(loadPredictions, 10000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [matchId, venueId]);

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

  // Filter into answered and missed
  const answeredPreds = predictions.filter(
    (p: any) => p.userAnswer?.selectedOption
  );
  const missedPreds = predictions.filter(
    (p: any) =>
      !p.userAnswer?.selectedOption &&
      p.status !== "open" &&
      p.category !== "pre_match"
  );
  const allPicks = [...answeredPreds, ...missedPreds].reverse();

  return (
    <div className="bg-background text-on-surface font-body min-h-screen">
      <Header
        rightContent={
          <div className="w-10 h-10 rounded-full border-2 border-[#00FFAB]/20 overflow-hidden active:scale-90 transition-transform cursor-pointer bg-surface-container-highest">
            <div className="w-full h-full flex items-center justify-center">
              <MaterialIcon icon="person" className="text-on-surface-variant" />
            </div>
          </div>
        }
      />

      <main className="pt-24 pb-32 px-4 max-w-2xl mx-auto">
        <h2 className="font-headline text-4xl font-extrabold tracking-tight mb-6">My Picks</h2>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !matchId || !venueId ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MaterialIcon icon="psychology" className="text-5xl text-on-surface-variant/30 mb-4" />
            <h3 className="font-headline text-xl font-bold text-on-surface mb-2">No active match</h3>
            <p className="font-body text-sm text-on-surface-variant max-w-[240px]">
              Join a match to see your predictions!
            </p>
          </div>
        ) : allPicks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MaterialIcon icon="quiz" className="text-5xl text-on-surface-variant/30 mb-4" />
            <h3 className="font-headline text-xl font-bold text-on-surface mb-2">No picks yet</h3>
            <p className="font-body text-sm text-on-surface-variant max-w-[240px]">
              Make predictions during the match to see them here!
            </p>
          </div>
        ) : (
          <>
            {/* Stats summary */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              <div className="bg-surface-container-low rounded-xl p-3 text-center border border-white/5">
                <div className="font-headline text-xl font-bold text-primary-container">
                  {answeredPreds.filter((p: any) => p.status === "resolved" && p.userAnswer?.selectedOption === p.correctOption).length}
                </div>
                <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Correct</div>
              </div>
              <div className="bg-surface-container-low rounded-xl p-3 text-center border border-white/5">
                <div className="font-headline text-xl font-bold text-error">
                  {answeredPreds.filter((p: any) => p.status === "resolved" && p.userAnswer?.selectedOption !== p.correctOption).length}
                </div>
                <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Wrong</div>
              </div>
              <div className="bg-surface-container-low rounded-xl p-3 text-center border border-white/5">
                <div className="font-headline text-xl font-bold text-amber-400">
                  {answeredPreds.filter((p: any) => p.status !== "resolved").length}
                </div>
                <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Pending</div>
              </div>
              <div className="bg-surface-container-low rounded-xl p-3 text-center border border-white/5">
                <div className="font-headline text-xl font-bold text-on-surface-variant/50">
                  {missedPreds.length}
                </div>
                <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Missed</div>
              </div>
            </div>

            {/* All picks */}
            <div className="space-y-3">
              {allPicks.map((pred: any) => {
                const selectedKey = pred.userAnswer?.selectedOption;
                const isMissed = !selectedKey;
                const selectedLabel = isMissed ? null : getOptionLabel(pred, selectedKey);
                const isClosed = pred.status === "resolved";
                const isCorrect = isClosed && !isMissed ? selectedKey === pred.correctOption : undefined;
                const pointsEarned = pred.userAnswer?.pointsEarned || (isCorrect ? (pred.options?.find((o: any) => (o.key || o.label) === selectedKey)?.points || 10) : 0);
                const correctAnswerLabel = isClosed && !isCorrect && pred.correctOption
                  ? getOptionLabel(pred, pred.correctOption)
                  : null;

                let statusText = "Pending";
                let statusColor = "text-amber-400";
                let cardBg = "bg-surface-container-low";
                if (isMissed) {
                  statusText = "Missed";
                  statusColor = "text-on-surface-variant/50";
                  cardBg = "bg-surface-container-low/50";
                } else if (isClosed && isCorrect === true) {
                  statusText = `+${pointsEarned || 0} pts`;
                  statusColor = "text-primary-container";
                  cardBg = "bg-primary-container/10";
                } else if (isClosed && isCorrect === false) {
                  statusText = "Wrong";
                  statusColor = "text-error";
                  cardBg = "bg-error/5";
                }

                return (
                  <div key={pred.id} className={`${cardBg} rounded-xl p-4 border border-white/5`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                        {getCategoryLabel(pred)}
                      </span>
                      <span className={`font-label text-xs font-bold ${statusColor}`}>{statusText}</span>
                    </div>
                    <p className="font-body text-sm font-medium text-on-surface mb-2">{pred.question}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isMissed ? (
                        <span className="font-label text-xs px-3 py-1 rounded-full font-bold bg-surface-container-highest/50 text-on-surface-variant/50">
                          Not answered
                        </span>
                      ) : (
                        <span className={`font-label text-xs px-3 py-1 rounded-full font-bold ${
                          isClosed && isCorrect === false
                            ? "bg-error/20 text-error"
                            : isClosed && isCorrect === true
                            ? "bg-primary-container/20 text-primary-container"
                            : "bg-surface-container-highest text-on-surface-variant"
                        }`}>
                          Your pick: {selectedLabel}
                        </span>
                      )}
                      {correctAnswerLabel && (
                        <span className="font-label text-xs text-on-surface-variant">
                          Answer: {correctAnswerLabel}
                        </span>
                      )}
                    </div>
                  </div>
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
