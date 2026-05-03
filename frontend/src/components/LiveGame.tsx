"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Leaderboard from "./Leaderboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { powerupsApi, type InventoryRow } from "@/lib/storeApi";

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

  // ── Bananergy state ─────────────────────────────────────────────
  // active powerups (incl. passive Silverback) for THIS match.
  const [activePowerups, setActivePowerups] = useState<InventoryRow[]>([]);
  // For Monke Mayhem player-Q multi-pick: per-prediction Set<string> of keys.
  // Cap enforced at 2; replaces the single `selectedOptions` for the
  // affected card.
  const [mayhemPicks, setMayhemPicks] = useState<Record<string, Set<string>>>({});
  // Tank reveal results, populated on use-tank success per predictionId.
  const [revealedAggregates, setRevealedAggregates] = useState<
    Record<string, { responses: Record<string, number>; totalResponses: number; chargesRemaining: number }>
  >({});
  const [tankBusy, setTankBusy] = useState<string | null>(null);

  // Active powerups poll — once on mount + every 15s. The match page also
  // mounts MatchPowerupTray which calls the same endpoint; this duplicates
  // the call so LiveGame can render Tank/Mayhem affordances WITHOUT a prop
  // drilldown from the match page.
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const fetchActive = async () => {
      try {
        const r = await powerupsApi.active(matchId);
        if (!cancelled) setActivePowerups(r.powerups || []);
      } catch { /* silent */ }
    };
    fetchActive();
    const interval = setInterval(fetchActive, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [matchId]);

  const mayhemActive = activePowerups.some(
    (p) => p.powerupKey === "monke_mayhem" && p.status === "active",
  );
  const tankPowerup = activePowerups.find(
    (p) => p.powerupKey === "chimp_tank" && (p.chargesRemaining ?? 0) > 0,
  );
  const tankCharges = tankPowerup?.chargesRemaining ?? 0;

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

  // Returns true if the user has Mayhem active AND this prediction is a
  // player Q (subjectType non-null). When true, the card is in 2-pick mode.
  const isMayhemEligible = (pred: any): boolean => mayhemActive && !!pred.subjectType;

  // Handle option selection — single-toggle in normal mode, set-of-up-to-2
  // in Mayhem mode for player Qs.
  const handleSelect = (pred: any, optionKey: string) => {
    const predId = pred.id;
    if (isMayhemEligible(pred)) {
      setMayhemPicks((prev) => {
        const set = new Set(prev[predId] || []);
        if (set.has(optionKey)) set.delete(optionKey);
        else if (set.size < 2) set.add(optionKey);
        else {
          // Already 2 picked — replace the EARLIER pick with the new one
          // (last-tap-wins). Friendlier than blocking silently.
          const first = set.values().next().value;
          if (first) set.delete(first);
          set.add(optionKey);
        }
        return { ...prev, [predId]: set };
      });
    } else {
      setSelectedOptions((prev) => ({
        ...prev,
        [predId]: prev[predId] === optionKey ? "" : optionKey,
      }));
    }
  };

  // Tank reveal — consume 1 charge, render % bars under the option list.
  const handleUseTank = async (predId: string) => {
    setTankBusy(predId);
    try {
      const r = await powerupsApi.useChimpTank(predId);
      setRevealedAggregates((prev) => ({ ...prev, [predId]: r }));
      // Refresh active list so the chargesRemaining counter ticks down.
      try {
        const p = await powerupsApi.active(matchId);
        setActivePowerups(p.powerups || []);
      } catch { /* silent */ }
    } catch (err: any) {
      toast.error(err?.message || "Tank failed");
    } finally {
      setTankBusy(null);
    }
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
  const handleSubmit = async (pred: any) => {
    const predId = pred.id;
    if (!venueId) return;

    // Mayhem 2-pick path: comma-join the chosen keys. Backend rejects if
    // Mayhem isn't actually active, so this is safe to send.
    let selected = selectedOptions[predId] || "";
    if (isMayhemEligible(pred)) {
      const set = mayhemPicks[predId];
      if (!set || set.size === 0) return;
      // Single-pick is still valid in Mayhem mode (user just chose 1).
      selected = Array.from(set).join(",");
    }
    if (!selected) return;

    setSubmitting(predId);
    const boostType =
      activeBoost && activeBoost.predId === predId ? activeBoost.type : undefined;

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
        setMayhemPicks((prev) => {
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

                      {/* Mayhem 2-pick hint banner — only on player Qs when
                          Mayhem is active. Lets the user know "Pick 2" rules
                          are in effect for THIS card. */}
                      {isMayhemEligible(pred) && (
                        <div
                          className="-mx-4 -mt-2 mb-3 px-4 py-1.5 text-center text-[11px] font-black uppercase tracking-wider"
                          style={{ background: "rgba(168,85,247,0.18)", color: "#a855f7", borderBottom: "1px solid #a855f7" }}
                        >
                          🎲 MONKE MAYHEM — PICK 2
                        </div>
                      )}

                      {/* Options */}
                      <div className="space-y-2 mb-4">
                        {pred.options.map((opt: any, optIdx: number) => {
                          const color =
                            ACCENT_COLORS[optIdx % ACCENT_COLORS.length];
                          const isSelected = isMayhemEligible(pred)
                            ? !!mayhemPicks[pred.id]?.has(opt.key)
                            : selected === opt.key;
                          const multiplier = isAllInActive
                            ? 3
                            : isBoostActive
                            ? 2
                            : 1;

                          // Tank reveal — % of users picking this option, if
                          // the user has used Tank on THIS prediction.
                          const aggr = revealedAggregates[pred.id];
                          const optCount = aggr?.responses?.[opt.key] || 0;
                          const optPct = aggr && aggr.totalResponses > 0
                            ? Math.round((optCount / aggr.totalResponses) * 100)
                            : null;

                          return (
                            <button
                              key={opt.key}
                              onClick={() =>
                                !isAnswered &&
                                handleSelect(pred, opt.key)
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
                              <span className="font-bold text-sm flex items-center gap-2">
                                {opt.label}
                                {optPct !== null && (
                                  <span
                                    className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                                    style={{
                                      background: isSelected ? "rgba(0,0,0,0.18)" : "rgba(59,158,255,0.18)",
                                      color: isSelected ? "#000" : "#3b9eff",
                                    }}
                                  >
                                    {optPct}%
                                  </span>
                                )}
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

                      {/* Tank reveal trigger — visible when user has Tank
                          charges and hasn't already revealed this question. */}
                      {!isAnswered && tankCharges > 0 && !revealedAggregates[pred.id] && (
                        <button
                          type="button"
                          onClick={() => handleUseTank(pred.id)}
                          disabled={tankBusy === pred.id}
                          className="w-full mb-3 px-3 py-2 rounded-[3px] text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
                          style={{
                            background: "rgba(59,158,255,0.10)",
                            color: "#3b9eff",
                            border: "2px solid #3b9eff",
                            boxShadow: "2px 2px 0 0 #3b9eff",
                          }}
                        >
                          🔭 {tankBusy === pred.id ? "Revealing…" : `Reveal odds (${tankCharges} left)`}
                        </button>
                      )}
                      {revealedAggregates[pred.id] && (
                        <div className="text-[10px] uppercase tracking-wider text-[#9ca3af] text-center mb-3 font-bold">
                          🔭 Tank intel · {revealedAggregates[pred.id].totalResponses} answered so far
                        </div>
                      )}

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

                      {/* Submit button — Mayhem mode requires ≥1 pick (2 ideal) */}
                      {((isMayhemEligible(pred) && (mayhemPicks[pred.id]?.size || 0) > 0) || (!isMayhemEligible(pred) && selected)) && !isAnswered && (
                        <button
                          onClick={() => handleSubmit(pred)}
                          disabled={submitting === pred.id}
                          className="btn-sticker btn-green w-full py-3 text-sm gap-2"
                        >
                          {submitting === pred.id
                            ? "LOCKING..."
                            : isMayhemEligible(pred)
                            ? `LOCK IN (${mayhemPicks[pred.id]?.size || 0}/2)`
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
