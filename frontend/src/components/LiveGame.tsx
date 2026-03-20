"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { joinVenueMatch, getSocket } from "@/lib/socket";
import Leaderboard from "./Leaderboard";
import RewardBanner from "./RewardBanner";
import ProfileDrawer from "./ProfileDrawer";
import { IoFlame, IoRocket, IoTrophy, IoPersonCircle, IoCheckmarkCircle } from "react-icons/io5";
import { MdBolt } from "react-icons/md";

interface LiveGameProps {
  match: any;
  venueId: string;
}

type Tab = "predict" | "leaderboard" | "rewards";

export default function LiveGame({ match, venueId }: LiveGameProps) {
  const { state, dispatch } = useGame();
  const [activeTab, setActiveTab] = useState<Tab>("predict");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [participant, setParticipant] = useState<any>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [lastResult, setLastResult] = useState<any>(null);
  const [pulse, setPulse] = useState<any>(null);
  const [hypeEvent, setHypeEvent] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [myPicks, setMyPicks] = useState<any[]>([]);

  // Initial load
  useEffect(() => {
    loadFullState();
    loadRewards();
    loadMyPicks();
  }, [match.id, venueId]);

  // Socket connection
  useEffect(() => {
    if (!venueId || !match.id) return;

    joinVenueMatch(venueId, match.id);
    const socket = getSocket();

    socket.on("newPrediction", () => loadPredictions());
    socket.on("leaderboardUpdate", () => loadParticipantState());
    socket.on("playerCount", (data: { count: number }) => setPlayerCount(data.count));
    socket.on("predictionPulse", (data: any) => {
      setPulse(data);
      setTimeout(() => setPulse(null), 8000);
    });
    socket.on("hypeEvent", (data: any) => {
      setHypeEvent(data);
      setTimeout(() => setHypeEvent(null), 6000);
    });
    socket.on("roundWinner", (data: any) => {
      setHypeEvent({ type: "round_winner", ...data });
      loadRewards();
      setTimeout(() => setHypeEvent(null), 10000);
    });

    return () => {
      socket.off("newPrediction");
      socket.off("leaderboardUpdate");
      socket.off("playerCount");
      socket.off("predictionPulse");
      socket.off("hypeEvent");
      socket.off("roundWinner");
    };
  }, [venueId, match.id]);

  // Auto-refresh on visibility change (phone was locked)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadFullState();
        loadRewards();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Load participant state only (points, streak, boosts) — does NOT touch predictions
  const loadParticipantState = async () => {
    try {
      const data = await api.getMatchState(match.id, venueId);
      setParticipant(data.participant);
      setPlayerCount(data.playerCount);

      if (data.participant) {
        dispatch({
          type: "UPDATE_PARTICIPANT",
          data: {
            totalPoints: data.participant.totalPoints,
            currentStreak: data.participant.currentStreak,
            boostsUsedThisRound: data.participant.boostsUsedRound,
            allInUsed: data.participant.allInUsed,
            currentRound: data.participant.currentRound,
          },
        });
      }
    } catch (err) {
      console.error("Load state error:", err);
    }
  };

  // Full reload: participant + predictions (used on initial load and new over events)
  const loadFullState = async () => {
    try {
      // Load participant state
      const data = await api.getMatchState(match.id, venueId);
      setParticipant(data.participant);
      setPlayerCount(data.playerCount);

      if (data.participant) {
        dispatch({
          type: "UPDATE_PARTICIPANT",
          data: {
            totalPoints: data.participant.totalPoints,
            currentStreak: data.participant.currentStreak,
            boostsUsedThisRound: data.participant.boostsUsedRound,
            allInUsed: data.participant.allInUsed,
            currentRound: data.participant.currentRound,
          },
        });
      }

      // Load predictions — filter out already answered (server-side + local tracking)
      const preds = await api.getPredictions(match.id, venueId);
      setPredictions(preds.filter((p: any) =>
        p.status === "open" && p.category !== "pre_match" && !p.userAnswer && !locallyAnsweredIdsRef.current.has(p.id)
      ));
    } catch (err) {
      console.error("Load state error:", err);
    }
  };

  const loadPredictions = async () => {
    try {
      const preds = await api.getPredictions(match.id, venueId);
      setPredictions(preds.filter((p: any) =>
        p.status === "open" && p.category !== "pre_match" && !p.userAnswer && !locallyAnsweredIdsRef.current.has(p.id)
      ));
    } catch (err) {
      console.error("Load predictions error:", err);
    }
  };

  const loadMyPicks = async () => {
    try {
      const picks = await api.getMyPredictions(match.id, venueId);
      // Only show non-prematch picks, most recent first
      setMyPicks(picks.filter((p: any) => p.prediction?.category !== "pre_match"));
    } catch (err) {
      console.error("Load my picks error:", err);
    }
  };

  const loadRewards = async () => {
    try {
      const r = await api.getMyRewards(match.id);
      setRewards(r);
    } catch (err) {
      console.error("Load rewards error:", err);
    }
  };

  // Track answered predictions — visual feedback + permanent filter
  const [answeredPredictions, setAnsweredPredictions] = useState<Record<string, { optionKey: string; boostType?: string }>>({});
  const locallyAnsweredIdsRef = useRef<Set<string>>(new Set());

  const handleSubmit = async (predictionId: string, optionKey: string, boostType?: string) => {
    try {
      await api.submitPrediction(predictionId, optionKey, venueId, boostType);

      if (boostType === "boost") dispatch({ type: "USE_BOOST" });
      if (boostType === "all_in") dispatch({ type: "USE_ALL_IN" });

      // Permanently mark this prediction as answered locally
      locallyAnsweredIdsRef.current.add(predictionId);

      // Mark as answered — show visual feedback
      setAnsweredPredictions((prev) => ({ ...prev, [predictionId]: { optionKey, boostType } }));

      // Remove from visible list after showing confirmation
      setTimeout(() => {
        setPredictions((prev) => prev.filter((p) => p.id !== predictionId));
        setAnsweredPredictions((prev) => {
          const next = { ...prev };
          delete next[predictionId];
          return next;
        });
      }, 1200);

      setLastResult({ predictionId, optionKey, boostType });
      setTimeout(() => setLastResult(null), 2000);

      // Refresh participant data (points, streak) and my picks
      loadParticipantState();
      loadMyPicks();
    } catch (err: any) {
      console.error("Submit error:", err);
    }
  };

  const currentRound = participant?.currentRound || state.currentRound || 1;
  const boostsRemaining = 2 - (participant?.boostsUsedRound || state.boostsUsedThisRound);
  const allInAvailable = !(participant?.allInUsed || state.allInUsed);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Hype Event Overlay */}
      <AnimatePresence>
        {hypeEvent && <HypeOverlay event={hypeEvent} />}
      </AnimatePresence>

      {/* Pulse Banner */}
      <AnimatePresence>
        {pulse && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-orange-600 to-yellow-600 px-4 py-3 text-center"
          >
            <p className="text-white font-bold text-sm">{pulse.pulse}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reward Banner */}
      {rewards.filter((r: any) => r.status === "active").length > 0 && (
        <RewardBanner rewards={rewards.filter((r: any) => r.status === "active")} />
      )}

      {/* Top Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">{match.team1Short} vs {match.team2Short}</div>
            <div className="text-sm font-semibold text-white">
              Round {currentRound} {getRoundName(currentRound)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400">Your Points</div>
              <div className="text-lg font-bold text-orange-500">{participant?.totalPoints || 0}</div>
            </div>
            <button
              onClick={() => setProfileOpen(true)}
              className="text-slate-400 hover:text-orange-400 transition-colors"
            >
              <IoPersonCircle className="text-3xl" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 mt-2">
          {state.currentStreak > 0 && (
            <div className={`flex items-center gap-1 text-xs ${state.currentStreak >= 3 ? "text-yellow-400" : "text-slate-400"}`}>
              <IoFlame /> {state.currentStreak} streak
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <MdBolt /> {boostsRemaining} boosts
          </div>
          {allInAvailable && (
            <div className="flex items-center gap-1 text-xs text-purple-400">
              <IoRocket /> All-In ready
            </div>
          )}
          <div className="text-xs text-slate-500 ml-auto">
            {playerCount} playing
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-slate-900 border-b border-slate-800">
        {(["predict", "leaderboard", "rewards"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "text-orange-500 border-b-2 border-orange-500"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "predict" && `Predict${predictions.length > 0 ? ` (${predictions.length})` : ""}`}
            {tab === "leaderboard" && "Leaderboard"}
            {tab === "rewards" && `Rewards${rewards.filter((r: any) => r.status === "active").length > 0 ? " !" : ""}`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {activeTab === "predict" && (
          <PredictionList
            predictions={predictions}
            boostsRemaining={boostsRemaining}
            allInAvailable={allInAvailable}
            onSubmit={handleSubmit}
            lastResult={lastResult}
            answeredPredictions={answeredPredictions}
            match={match}
            myPicks={myPicks}
          />
        )}
        {activeTab === "leaderboard" && (
          <Leaderboard
            matchId={match.id}
            venueId={venueId}
            currentRound={currentRound}
            userId={state.user?.id}
          />
        )}
        {activeTab === "rewards" && (
          <RewardsList rewards={rewards} />
        )}
      </div>

      {/* Profile Drawer */}
      <ProfileDrawer
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        venueName={state.venueName || undefined}
      />
    </div>
  );
}

