"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Leaderboard from "./Leaderboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface LiveGameProps {
  matchId: string;
  venueId: string | null;
  match: any;
}

const ACCENT_COLORS = ["#ff6341", "#ffd60a", "#3b9eff", "#22c55e"];

export default function LiveGame({ matchId, venueId, match }: LiveGameProps) {
  const { state, dispatch } = useGame();
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"predict" | "leaderboard">("predict");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [activeBoost, setActiveBoost] = useState<{
    predId: string;
    type: "boost" | "all_in";
  } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const localAnsweredRef = useRef<Set<string>>(new Set());

  const boostsRemaining = 1 - (state.boostsUsedThisRound || 0);
  const allInAvailable = !state.allInUsed;

  // Load predictions
  const loadPredictions = useCallback(async () => {
    if (!venueId) return;
    try {
      const preds = await api.getPredictions(matchId, venueId, undefined, localStorage.getItem("jaffa_room_id"));
      const open = preds.filter(
        (p: any) =>
          p.status === "open" &&
          p.category !== "pre_match" &&
          !p.userAnswer &&
          !localAnsweredRef.current.has(p.id)
      );
      setPredictions(open);
    } catch (err) {
      console.error("Load predictions error:", err);
    } finally {
      setLoading(false);
    }
  }, [matchId, venueId]);

  // Initial load
  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  // Poll every 10s
  useEffect(() => {
    const interval = setInterval(loadPredictions, 10000);
    return () => clearInterval(interval);
  }, [loadPredictions]);

  // Handle option selection
  const handleSelect = (predId: string, optionKey: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [predId]: prev[predId] === optionKey ? "" : optionKey,
    }));
  };

  // Handle boost toggle
  const handleToggleBoost = (predId: string) => {
    if (activeBoost?.predId === predId && activeBoost.type === "boost") {
      setActiveBoost(null);
    } else {
      setActiveBoost({ predId, type: "boost" });
    }
  };

  const handleToggleAllIn = (predId: string) => {
    if (activeBoost?.predId === predId && activeBoost.type === "all_in") {
      setActiveBoost(null);
    } else {
      setActiveBoost({ predId, type: "all_in" });
    }
  };

  // Submit prediction
  const handleSubmit = async (predId: string) => {
    const selected = selectedOptions[predId];
    if (!selected || !venueId) return;

    setSubmitting(predId);
    const boostType =
      activeBoost?.predId === predId ? activeBoost.type : undefined;

    try {
      await api.submitPrediction(predId, selected, venueId, boostType, localStorage.getItem("jaffa_room_id"));

      if (boostType === "boost") dispatch({ type: "USE_BOOST" });
      if (boostType === "all_in") dispatch({ type: "USE_ALL_IN" });

      localAnsweredRef.current.add(predId);
      setAnsweredIds((prev) => new Set([...prev, predId]));

      toast("Prediction locked in!");

      // Remove after brief visual confirmation
      setTimeout(() => {
        setPredictions((prev) => prev.filter((p) => p.id !== predId));
        setSelectedOptions((prev) => {
          const next = { ...prev };
          delete next[predId];
          return next;
        });
        setActiveBoost(null);
      }, 1000);

      // Refresh participant state
      try {
        const matchState = await api.getMatchState(matchId, venueId, localStorage.getItem("jaffa_room_id"));
        if (matchState.participant) {
          dispatch({
            type: "UPDATE_PARTICIPANT",
            data: {
              totalPoints: matchState.participant.totalPoints,
              currentStreak: matchState.participant.currentStreak,
              boostsUsedThisRound: matchState.participant.boostsUsedRound,
              allInUsed: matchState.participant.allInUsed,
              currentRound: matchState.participant.currentRound,
            },
          });
        }
      } catch {}
    } catch (err: any) {
      toast(err.message || "Failed to submit prediction");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Predict / Leaderboard tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "predict" | "leaderboard")}
      >
        <TabsList className="w-full bg-[#0d0d0d] border-2 border-[#2a2a2a] rounded-[3px] p-1 h-auto">
          <TabsTrigger
            value="predict"
            className="flex-1 rounded-[2px] py-2 text-xs font-black uppercase tracking-wider data-[state=active]:bg-[#ff6341] data-[state=active]:text-black data-[state=active]:border-2 data-[state=active]:border-black data-[state=active]:shadow-[2px_2px_0_0_#000] data-[state=inactive]:text-white/50"
          >
            Predict
          </TabsTrigger>
          <TabsTrigger
            value="leaderboard"
            className="flex-1 rounded-[2px] py-2 text-xs font-black uppercase tracking-wider data-[state=active]:bg-[#ff6341] data-[state=active]:text-black data-[state=active]:border-2 data-[state=active]:border-black data-[state=active]:shadow-[2px_2px_0_0_#000] data-[state=inactive]:text-white/50"
          >
            Leaderboard
          </TabsTrigger>
        </TabsList>

        {/* Predict Tab */}
        <TabsContent value="predict">
          {loading ? (
            <div className="py-16 text-center">
              <p className="text-white/50 font-bold uppercase tracking-wider animate-pulse">
                Loading predictions...
              </p>
            </div>
          ) : predictions.length === 0 ? (
            <div className="py-16 text-center">
              <div
                className="inline-block text-5xl mb-4 bg-[#1a1a1a] p-4 rounded-[4px] border-2 border-[#2a2a2a]"
                style={{ boxShadow: "4px 4px 0 0 #2a2a2a" }}
              >
                🏏
              </div>
              <h3
                className="text-xl mb-2"
                style={{ fontFamily: "'Bungee', cursive" }}
              >
                ALL CAUGHT UP!
              </h3>
              <p className="text-white/50 text-sm font-bold">
                New predictions drop at the end of this over.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {predictions.map((pred, predIndex) => {
                  const isAnswered = answeredIds.has(pred.id);
                  const selected = selectedOptions[pred.id];
                  const boostType = activeBoost !== null && activeBoost.predId === pred.id ? activeBoost.type : null;
                  const isBoostActive = boostType === "boost";
                  const isAllInActive = boostType === "all_in";
                  const hasBoost = isBoostActive || isAllInActive;

                  return (
                    <motion.div
                      key={pred.id}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{
                        y: 0,
                        opacity: isAnswered ? 0.5 : 1,
                      }}
                      exit={{ x: -200, opacity: 0 }}
                      transition={{ delay: predIndex * 0.05 }}
                      className={`game-card p-4 ${
                        isAllInActive
                          ? "!border-[#ffd60a] !shadow-[4px_4px_0_0_#ffd60a]"
                          : isBoostActive
                          ? "!border-[#3b9eff] !shadow-[4px_4px_0_0_#3b9eff]"
                          : ""
                      }`}
                    >
                      {/* Boost banner */}
                      {hasBoost && (
                        <div
                          className={`-mx-4 -mt-4 mb-3 px-4 py-2 text-center text-xs font-black uppercase tracking-wider border-b-2 ${
                            isAllInActive
                              ? "bg-[#ffd60a]/10 text-[#ffd60a] border-[#ffd60a]"
                              : "bg-[#3b9eff]/10 text-[#3b9eff] border-[#3b9eff]"
                          }`}
                        >
                          {isAllInActive
                            ? "ALL-IN ACTIVE (3x) -- Pick your answer!"
                            : "BOOST ACTIVE (2x) -- Pick your answer!"}
                        </div>
                      )}

                      {/* Category chip */}
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="info-pill text-[#ff6341]"
                        >
                          {pred.category === "kong"
                            ? "🦍 THE KONG QUESTION"
                            : pred.category === "hot_take"
                            ? "HOT TAKE"
                            : pred.category === "rivalry_call"
                            ? "RIVALRY CALL"
                            : pred.category === "bold_call"
                            ? "BOLD CALL"
                            : `OVER ${pred.overNumber || ""}`}
                        </span>
                        {pred.expiresAt && (
                          <span className="info-pill text-white/60 text-[10px]">
                            {Math.max(
                              0,
                              Math.ceil(
                                (new Date(pred.expiresAt).getTime() -
                                  Date.now()) /
                                  1000
                              )
                            )}
                            s
                          </span>
                        )}
                      </div>

                      {/* Question */}
                      <h3
                        className="text-lg text-white mb-4"
                        style={{ fontFamily: "'Bungee', cursive" }}
                      >
                        {pred.question}
                      </h3>

                      {/* Options */}
                      <div className="space-y-2 mb-4">
                        {pred.options.map((opt: any, optIdx: number) => {
                          const color =
                            ACCENT_COLORS[optIdx % ACCENT_COLORS.length];
                          const isSelected = selected === opt.key;
                          const multiplier = isAllInActive
                            ? 3
                            : isBoostActive
                            ? 2
                            : 1;

                          return (
                            <button
                              key={opt.key}
                              onClick={() =>
                                !isAnswered &&
                                handleSelect(pred.id, opt.key)
                              }
                              disabled={isAnswered}
                              className={`option-btn px-4 py-3 text-left flex items-center justify-between ${
                                isSelected ? "selected" : ""
                              }`}
                              style={
                                isSelected
                                  ? {
                                      background: color,
                                      borderColor: "#000",
                                      color: "#000",
                                      boxShadow: `4px 4px 0 0 #000`,
                                    }
                                  : {}
                              }
                            >
                              <span className="font-bold text-sm">
                                {opt.label}
                              </span>
                              <span
                                className={`text-xs font-black ${
                                  isSelected ? "text-black" : "text-white/40"
                                }`}
                              >
                                {opt.points * multiplier} pts
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Boost buttons */}
                      {!hasBoost && !isAnswered && (
                        <div className="flex gap-2 mb-3">
                          {boostsRemaining > 0 && (
                            <button
                              onClick={() => handleToggleBoost(pred.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-xs font-black uppercase bg-[#0d0d0d] text-[#3b9eff] border-2 border-[#3b9eff] hover:bg-[#3b9eff]/10 transition-colors"
                              style={{
                                boxShadow: "2px 2px 0 0 #3b9eff",
                              }}
                            >
                              2X BOOST
                            </button>
                          )}
                          {allInAvailable && (
                            <button
                              onClick={() => handleToggleAllIn(pred.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-xs font-black uppercase bg-[#0d0d0d] text-[#ffd60a] border-2 border-[#ffd60a] hover:bg-[#ffd60a]/10 transition-colors"
                              style={{
                                boxShadow: "2px 2px 0 0 #ffd60a",
                              }}
                            >
                              ALL IN (3x)
                            </button>
                          )}
                        </div>
                      )}

                      {/* Cancel boost */}
                      {hasBoost && !isAnswered && (
                        <button
                          onClick={() => setActiveBoost(null)}
                          className="text-xs text-white/40 font-bold uppercase hover:text-white/70 transition-colors mb-3"
                        >
                          Cancel{" "}
                          {isAllInActive ? "All-In" : "Boost"}
                        </button>
                      )}

                      {/* Submit button */}
                      {selected && !isAnswered && (
                        <button
                          onClick={() => handleSubmit(pred.id)}
                          disabled={submitting === pred.id}
                          className="btn-sticker btn-green w-full py-3 text-sm gap-2"
                        >
                          {submitting === pred.id
                            ? "LOCKING..."
                            : "LOCK IN PREDICTION"}
                        </button>
                      )}

                      {/* Answered confirmation */}
                      {isAnswered && (
                        <div className="text-center py-2">
                          <span className="text-[#22c55e] font-black text-sm uppercase">
                            Locked In!
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard">
          {venueId ? (
            <Leaderboard matchId={matchId} venueId={venueId} />
          ) : (
            <p className="text-center text-white/40 py-8 font-bold uppercase">
              No venue selected
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
