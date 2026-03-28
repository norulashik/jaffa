"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Trophy,
  Flame,
  Zap,
  Rocket,
  ChevronUp,
  ChevronDown,
  CheckCircle,
} from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import CorrectAnswerFeedback from "@/components/CorrectAnswerFeedback";
import OverBallsPanel from "@/components/OverBallsPanel";
import { api } from "@/lib/api";
import { connectSocket, joinVenueMatch, disconnectSocket } from "@/lib/socket";
import { useGame } from "@/context/GameContext";
import { toast } from "sonner";
import { cafeUrl } from "@/lib/navigation";

interface Prediction {
  id: string;
  question: string;
  category: string;
  options: { key?: string; label: string; points: number }[];
  overNumber?: number;
  status?: string;
  userAnswer?: string;
}

type Phase = "loading" | "prematch" | "live";

const QUESTION_LABELS = [
  "Match Winner",
  "Toss Call",
  "Six Showdown",
  "First Wicket",
];

export default function MatchDashboard() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  // Phase management
  const [phase, setPhase] = useState<Phase>("loading");

  // Pre-match state
  const [preMatchPredictions, setPreMatchPredictions] = useState<Prediction[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [selectedPreMatchOption, setSelectedPreMatchOption] = useState<string | null>(null);
  const [preMatchSubmitting, setPreMatchSubmitting] = useState(false);
  const [showPreMatchResult, setShowPreMatchResult] = useState(false);
  const [cardExiting, setCardExiting] = useState(false);

  // Live dashboard state
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [matchData, setMatchData] = useState<any>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [activeBoost, setActiveBoost] = useState<{
    predId: string;
    type: "boost" | "all_in";
  } | null>(null);
  const [submittingPredictionId, setSubmittingPredictionId] = useState<string | null>(null);
  const [showAllPicks, setShowAllPicks] = useState(false);
  const [picksExpanded, setPicksExpanded] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [scoreVersion, setScoreVersion] = useState(0);
  const { state: gameState, dispatch } = useGame();

  const [venueId, setVenueId] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(cafeUrl("/login"));
      return;
    }

    setVenueId(localStorage.getItem("jaffa_venue_id") || "");
  }, [router]);

  // Tick every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Phase 1: Join match and load pre-match predictions
  useEffect(() => {
    if (!matchId || !venueId) return;

    const initMatch = async () => {
      try {
        // Load match data
        const match = await api.getMatch(matchId);
        setMatchData(match);
        localStorage.setItem("jaffa_match_id", matchId);
        dispatch({ type: "SET_MATCH", matchId });

        // Join the match only if we have a match code (first time join)
        const matchCode = localStorage.getItem("jaffa_match_code") || undefined;
        if (matchCode) {
          try {
            await api.joinMatch(matchId, venueId, matchCode);
            localStorage.removeItem("jaffa_match_code");
          } catch (err: any) {
            localStorage.removeItem("jaffa_match_code");
            if (err?.message && err.message !== "Invalid match code") {
              console.error("Join match failed:", err.message);
            }
          }
        }

        // Check for unanswered pre-match questions (only if match hasn't started yet)
        const isPreMatch = !match.status || match.status === "upcoming" || match.currentPhase === "pre_match";
        if (isPreMatch) {
          try {
            const preds = await api.getPredictions(matchId, venueId, 0);
            const unanswered = (preds || []).filter(
              (p: any) => p.category === "pre_match" && !p.userAnswer && p.status === "open"
            );
            if (unanswered.length > 0) {
              setPreMatchPredictions(unanswered);
              setPhase("prematch");
            } else {
              setPhase("live");
            }
          } catch {
            setPhase("live");
          }
        } else {
          // Match already live — skip pre-match questions, go straight to live dashboard
          setPhase("live");
        }
      } catch {
        // If match load fails, still show live with fallback data
        setPhase("live");
      }
    };

    initMatch();
  }, [matchId, venueId]);

  // Phase 3: Connect socket when entering live phase
  useEffect(() => {
    if (phase !== "live") return;

    loadLiveData();

    const socket = connectSocket();
    if (venueId && matchId) {
      joinVenueMatch(venueId, matchId);
    }

    socket.on("newPrediction", (data: any) => {
      if (data.matchId === matchId) {
        loadLiveData();
      }
    });

    socket.on("predictionsLocked", (data: any) => {
      if (data.matchId === matchId) {
        loadLiveData();
      }
    });

    socket.on("scoreUpdate", (data: any) => {
      if (data.matchId === matchId) {
        setMatchData((prev: any) => ({
          ...prev,
          scoreData: data.scoreData || prev?.scoreData,
          currentInnings: data.innings ?? prev?.currentInnings,
          currentOver: data.over ?? prev?.currentOver,
        }));
        setScoreVersion((v) => v + 1);
      }
    });

    socket.on("inningsBreak", (data: any) => {
      if (data.matchId === matchId) {
        setMatchData((prev: any) => ({
          ...prev,
          currentInnings: 2,
          scoreData: {
            ...prev?.scoreData,
            target: data.target,
            innings1: {
              ...prev?.scoreData?.innings1,
              score: data.team1Score,
              wickets: data.team1Wickets,
            },
          },
        }));
        loadLiveData();
      }
    });

    socket.on("predictionResolved", (data: any) => {
      if (data.matchId === matchId) {
        // Re-fetch to get updated userAnswer with pointsEarned and isCorrect
        loadLiveData();
      }
    });

    socket.on("predictionResult", (data: any) => {
      if (data.correct) {
        setFeedbackData(data);
        setShowFeedback(true);
      }
    });

    // Polling fallback every 10s in case socket events are missed
    const pollInterval = setInterval(() => loadLiveData(), 10000);

    return () => {
      clearInterval(pollInterval);
      disconnectSocket();
    };
  }, [phase, matchId]);

  const loadLiveData = async () => {
    try {
      const [match, preds] = await Promise.all([
        api.getMatch(matchId),
        api.getPredictions(matchId, venueId),
      ]);
      setMatchData(match);

      // Detect match completion — clear stale match from state
      if (match.status === "completed") {
        dispatch({ type: "CLEAR_MATCH" });
      }

      const filtered = (preds || []).filter((p: any) => p.category !== "pre_match");
      setPredictions(filtered);
      // Restore already-answered selections
      const answered: Record<string, string> = {};
      filtered.forEach((p: any) => {
        if (p.userAnswer?.selectedOption) answered[p.id] = p.userAnswer.selectedOption;
      });
      setSelectedAnswers(answered);

      // Fetch participant stats (points, streak) and rank
      try {
        const [matchState, lb] = await Promise.all([
          api.getMatchState(matchId, venueId),
          api.getMatchLeaderboard(matchId, venueId),
        ]);
        if (matchState.participant) {
          dispatch({
            type: "UPDATE_PARTICIPANT",
            data: {
              totalPoints: matchState.participant.totalPoints || 0,
              currentStreak: matchState.participant.currentStreak || 0,
              currentRound: matchState.participant.currentRound || 1,
              boostsUsedThisRound: matchState.participant.boostsUsedRound || 0,
              boostsUsedRound: matchState.participant.boostsUsedRound || 0,
              allInUsed: Boolean(matchState.participant.allInUsed),
            },
          });
        }
        const myIndex = lb.leaderboard.findIndex(
          (e: any) => e.userId === gameState.user?.id
        );
        setUserRank(myIndex >= 0 ? myIndex + 1 : null);
      } catch {
        // Stats fetch failed — keep existing values
      }
    } catch {
      // Use placeholder data
    }
  };

  // Pre-match: handle option select
  const handlePreMatchSelect = useCallback(async (optionKey: string) => {
    if (preMatchSubmitting || selectedPreMatchOption) return;

    const currentPred = preMatchPredictions[currentCardIndex];
    if (!currentPred) return;

    setSelectedPreMatchOption(optionKey);
    setPreMatchSubmitting(true);

    try {
      await api.submitPrediction(currentPred.id, optionKey, venueId);
      setShowPreMatchResult(true);

      setTimeout(() => {
        setCardExiting(true);

        setTimeout(() => {
          setShowPreMatchResult(false);
          setSelectedPreMatchOption(null);
          setPreMatchSubmitting(false);
          setCardExiting(false);

          if (currentCardIndex < preMatchPredictions.length - 1) {
            setCurrentCardIndex((prev) => prev + 1);
          } else {
            // All pre-match questions answered — go to live
            setPhase("live");
          }
        }, 300);
      }, 600);
    } catch (err) {
      console.error("Submit error:", err);
      setSelectedPreMatchOption(null);
      setPreMatchSubmitting(false);
    }
  }, [preMatchSubmitting, selectedPreMatchOption, preMatchPredictions, currentCardIndex, venueId]);

  // Live: handle option select
  const handleOptionSelect = (predictionId: string, optionKey: string) => {
    if (selectedAnswers[predictionId]) return; // already answered
    setDraftAnswers((prev) => ({
      ...prev,
      [predictionId]: prev[predictionId] === optionKey ? "" : optionKey,
    }));
  };

  const handleToggleBoost = (predictionId: string) => {
    setActiveBoost((prev) =>
      prev?.predId === predictionId && prev.type === "boost"
        ? null
        : { predId: predictionId, type: "boost" }
    );
  };

  const handleToggleAllIn = (predictionId: string) => {
    setActiveBoost((prev) =>
      prev?.predId === predictionId && prev.type === "all_in"
        ? null
        : { predId: predictionId, type: "all_in" }
    );
  };

  const handleSubmitPrediction = async (predictionId: string) => {
    const selectedOption = draftAnswers[predictionId];
    if (!selectedOption || !venueId || submittingPredictionId === predictionId) return;

    setSubmittingPredictionId(predictionId);
    const activeBoostForPrediction =
      activeBoost && activeBoost.predId === predictionId ? activeBoost : null;
    const boostType = activeBoostForPrediction?.type;

    try {
      await api.submitPrediction(predictionId, selectedOption, venueId, boostType);
      setSelectedAnswers((prev) => ({ ...prev, [predictionId]: selectedOption }));
      setDraftAnswers((prev) => {
        const next = { ...prev };
        delete next[predictionId];
        return next;
      });
      if (boostType === "boost") {
        dispatch({ type: "USE_BOOST" });
      }
      if (boostType === "all_in") {
        dispatch({ type: "USE_ALL_IN" });
      }
      if (activeBoostForPrediction) {
        setActiveBoost(null);
      }
      toast.success("Prediction locked in!");
      await loadLiveData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit prediction");
    } finally {
      setSubmittingPredictionId(null);
    }
  };

  // ─── LOADING PHASE ───
  if (phase === "loading") {
    return (
      <div className="bg-[#0d0d0d] min-h-screen flex flex-col items-center justify-center">
        <div className="relative mb-6">
          <div
            className="w-20 h-20 flex items-center justify-center"
            style={{
              background: "#1a1a1a",
              border: "2px solid #ff6341",
              borderRadius: "4px",
              boxShadow: "4px 4px 0 0 #ff6341",
            }}
          >
            <span className="text-4xl">🏏</span>
          </div>
          <div
            className="absolute inset-0 animate-ping"
            style={{
              border: "2px solid #ff6341",
              borderRadius: "4px",
              opacity: 0.3,
            }}
          />
        </div>
        <h2
          className="text-lg mb-2"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          GETTING READY...
        </h2>
        <p className="text-sm text-white/60">Loading match predictions</p>
      </div>
    );
  }

  // ─── PRE-MATCH PHASE ───
  if (phase === "prematch") {
    const currentPred = preMatchPredictions[currentCardIndex];
    const questionLabel = QUESTION_LABELS[currentCardIndex] || `Question ${currentCardIndex + 1}`;

    return (
      <div className="bg-[#0d0d0d] min-h-screen flex flex-col">
        {/* Pre-match Header */}
        <div className="px-4 pt-6 pb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="info-pill text-white/80">
              {matchData?.team1Short || "Team 1"} vs {matchData?.team2Short || "Team 2"}
            </span>
            <span className="info-pill text-[#ff6341]">
              {currentCardIndex + 1} / {preMatchPredictions.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className="progress-bar h-3 mt-3">
            <div
              className="progress-fill"
              style={{
                width: `${((currentCardIndex + 1) / preMatchPredictions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Card Area */}
        <div className="flex-1 flex items-center justify-center px-4 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentCardIndex}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: cardExiting ? 0 : 1, x: cardExiting ? -60 : 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md game-card p-6"
            >
              {/* Question Category Label */}
              <div className="mb-3">
                <span className="info-pill text-[#ffd60a]">
                  {questionLabel}
                </span>
              </div>

              {/* Question Text */}
              <h2
                className="text-2xl text-white leading-tight mb-2"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                {currentPred?.question}
              </h2>

              {/* Points hint */}
              <p className="text-xs text-white/50 mb-8">
                {getPointsLabel(currentPred?.options || [])}
              </p>

              {/* Options */}
              <div className="space-y-3">
                {(currentPred?.options || []).map((option: any, i: number) => {
                  const optKey = option.key || option.label;
                  const isSelected = selectedPreMatchOption === optKey;
                  const hasSelection = selectedPreMatchOption !== null;

                  return (
                    <button
                      key={optKey}
                      onClick={() => handlePreMatchSelect(optKey)}
                      disabled={preMatchSubmitting}
                      className={`option-btn text-left px-5 py-4 flex items-center justify-between ${
                        isSelected
                          ? "selected"
                          : hasSelection
                          ? "opacity-50"
                          : ""
                      }`}
                      style={{
                        animationDelay: `${i * 50}ms`,
                      }}
                    >
                      <span className="text-sm font-bold">{option.label}</span>
                      <div className="flex items-center gap-2">
                        {isSelected && showPreMatchResult && (
                          <CheckCircle className="w-5 h-5 text-black" />
                        )}
                        <span className={`text-xs font-black ${
                          isSelected ? "text-black" : "text-[#ff6341]"
                        }`}>
                          {option.points} pts
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom hint */}
        <div className="text-center pb-8">
          <p className="text-xs text-white/40">Tap to select your prediction</p>
        </div>
      </div>
    );
  }

  // ─── LIVE DASHBOARD PHASE ───
  return (
    <div className="bg-[#0d0d0d] text-white overflow-x-hidden">
      {/* TopAppBar */}
      <Header />

      <main className="pt-24 pb-52 px-4 min-h-screen space-y-6 max-w-2xl mx-auto">
        {/* Scoreboard Hero Section */}
        {(() => {
          const sd = matchData?.scoreData || {};
          const currInn = sd.currentInnings || matchData?.currentInnings || 1;
          const innings1 = sd.innings1;
          const innings2 = sd.innings2;

          // Determine batting/bowling teams — batting always left, bowling always right
          // innings1.teamShort = who batted first (set by backend from Sportsmonk runs data)
          const battingFirstShort = innings1?.teamShort || matchData?.team1Short || "T1";
          const bowlingFirstShort = battingFirstShort === (matchData?.team1Short || "T1")
            ? (matchData?.team2Short || "T2") : (matchData?.team1Short || "T1");
          const battingTeam = currInn === 1 ? battingFirstShort : bowlingFirstShort;
          const bowlingTeam = currInn === 1 ? bowlingFirstShort : battingFirstShort;
          const battingImg = battingTeam === matchData?.team1Short ? sd.team1Img : sd.team2Img;
          const bowlingImg = bowlingTeam === matchData?.team1Short ? sd.team1Img : sd.team2Img;

          const activeInnings = currInn === 1 ? innings1 : innings2;
          const score = activeInnings?.score ?? 0;
          const wickets = activeInnings?.wickets ?? 0;
          const overs = activeInnings?.overs ?? sd.currentOver ?? 0;

          const crr = overs > 0 ? (score / overs).toFixed(2) : "0.00";
          const target = innings1 && currInn === 2 ? innings1.score + 1 : null;
          const runsNeeded = target ? target - (innings2?.score || 0) : null;
          const rrr = target && overs < 20
            ? (((runsNeeded || 0) / (20 - overs))).toFixed(2)
            : null;

          return (
            <section className="game-card p-5 relative overflow-hidden">
              {/* Series & Live badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="info-pill text-white/60">
                  {sd.series || `${matchData?.team1Short || "T1"} vs ${matchData?.team2Short || "T2"}`}
                </span>
                {matchData?.status === "completed" ? (
                  <span className="info-pill text-white/60">COMPLETED</span>
                ) : (
                  <span className="live-badge">LIVE</span>
                )}
              </div>

              {/* Score Display */}
              <div className="flex items-center justify-between">
                {/* Batting Team — LEFT */}
                <div className="flex items-center gap-3">
                  {battingImg ? (
                    <img
                      src={battingImg}
                      alt={battingTeam}
                      className="w-8 h-8"
                      style={{ borderRadius: "2px", border: "2px solid #2a2a2a" }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 flex items-center justify-center text-xs font-black text-[#ff6341]"
                      style={{ background: "#1a1a1a", borderRadius: "2px", border: "2px solid #ff6341" }}
                    >
                      {battingTeam?.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                      >
                        {battingTeam}
                      </span>
                      <span className="info-pill text-[#ff6341] !py-0.5 !px-1.5 !text-[10px]">BAT</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="stat-number" style={{ color: "#ff6341" }}>
                        {score}/{wickets}
                      </span>
                      <span className="text-sm text-white/50">({overs} ov)</span>
                    </div>
                  </div>
                </div>

                {/* VS / Target */}
                <div className="text-center">
                  {target ? (
                    <div>
                      <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Need</div>
                      <div
                        className="text-lg font-black text-[#ffd60a]"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                      >
                        {runsNeeded}
                      </div>
                      <div className="text-[10px] text-white/40">off {(20 - overs) > 0 ? Math.ceil((20 - overs) * 6) : 0} balls</div>
                    </div>
                  ) : (
                    <div
                      className="font-bold text-sm text-white/30"
                      style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                    >
                      VS
                    </div>
                  )}
                </div>

                {/* Bowling Team — RIGHT */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="text-lg font-bold text-white/60"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                      >
                        {bowlingTeam}
                      </span>
                      <span className="info-pill text-[#3b9eff] !py-0.5 !px-1.5 !text-[10px]">BOWL</span>
                    </div>
                    {innings1 && currInn === 2 && (
                      <div className="text-sm text-white/50">
                        {innings1.score}/{innings1.wickets} ({innings1.overs} ov)
                      </div>
                    )}
                    {currInn === 1 && (
                      <div className="text-xs text-white/40">Yet to bat</div>
                    )}
                  </div>
                  {bowlingImg ? (
                    <img
                      src={bowlingImg}
                      alt={bowlingTeam}
                      className="w-8 h-8"
                      style={{ borderRadius: "2px", border: "2px solid #2a2a2a" }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 flex items-center justify-center text-xs font-black text-[#3b9eff]"
                      style={{ background: "#1a1a1a", borderRadius: "2px", border: "2px solid #3b9eff" }}
                    >
                      {bowlingTeam?.charAt(0)}
                    </div>
                  )}
                </div>
              </div>

              {/* CRR / RRR */}
              <div className="flex items-center justify-between mt-3">
                <span className="info-pill text-white/60 !text-[11px]">
                  CRR: <span className="text-white font-bold">{crr}</span>
                </span>
                {rrr && (
                  <span className="info-pill text-white/60 !text-[11px]">
                    RRR: <span className="text-[#3b9eff] font-bold">{rrr}</span>
                  </span>
                )}
              </div>
            </section>
          );
        })()}

        {(() => {
          const sd = matchData?.scoreData || {};
          const currentOver = sd.currentOver || matchData?.currentOver || 0;
          const nextOver = currentOver + 1;
          if (currentOver > 0 && nextOver <= 20) {
            return (
              <>
                <div className="text-center py-2">
                  <p className="text-sm text-[#ff6341] font-bold uppercase">
                    Make predictions for Over {nextOver} before this over ends!
                  </p>
                </div>
                <OverBallsPanel matchId={matchId} scoreVersion={scoreVersion} />
              </>
            );
          }
          return null;
        })()}

        {/* Predict Tabs */}
        {(() => {
          const sd = matchData?.scoreData || {};
          const currInn = sd.currentInnings || matchData?.currentInnings || 1;
          const currOv = sd.currentOver || matchData?.currentOver || 0;
          // Innings 2 has started (at least 1 ball bowled) — hide rivalry_call predictions
          const innings2Started = currInn === 2 && currOv >= 1;

          const unanswered = predictions.filter((p: any) => {
            if (p.status !== "open") return false;
            if (selectedAnswers[p.id] || p.userAnswer?.selectedOption) return false;
            // Hide rivalry_call once innings 2 overs begin (they were for innings break only)
            if (innings2Started && p.category === "rivalry_call") return false;
            // Never show pre_match in live feed
            if (p.category === "pre_match") return false;
            return true;
          });
          const openPreds = unanswered.filter((p: any) => !p.expiresAt || new Date(p.expiresAt).getTime() > now);
          const missedPreds = unanswered.filter((p: any) => p.expiresAt && new Date(p.expiresAt).getTime() <= now);
          const answeredPreds = predictions.filter((p: any) => selectedAnswers[p.id] || p.userAnswer?.selectedOption);
          const boostsRemaining = Math.max(0, 2 - (gameState.boostsUsedThisRound || 0));
          const allInAvailable = !gameState.allInUsed;

          const getCategoryLabel = (pred: any) => {
            if (pred.category === "per_over") return `Over ${pred.overNumber || ""}`;
            if (pred.category === "hot_take") return "Hot Take";
            return pred.category?.replace(/_/g, " ") || "Predict";
          };

          const getOptionLabel = (pred: any, key: string) =>
            pred.options?.find((o: any) => (o.key || o.label) === key)?.label || key;

          return (
            <>
              <div className="space-y-4">
                  {/* Open unanswered predictions */}
                  {openPreds.map((pred: any) => {
                    const expiresAt = pred.expiresAt ? new Date(pred.expiresAt).getTime() : null;
                    const timeLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
                    const isExpired = timeLeft !== null && timeLeft <= 0;
                    const selectedOption = draftAnswers[pred.id] || "";
                    const isSubmitting = submittingPredictionId === pred.id;
                    const boostStateForPrediction =
                      activeBoost && activeBoost.predId === pred.id ? activeBoost : null;
                    const boostType = boostStateForPrediction?.type ?? null;
                    const isBoostActive = boostType === "boost";
                    const isAllInActive = boostType === "all_in";
                    const hasBoost = isBoostActive || isAllInActive;
                    const canUseBoost = boostsRemaining > 0;
                    const canUseAllIn = allInAvailable;

                    return (
                    <section
                      key={pred.id}
                      className={`game-card p-5 relative overflow-hidden ${isExpired ? "opacity-50" : ""} ${
                        isAllInActive
                          ? "!border-[#ffd60a] !shadow-[4px_4px_0_0_#ffd60a]"
                          : isBoostActive
                          ? "!border-[#3b9eff] !shadow-[4px_4px_0_0_#3b9eff]"
                          : ""
                      }`}
                      style={pred.category === "hot_take" && !hasBoost ? { borderLeft: "4px solid #ffd60a" } : undefined}
                    >
                      {hasBoost && (
                        <div
                          className={`-mx-5 -mt-5 mb-3 px-5 py-2 text-center text-xs font-black uppercase tracking-wider border-b-2 ${
                            isAllInActive
                              ? "bg-[#ffd60a]/10 text-[#ffd60a] border-[#ffd60a]"
                              : "bg-[#3b9eff]/10 text-[#3b9eff] border-[#3b9eff]"
                          }`}
                        >
                          {isAllInActive
                            ? "ALL-IN ACTIVE (3x) - Lock in your answer!"
                            : "BOOST ACTIVE (2x) - Lock in your answer!"}
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex flex-col gap-1">
                          <span className="info-pill inline-block w-fit text-[#ffd60a]">
                            {getCategoryLabel(pred)}
                          </span>
                          <h3
                            className="text-lg text-white"
                            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                          >
                            {pred.question}
                          </h3>
                        </div>
                        {timeLeft !== null && (
                          isExpired ? (
                            <span className="info-pill text-white/50">LOCKED</span>
                          ) : timeLeft <= 15 ? (
                            <span className="live-badge">{timeLeft}s</span>
                          ) : (
                            <span className="info-pill text-[#ff6341]">{timeLeft}s</span>
                          )
                        )}
                      </div>
                      <div className="space-y-2 mb-4">
                        {(pred.options || []).map((opt: any, i: number) => {
                          const optKey = opt.key || opt.label;
                          const isSelected = selectedOption === optKey;
                          const multiplier = isAllInActive ? 3 : isBoostActive ? 2 : 1;
                          return (
                            <button
                              key={i}
                              onClick={() => !isExpired && !isSubmitting && handleOptionSelect(pred.id, optKey)}
                              disabled={isExpired || isSubmitting}
                              className={`option-btn text-left p-3 flex justify-between items-center ${
                                isSelected ? "selected" : ""
                              } ${isExpired ? "opacity-40 cursor-not-allowed" : ""} ${
                                isSubmitting ? "opacity-80 cursor-wait" : ""
                              }`}
                            >
                              <span className="text-sm font-bold">{opt.label}</span>
                              <span className={`text-xs font-black ${isSelected ? "text-black" : "text-[#ff6341]"}`}>
                                {opt.points * multiplier} pts
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {canUseBoost && !hasBoost && (
                          <button
                            onClick={() => handleToggleBoost(pred.id)}
                            disabled={isExpired || isSubmitting || !selectedOption}
                            className="btn-secondary px-3 py-1.5 flex items-center gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Zap className="w-3.5 h-3.5 text-[#ff6341]" />
                            <span className="text-[10px] font-black tracking-tight">2x BOOST</span>
                          </button>
                        )}
                        {canUseAllIn && !hasBoost && (
                          <button
                            onClick={() => handleToggleAllIn(pred.id)}
                            disabled={isExpired || isSubmitting || !selectedOption}
                            className="btn-secondary px-3 py-1.5 flex items-center gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Rocket className="w-3.5 h-3.5 text-[#ff6341]" />
                            <span className="text-[10px] font-black tracking-tight">3x ALL-IN</span>
                          </button>
                        )}
                        {hasBoost && (
                          <button
                            onClick={() => setActiveBoost(null)}
                            disabled={isSubmitting}
                            className="text-xs text-white/50 font-bold uppercase hover:text-white/80 transition-colors disabled:opacity-50"
                          >
                            Cancel {isAllInActive ? "All-In" : "Boost"}
                          </button>
                        )}
                      </div>
                      {selectedOption && !isExpired && (
                        <button
                          onClick={() => handleSubmitPrediction(pred.id)}
                          disabled={isSubmitting}
                          className="btn-sticker btn-green w-full py-3 text-sm gap-2"
                        >
                          {isSubmitting ? "LOCKING..." : "LOCK IN PREDICTION"}
                        </button>
                      )}
                    </section>
                    );
                  })}

                  {/* All caught up */}
                  {openPreds.length === 0 && (
                    <div className="game-card flex flex-col items-center justify-center py-16 text-center p-6">
                      <span className="text-5xl mb-4">🏏</span>
                      <h3
                        className="text-xl text-white mb-2"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                      >
                        ALL CAUGHT UP!
                      </h3>
                      <p className="text-sm text-white/50 max-w-[240px]">
                        New predictions drop at the end of this over. Keep watching!
                      </p>
                    </div>
                  )}

                  {/* My Picks */}
                  {(answeredPreds.length > 0 || missedPreds.length > 0) && (() => {
                    const allPicks = [...answeredPreds, ...missedPreds].reverse();
                    const visiblePicks = showAllPicks ? allPicks : allPicks.slice(0, 5);
                    const hasMore = allPicks.length > 5;
                    return (
                    <div className="mt-2">
                      <button
                        onClick={() => setPicksExpanded(!picksExpanded)}
                        className="flex justify-between items-center w-full mb-3 px-1"
                      >
                        <span className="text-sm font-black text-white/60 uppercase tracking-wider">
                          My Picks ({allPicks.length})
                        </span>
                        {picksExpanded ? (
                          <ChevronUp className="w-5 h-5 text-white/60" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-white/60" />
                        )}
                      </button>
                      {picksExpanded && (
                        <>
                          <div className="space-y-2">
                            {visiblePicks.map((pred: any) => {
                              const selectedKey = selectedAnswers[pred.id] || pred.userAnswer?.selectedOption;
                              const isMissed = !selectedKey;
                              const selectedLabel = isMissed ? null : getOptionLabel(pred, selectedKey);
                              const isClosed = pred.status === "resolved";
                              const isCorrect = isClosed && !isMissed ? (selectedKey === pred.correctOption) : undefined;
                              const pointsEarned = pred.userAnswer?.pointsEarned || (isCorrect ? (pred.options?.find((o: any) => (o.key || o.label) === selectedKey)?.points || 10) : 0);
                              const correctAnswerLabel = isClosed && !isCorrect && pred.correctOption
                                ? getOptionLabel(pred, pred.correctOption)
                                : null;

                              let statusText = "PENDING";
                              let statusColor = "text-[#ffd60a]";
                              let cardClass = "game-card";
                              if (isMissed) {
                                statusText = "MISSED";
                                statusColor = "text-white/40";
                                cardClass = "game-card opacity-50";
                              } else if (isClosed && isCorrect === true) {
                                statusText = `+${pointsEarned || 0} pts`;
                                statusColor = "text-[#22c55e]";
                                cardClass = "card-green";
                              } else if (isClosed && isCorrect === false) {
                                statusText = "WRONG";
                                statusColor = "text-[#ff6341]";
                                cardClass = "card-orange";
                              }

                              return (
                                <div key={pred.id} className={`${cardClass} p-4`}>
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="info-pill inline-block w-fit text-white/50 !text-[10px]">
                                      {getCategoryLabel(pred)}
                                    </span>
                                    <span className={`text-xs font-black ${statusColor}`}>{statusText}</span>
                                  </div>
                                  <p className="text-sm font-bold text-white mb-2">{pred.question}</p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isMissed ? (
                                      <span className="info-pill text-white/40">
                                        Not answered
                                      </span>
                                    ) : (
                                      <span className={`info-pill ${
                                        isClosed && isCorrect === false
                                          ? "!border-[#ff6341] text-[#ff6341]"
                                          : isClosed && isCorrect === true
                                          ? "!border-[#22c55e] text-[#22c55e]"
                                          : "text-white/60"
                                      }`}>
                                        Your pick: {selectedLabel}
                                      </span>
                                    )}
                                    {correctAnswerLabel && (
                                      <span className="text-xs text-white/40">
                                        Answer: {correctAnswerLabel}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {hasMore && (
                            <button
                              onClick={() => setShowAllPicks(!showAllPicks)}
                              className="w-full py-3 text-center text-xs font-black text-[#ff6341] uppercase tracking-widest hover:text-[#ff6341]/80 transition-colors"
                            >
                              {showAllPicks ? "Show less" : `See more (${allPicks.length - 5} more)`}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    );
                  })()}
                </div>
            </>
          );
        })()}

      </main>

      {/* Footer Stats Bar */}
      <div className="fixed bottom-[84px] left-0 w-full px-4 z-40 pointer-events-none">
        <div
          className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between pointer-events-auto"
          style={{
            background: "#1a1a1a",
            borderTop: "2px solid #ff6341",
            borderRadius: "4px",
            boxShadow: "4px 4px 0 0 #ff6341",
          }}
        >
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[#ffd60a]" />
            <span className="text-xs font-black uppercase tracking-tight">
              Points: <span className="text-[#ffd60a]">{gameState.totalPoints}</span>
            </span>
          </div>
          <div className="w-[1px] h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-white/60" />
            <span className="text-xs font-black uppercase tracking-tight">
              Rank: <span className="text-white">{userRank ? `#${userRank}` : "--"}</span>
            </span>
          </div>
          <div className="w-[1px] h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#ff6341]" />
            <span className="text-xs font-black uppercase tracking-tight">
              Streak: <span className="text-[#ff6341]">{gameState.currentStreak}</span>
            </span>
          </div>
        </div>
      </div>

      <BottomNav />

      {/* Correct Answer Feedback Overlay */}
      {showFeedback && feedbackData && (
        <CorrectAnswerFeedback
          points={feedbackData.points || 50}
          prediction={feedbackData.prediction || "Boundary (4/6)"}
          result={feedbackData.result || "4 Runs"}
          streak={feedbackData.streak || 3}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}

function getPointsLabel(options: { points: number }[]): string {
  if (!options.length) return "";
  const points = [...new Set(options.map((o) => o.points))];
  if (points.length === 1) return `${points[0]} points if correct`;
  return `${Math.min(...points)}-${Math.max(...points)} points based on pick`;
}