// Prediction list component
function PredictionList({
  predictions,
  boostsRemaining,
  allInAvailable,
  onSubmit,
  lastResult,
  match,
  answeredPredictions,
  myPicks,
}: {
  predictions: any[];
  boostsRemaining: number;
  allInAvailable: boolean;
  onSubmit: (id: string, option: string, boost?: string) => void;
  lastResult: any;
  match: any;
  answeredPredictions: Record<string, { optionKey: string; boostType?: string }>;
  myPicks: any[];
}) {
  // activeBoost tracks which prediction has a boost/all-in toggled on
  // Format: { predictionId, type: "boost" | "all_in" }
  const [activeBoost, setActiveBoost] = useState<{ predId: string; type: "boost" | "all_in" } | null>(null);

  const handleToggleBoost = (predId: string) => {
    if (activeBoost?.predId === predId && activeBoost.type === "boost") {
      setActiveBoost(null); // toggle off
    } else {
      setActiveBoost({ predId, type: "boost" });
    }
  };

  const handleToggleAllIn = (predId: string) => {
    if (activeBoost?.predId === predId && activeBoost.type === "all_in") {
      setActiveBoost(null); // toggle off
    } else {
      setActiveBoost({ predId, type: "all_in" });
    }
  };

  const handleOptionClick = (predId: string, optionKey: string) => {
    const boostType = activeBoost?.predId === predId ? activeBoost.type : undefined;
    onSubmit(predId, optionKey, boostType);
    setActiveBoost(null);
  };

  if (predictions.length === 0) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-4xl mb-4">🏏</div>
          <p className="text-white font-semibold text-lg mb-2">All caught up!</p>
          <p className="text-slate-400 text-sm text-center">
            New predictions drop at the end of this over. Keep watching!
          </p>
        </div>
        {myPicks.length > 0 && <MyPicksSection picks={myPicks} />}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {predictions.map((pred) => {
        const isBoostActive = activeBoost !== null && activeBoost.predId === pred.id && activeBoost.type === "boost";
        const isAllInActive = activeBoost !== null && activeBoost.predId === pred.id && activeBoost.type === "all_in";
        const hasActiveBoost = isBoostActive || isAllInActive;
        const answered = answeredPredictions[pred.id];

        return (
          <motion.div
            key={pred.id}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`bg-slate-900 rounded-xl overflow-hidden transition-all ${
              isAllInActive
                ? "border-2 border-purple-500 shadow-lg shadow-purple-500/20"
                : isBoostActive
                ? "border-2 border-yellow-500 shadow-lg shadow-yellow-500/20"
                : "border border-slate-800"
            }`}
          >
            {/* Active boost banner */}
            {hasActiveBoost && (
              <div className={`px-4 py-2 text-center text-xs font-bold ${
                isAllInActive
                  ? "bg-purple-500/20 text-purple-300"
                  : "bg-yellow-500/20 text-yellow-300"
              }`}>
                {isAllInActive
                  ? "⚡ ALL-IN ACTIVE (3x) — Pick your answer! Wrong = -30 pts"
                  : "⚡ BOOST ACTIVE (2x) — Pick your answer!"}
              </div>
            )}

            {/* Question header */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-orange-400 uppercase">
                  {pred.category === "hot_take" ? "Hot Take" : pred.category === "rivalry_call" ? "Rivalry Call" : `Over ${pred.overNumber || ""}`}
                </span>
                {pred.overNumber && (
                  <span className="text-xs text-slate-500">
                    {match.team1Short} vs {match.team2Short}
                  </span>
                )}
              </div>
              <h3 className="text-white font-semibold">{pred.question}</h3>
            </div>

            {/* Options */}
            <div className="px-4 pb-3 space-y-2">
              {pred.options.map((opt: any) => {
                const multiplier = isAllInActive ? 3 : isBoostActive ? 2 : 1;
                const displayPoints = opt.points * multiplier;
                const isSelected = answered?.optionKey === opt.key;
                const isOtherOption = answered && !isSelected;

                return (
                  <button
                    key={opt.key}
                    onClick={() => !answered && handleOptionClick(pred.id, opt.key)}
                    disabled={!!answered}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isSelected
                        ? answered.boostType === "all_in"
                          ? "bg-purple-500 text-white scale-[0.98] ring-2 ring-purple-300"
                          : answered.boostType === "boost"
                          ? "bg-yellow-500 text-black scale-[0.98] ring-2 ring-yellow-300"
                          : "bg-green-500 text-white scale-[0.98] ring-2 ring-green-300"
                        : isOtherOption
                        ? "bg-slate-800/30 text-slate-600"
                        : isAllInActive
                        ? "bg-purple-900/30 hover:bg-purple-800/40 text-white border border-purple-500/30 active:scale-[0.98]"
                        : isBoostActive
                        ? "bg-yellow-900/20 hover:bg-yellow-800/30 text-white border border-yellow-500/30 active:scale-[0.98]"
                        : "bg-slate-800 hover:bg-slate-700 text-white active:scale-[0.98]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isSelected && <IoCheckmarkCircle className="text-lg" />}
                      {opt.label}
                    </span>
                    {!answered && (
                      <span className={`text-xs ${
                        isAllInActive ? "text-purple-300 font-bold" :
                        isBoostActive ? "text-yellow-300 font-bold" :
                        "text-slate-500"
                      }`}>
                        {displayPoints} pts
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-xs font-bold">
                        Locked in!
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Boost / All-In buttons */}
            {!hasActiveBoost && !answered && (
              <div className="px-4 pb-4 flex gap-2">
                {boostsRemaining > 0 && (
                  <button
                    onClick={() => handleToggleBoost(pred.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-yellow-400 hover:bg-yellow-900/30 transition-colors"
                  >
                    <MdBolt /> 2x Boost ({boostsRemaining} left)
                  </button>
                )}
                {allInAvailable && (
                  <button
                    onClick={() => handleToggleAllIn(pred.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-purple-400 hover:bg-purple-900/30 transition-colors"
                  >
                    <IoRocket /> 3x All-In
                  </button>
                )}
              </div>
            )}

            {/* Cancel boost */}
            {hasActiveBoost && !answered && (
              <div className="px-4 pb-4">
                <button
                  onClick={() => setActiveBoost(null)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Cancel {isAllInActive ? "All-In" : "Boost"}
                </button>
              </div>
            )}
          </motion.div>
        );
      })}

      {/* My Picks — previously answered predictions */}
      {myPicks.length > 0 && (
        <MyPicksSection picks={myPicks} />
      )}
    </div>
  );
}

// My Picks collapsible section
function MyPicksSection({ picks }: { picks: any[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-6 border-t border-slate-800 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-1 mb-3"
      >
        <span className="text-sm font-medium text-slate-400">
          My Picks ({picks.length})
        </span>
        <span className="text-xs text-slate-500">
          {expanded ? "Hide" : "Show"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {picks.map((pick: any) => {
            const pred = pick.prediction;
            if (!pred) return null;

            const selectedOpt = pred.options?.find((o: any) => o.key === pick.selectedOption);
            const isResolved = pred.status === "resolved";
            const isCorrect = pick.isCorrect;

            return (
              <div
                key={pick.id}
                className={`px-4 py-3 rounded-xl border text-sm ${
                  isResolved
                    ? isCorrect
                      ? "bg-green-500/10 border-green-500/20"
                      : "bg-red-500/10 border-red-500/20"
                    : "bg-slate-800/50 border-slate-700/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">
                    {pred.category === "hot_take" ? "Hot Take" : pred.category === "rivalry_call" ? "Rivalry Call" : `Over ${pred.overNumber || ""}`}
                  </span>
                  {isResolved && (
                    <span className={`text-xs font-bold ${isCorrect ? "text-green-400" : "text-red-400"}`}>
                      {isCorrect ? `+${pick.pointsEarned} pts` : pick.pointsEarned < 0 ? `${pick.pointsEarned} pts` : "Wrong"}
                    </span>
                  )}
                  {!isResolved && (
                    <span className="text-xs text-yellow-400">Pending</span>
                  )}
                </div>
                <p className="text-slate-300 text-sm">{pred.question}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isResolved && isCorrect ? "bg-green-500/20 text-green-300" :
                    isResolved && !isCorrect ? "bg-red-500/20 text-red-300" :
                    "bg-slate-700 text-slate-300"
                  }`}>
                    Your pick: {selectedOpt?.label || pick.selectedOption}
                  </span>
                  {pick.boostType === "boost" && (
                    <span className="text-xs text-yellow-400">2x Boost</span>
                  )}
                  {pick.boostType === "all_in" && (
                    <span className="text-xs text-purple-400">3x All-In</span>
                  )}
                  {isResolved && pred.correctOption && pred.correctOption !== pick.selectedOption && (
                    <span className="text-xs text-slate-500">
                      Answer: {pred.options?.find((o: any) => o.key === pred.correctOption)?.label || pred.correctOption}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Rewards list component
function RewardsList({ rewards }: { rewards: any[] }) {
  if (rewards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <IoTrophy className="text-4xl text-slate-600 mb-4" />
        <p className="text-white font-semibold text-lg mb-2">No rewards yet</p>
        <p className="text-slate-400 text-sm text-center">
          Finish in the top 3 of any round to win rewards!
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {rewards.map((reward: any) => (
        <div
          key={reward.id}
          className={`p-4 rounded-xl border ${
            reward.status === "active"
              ? "bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/30"
              : reward.status === "redeemed"
              ? "bg-slate-800/50 border-slate-700"
              : "bg-slate-800/30 border-slate-700/50 opacity-50"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase text-orange-400">
              {reward.round === 0 ? "Grand Prize" : `Round ${reward.round}`} — #{reward.position}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              reward.status === "active" ? "bg-green-500/20 text-green-400" :
              reward.status === "redeemed" ? "bg-slate-600 text-slate-300" :
              "bg-red-500/20 text-red-400"
            }`}>
              {reward.status === "active" ? "CLAIM" : reward.status === "redeemed" ? "USED" : "EXPIRED"}
            </span>
          </div>
          <p className="text-white font-semibold">{reward.rewardText}</p>
          {reward.status === "active" && (
            <div className="mt-3 bg-slate-900 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Show this code to staff</p>
              <p className="text-3xl font-black text-orange-500 tracking-widest">{reward.code}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Hype event overlay
function HypeOverlay({ event }: { event: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none"
    >
      <div className="text-center px-8">
        {event.type === "all_in" && (
          <>
            <IoRocket className="text-6xl text-purple-400 mx-auto mb-4" />
            <p className="text-2xl font-black text-white mb-2">ALL IN!</p>
            <p className="text-purple-300">{event.playerName} went all in on</p>
            <p className="text-white font-semibold mt-1">&quot;{event.selectedOption}&quot;</p>
          </>
        )}
        {event.type === "all_in_failed" && (
          <>
            <IoRocket className="text-6xl text-red-500 mx-auto mb-4" />
            <p className="text-2xl font-black text-red-400 mb-2">ALL IN FAILED!</p>
            <p className="text-red-300">{event.playerName} lost {event.pointsLost} points</p>
            <p className="text-slate-400 text-sm mt-2">That&apos;s gotta hurt.</p>
          </>
        )}
        {event.type === "streak" && (
          <>
            <IoFlame className="text-6xl text-yellow-400 mx-auto mb-4" />
            <p className="text-2xl font-black text-white mb-2">{event.streak} STREAK!</p>
            <p className="text-yellow-300">{event.playerName} is on fire!</p>
          </>
        )}
        {event.type === "round_winner" && (
          <>
            <IoTrophy className="text-6xl text-yellow-400 mx-auto mb-4" />
            <p className="text-2xl font-black text-white mb-2">
              {event.isGrandPrize ? "MATCH CHAMPION!" : `ROUND ${event.round} WINNER!`}
            </p>
            {event.winners?.map((w: any, i: number) => (
              <div key={i} className="mt-2">
                <span className="text-yellow-400 font-bold">#{w.position}</span>
                <span className="text-white font-semibold ml-2">{w.displayName}</span>
                <span className="text-slate-400 text-sm ml-2">{w.points} pts</span>
              </div>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}

function getRoundName(round: number): string {
  const names: Record<number, string> = {
    0: "",
    1: "— Powerplay",
    2: "— Middle Overs",
    3: "— Death Overs",
    4: "— Chase Powerplay",
    5: "— Chase Middle",
    6: "— Chase Death",
  };
  return names[round] || "";
}
