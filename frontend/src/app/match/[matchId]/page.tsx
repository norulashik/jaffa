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
import Scorecard from "@/components/Scorecard";
import { api } from "@/lib/api";
import { connectSocket, joinVenueMatch, disconnectSocket } from "@/lib/socket";
import { useGame } from "@/context/GameContext";
import { toast } from "sonner";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";

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

// Mirrors backend predictionEngine.getCurrentRound — used as a client-side
// fallback when participant.currentRound on the API hasn't caught up to the
// live innings/over (e.g. Sportsmonk poll missed an over transition).
function deriveRound(currentInnings: number, currentOver: number, totalOvers: number = 20): number {
  if (!currentInnings || currentInnings === 0) return 0;
  const overs = totalOvers || 20;
  let ppEnd = Math.min(6, overs);
  let midEnd = Math.ceil(overs * 0.75);
  if (overs <= 3) { ppEnd = 1; midEnd = 2; }
  else if (ppEnd >= midEnd) { midEnd = ppEnd + 1; }
  if (currentInnings === 1) {
    if (currentOver <= ppEnd) return 1;
    if (currentOver <= midEnd) return 2;
    return 3;
  }
  if (currentOver <= ppEnd) return 4;
  if (currentOver <= midEnd) return 5;
  return 6;
}

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
  // Which over-groups inside My Picks are expanded. Keyed by "over-<n>" or
  // "others". Starts empty — all groups collapsed.
  const [expandedPickGroups, setExpandedPickGroups] = useState<Set<string>>(new Set());
  const [picksExpanded, setPicksExpanded] = useState(false);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [scoreVersion, setScoreVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<"predict" | "scorecard">("predict");
  const { state: gameState, dispatch } = useGame();

  const [venueId, setVenueId] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }

    setVenueId(localStorage.getItem("jaffa_venue_id") || "");
  }, [router]);

  // Tick every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshPreMatchState = useCallback(async () => {
    const preds = await api.getPredictions(matchId, venueId, 0);
    const unanswered = (preds || []).filter(
      (p: any) => p.category === "pre_match" && !p.userAnswer && p.status === "open"
    );

    if (unanswered.length > 0) {
      setPreMatchPredictions(unanswered);
      setCurrentCardIndex(0);
      setPhase("prematch");
    } else {
      setPreMatchPredictions([]);
      setCurrentCardIndex(0);
      setPhase("live");
    }
  }, [matchId, venueId]);

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
            // Capture GPS for city/state leaderboard (non-blocking)
            let lat: number | undefined;
            let lng: number | undefined;
            try {
              const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
              );
              lat = pos.coords.latitude;
              lng = pos.coords.longitude;
            } catch {}
            await api.joinMatch(matchId, venueId, matchCode, lat, lng);
            localStorage.removeItem("jaffa_match_code");
          } catch (err: any) {
            localStorage.removeItem("jaffa_match_code");
            if (err?.message && err.message !== "Invalid match code") {
              console.error("Join match failed:", err.message);
            }
          }
        }

        // Always check for unanswered open pre-match questions first.
        // Even if match is already "live" (toss done), the 3 non-toss questions
        // may have just been unlocked and the user hasn't answered them yet.
        try {
          await refreshPreMatchState();
        } catch {
          setPhase("live");
        }
      } catch {
        // If match load fails, still show live with fallback data
        setPhase("live");
      }
    };

    initMatch();
  }, [matchId, venueId, refreshPreMatchState]);

  // Phase 2: In prematch, listen for toss detection to reload unlocked questions
  useEffect(() => {
    if (phase !== "prematch" || !venueId || !matchId) return;

    const socket = connectSocket();
    joinVenueMatch(venueId, matchId);

    // Toss detected: toss card disappears; any remaining open pre-match cards stay visible
    socket.on("tossLocked", async (data: any) => {
      if (data.matchId !== matchId) return;
      try {
        await refreshPreMatchState();
      } catch {
        setPhase("live");
      }
    });

    // Match start should not force live mode if open pre-match questions still exist.
    socket.on("matchStarted", (data: any) => {
      if (data.matchId !== matchId) return;
      refreshPreMatchState().catch(() => setPhase("live"));
    });
    socket.on("predictionsLocked", async (data: any) => {
      if (data.matchId !== matchId) return;
      try {
        await refreshPreMatchState();
      } catch {
        setPhase("live");
      }
    });

    return () => {
      socket.off("tossLocked");
      socket.off("matchStarted");
      socket.off("predictionsLocked");
    };
  }, [phase, matchId, venueId, refreshPreMatchState]);

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

    // Leaderboard changed → our points/streak may have shifted. Refresh participant.
    socket.on("leaderboardUpdate", () => {
      loadLiveData();
    });

    // Prediction voided (rain abandon / no-result) → refresh and let the UI
    // fade the card. loadLiveData will pick up the status change.
    socket.on("predictionVoided", (data: any) => {
      if (data.matchId === matchId) {
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
      socket.off("newPrediction");
      socket.off("predictionsLocked");
      socket.off("scoreUpdate");
      socket.off("inningsBreak");
      socket.off("predictionResolved");
      socket.off("leaderboardUpdate");
      socket.off("predictionVoided");
      socket.off("predictionResult");
      disconnectSocket();
    };
  }, [phase, matchId, venueId]);

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
        const roomId = gameState.roomId || localStorage.getItem("jaffa_room_id");
        const [matchState, lb] = await Promise.all([
          api.getMatchState(matchId, venueId),
          roomId ? api.getRoomLeaderboard(roomId) : api.getMatchLeaderboard(matchId, venueId),
        ]);
        if (matchState.participant) {
          // Server stores `currentRound` on MatchParticipant, but it only
          // bumps at over transitions caught by the poll. If Sportsmonk
          // momentarily fails to return fixture data, the transition can be
          // missed and the round stays stale (e.g. user is in innings-2
          // over 4 but participant.currentRound still reads 3). Derive the
          // round from the live innings + over and take the higher value
          // so the leaderboard pills don't lag behind real play.
          const liveInn = matchState.match?.currentInnings || matchState.match?.scoreData?.currentInnings || 1;
          const liveOver = matchState.match?.currentOver || matchState.match?.scoreData?.currentOver || 0;
          const totalOvers = matchState.match?.totalOvers || 20;
          const derivedRound = deriveRound(liveInn, liveOver, totalOvers);
          const serverRound = matchState.participant.currentRound || 1;
          const effectiveRound = Math.max(serverRound, derivedRound);
          dispatch({
            type: "UPDATE_PARTICIPANT",
            data: {
              totalPoints: matchState.participant.totalPoints || 0,
              currentStreak: matchState.participant.currentStreak || 0,
              currentRound: effectiveRound,
              boostsUsedThisRound: matchState.participant.boostsUsedRound || 0,
              boostsUsedRound: matchState.participant.boostsUsedRound || 0,
              allInUsed: Boolean(matchState.participant.allInUsed),
              allInUsedInnings1: Boolean(matchState.participant.allInUsedInnings1),
              allInUsedInnings2: Boolean(matchState.participant.allInUsedInnings2),
            },
          });
        }
        const storedUser = localStorage.getItem("jaffa_user");
        let currentUserId = gameState.user?.id;
        if (storedUser) { try { currentUserId = JSON.parse(storedUser).id; } catch {} }
        const myIndex = lb.leaderboard.findIndex(
          (e: any) => e.userId === currentUserId
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

        setTimeout(async () => {
          setShowPreMatchResult(false);
          setSelectedPreMatchOption(null);
          setPreMatchSubmitting(false);
          setCardExiting(false);

          if (currentCardIndex < preMatchPredictions.length - 1) {
            setCurrentCardIndex((prev) => prev + 1);
          } else {
            // Re-check backend state in case more open pre-match cards remain.
            try {
              await refreshPreMatchState();
            } catch {
              setPhase("live");
            }
          }
        }, 300);
      }, 600);
    } catch (err) {
      console.error("Submit error:", err);
      setSelectedPreMatchOption(null);
      setPreMatchSubmitting(false);
    }
  }, [preMatchSubmitting, selectedPreMatchOption, preMatchPredictions, currentCardIndex, venueId, refreshPreMatchState]);

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
        // Innings from prediction's round: rounds 1-3 → innings 1, 4-6 → innings 2.
        const pred = predictions.find((p: any) => p.id === predictionId) as any;
        const predInnings: 1 | 2 = pred && pred.round >= 4 ? 2 : 1;
        dispatch({ type: "USE_ALL_IN", innings: predInnings });
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
          const totalOvers = matchData?.totalOvers || 20;
          const rrr = target && overs < totalOvers
            ? (((runsNeeded || 0) / (totalOvers - overs))).toFixed(2)
            : null;

          // Compute the result string for completed matches:
          //   - Chasing side scored ≥ target → won by N wickets (10 - inn2.wickets)
          //   - Else defending side won by (inn1.score - inn2.score) runs
          let resultText: string | null = null;
          if (matchData?.status === "completed" && innings1) {
            const inn1Score = Number(innings1.score || 0);
            const inn2Score = Number(innings2?.score || 0);
            const inn2Wkts = Number(innings2?.wickets || 0);
            if (innings2 && inn2Score > inn1Score) {
              const wktsLeft = Math.max(0, 10 - inn2Wkts);
              resultText = `${bowlingFirstShort} won by ${wktsLeft} wkt${wktsLeft === 1 ? "" : "s"}`;
            } else if (innings2 && inn2Score < inn1Score) {
              const runs = inn1Score - inn2Score;
              resultText = `${battingFirstShort} won by ${runs} run${runs === 1 ? "" : "s"}`;
            } else if (innings2) {
              resultText = "Match tied";
            } else {
              resultText = `${battingFirstShort} won`;
            }
          }

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

                {/* VS / Target / Result */}
                <div className="text-center">
                  {resultText ? (
                    <div className="px-3">
                      <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Result</div>
                      <div
                        className="text-sm font-black text-[#22c55e] leading-tight"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                      >
                        {resultText}
                      </div>
                    </div>
                  ) : target ? (
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
          // Completed match → "BATTLE OVER" banner instead of the live header.
          // Used for the past-battles flow: same /match URL, read-only mode.
          if (matchData?.status === "completed") {
            return (
              <>
                <div className="text-center py-2">
                  <span
                    className="inline-block px-4 py-1.5 text-sm font-black uppercase tracking-widest text-black bg-[#22c55e] border-2 border-black"
                    style={{ fontFamily: "'Bungee', 'Impact', cursive", boxShadow: "3px 3px 0 0 #000" }}
                  >
                    Battle Over
                  </span>
                </div>
                <OverBallsPanel matchId={matchId} scoreVersion={scoreVersion} />
              </>
            );
          }
          if (currentOver > 0 && nextOver <= (matchData?.totalOvers || 20)) {
            return (
              <>
                <div className="text-center py-2">
                  <p className="text-sm text-[#ff6341] font-bold uppercase">
                    Lock in your next-over picks
                  </p>
                </div>
                <OverBallsPanel matchId={matchId} scoreVersion={scoreVersion} />
              </>
            );
          }
          return null;
        })()}

        {/* Tab Switcher: Predict / Scorecard */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("predict")}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-[3px] border-2 transition-all ${
              activeTab === "predict"
                ? "bg-[#ff6341] text-black border-black shadow-[2px_2px_0_0_#000]"
                : "bg-[#0d0d0d] text-white/50 border-[#2a2a2a]"
            }`}
          >
            Predict
          </button>
          <button
            onClick={() => setActiveTab("scorecard")}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-[3px] border-2 transition-all ${
              activeTab === "scorecard"
                ? "bg-[#ff6341] text-black border-black shadow-[2px_2px_0_0_#000]"
                : "bg-[#0d0d0d] text-white/50 border-[#2a2a2a]"
            }`}
          >
            Scorecard
          </button>
        </div>

        {/* Scorecard Tab */}
        {activeTab === "scorecard" && (
          <Scorecard matchId={matchId} scoreVersion={scoreVersion} matchData={matchData} />
        )}

        {/* Predict Tabs */}
        {activeTab === "predict" && (() => {
          const sd = matchData?.scoreData || {};
          const currInn = sd.currentInnings || matchData?.currentInnings || 1;
          const currOv = sd.currentOver || matchData?.currentOver || 0;
          // Only hide rivalry calls when innings 2 actually has balls bowled (overs > 0)
          const inn2Overs = Number(sd?.innings2?.overs || 0);
          const innings2Started = currInn === 2 && inn2Overs > 0;

          // All live-player subject types — covered uniformly in the sort,
          // filter, and label functions below.
          const LIVE_PLAYER_SUBJECTS = new Set([
            "batsman_innings",
            "batsman_sixes",
            "bowler_innings",
            "bowler_innings_wkts",
          ]);
          const LOCK_GRACE_MS = 30_000;
          const unanswered = predictions.filter((p: any) => {
            // Show open questions AND recently-locked live-player questions
            // (30 s grace after lock). After the grace window they drop out of
            // the live feed — they remain in My Picks / post-match recap.
            const isLockedLivePlayer =
              p.status === "locked" && LIVE_PLAYER_SUBJECTS.has(p.subjectType);
            if (isLockedLivePlayer) {
              const lockedAt = new Date(p.updatedAt || p.createdAt || 0).getTime();
              if (Date.now() - lockedAt > LOCK_GRACE_MS) return false;
            } else if (p.status !== "open") {
              return false;
            }
            if (selectedAnswers[p.id] || p.userAnswer?.selectedOption) return false;
            // Hide rivalry_call once innings 2 overs begin (they were for innings break only)
            if (innings2Started && p.category === "rivalry_call") return false;
            // Never show pre_match in live feed
            if (p.category === "pre_match") return false;
            return true;
          });
          // Priority ordering: live player questions (batsman at crease / bowler in spell)
          // come first — they feel most relevant and time-sensitive. Then per-over team
          // questions, then hot-takes / bold-calls / rivalry.
          const predictionRank = (p: any): number => {
            // Batsman-centric live questions (at crease + first-six bonus) on top.
            if (p.subjectType === "batsman_innings") return 0;
            if (p.subjectType === "batsman_sixes")   return 0;
            // Bowler-centric live questions next (runs-conceded + wickets variant).
            if (p.subjectType === "bowler_innings")  return 1;
            if (p.subjectType === "bowler_innings_wkts") return 1;
            if (p.category === "per_over") return 2;
            if (p.category === "hot_take") return 3;
            if (p.category === "bold_call") return 4;
            if (p.category === "rivalry_call") return 5;
            return 9;
          };
          // Drop every still-open prediction once the match is completed —
          // the user can't answer them anymore and the backend's auto-void
          // pass may not have fired yet on this poll cycle. Frontend gate
          // keeps the UI honest immediately on match end without waiting
          // for the next refresh.
          const isMatchCompleted = matchData?.status === "completed";
          const openPreds = isMatchCompleted
            ? []
            : unanswered
                .filter((p: any) => !p.expiresAt || new Date(p.expiresAt).getTime() > now)
                .sort((a: any, b: any) => predictionRank(a) - predictionRank(b));
          const missedPreds = unanswered.filter((p: any) => p.expiresAt && new Date(p.expiresAt).getTime() <= now);
          const answeredPreds = predictions.filter((p: any) => selectedAnswers[p.id] || p.userAnswer?.selectedOption);
          // Product rule: 1 boost per phase (= round). Backend enforces the same cap.
          const boostsRemaining = Math.max(0, 1 - (gameState.boostsUsedThisRound || 0));
          // All-in availability is per-innings (innings 1 = rounds 1-3, innings 2 = rounds 4-6).
          // Computed per-card below using the prediction's own round.
          const isAllInAvailableForRound = (round: number): boolean => {
            const innings = round >= 4 ? 2 : 1;
            return innings === 1 ? !gameState.allInUsedInnings1 : !gameState.allInUsedInnings2;
          };

          const liveOver = matchData?.scoreData?.currentOver || matchData?.currentOver || 0;
          const getCategoryLabel = (pred: any) => {
            if (pred.category === "per_over") {
              if (pred.subjectType === "batsman_innings")      return "Live: at crease";
              if (pred.subjectType === "batsman_sixes")        return "Live: big hitter";
              if (pred.subjectType === "bowler_innings")       return "Live: bowling";
              if (pred.subjectType === "bowler_innings_wkts")  return "Live: hunting wickets";
              const n = pred.overNumber;
              if (!n) return "Over";
              if (liveOver && n === liveOver) return `Over ${n} — live`;
              if (liveOver && n === liveOver + 1) return "Next over";
              return `Over ${n}`;
            }
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
                    // Live-player questions lock 30 s after creation; treat "locked"
                    // status as expired so the card is visible but non-interactive.
                    const isLockedByStatus = pred.status === "locked";
                    const isExpired = (timeLeft !== null && timeLeft <= 0) || isLockedByStatus;
                    const selectedOption = draftAnswers[pred.id] || "";
                    const isSubmitting = submittingPredictionId === pred.id;
                    const boostStateForPrediction =
                      activeBoost && activeBoost.predId === pred.id ? activeBoost : null;
                    const boostType = boostStateForPrediction?.type ?? null;
                    const isBoostActive = boostType === "boost";
                    const isAllInActive = boostType === "all_in";
                    const hasBoost = isBoostActive || isAllInActive;
                    // "In flight" guards — if the user has already toggled 2x or 3x on
                    // another card, hide the same option on THIS card. The token is
                    // one-per-scope and committing it elsewhere means it isn't
                    // available here either.
                    const boostToggledElsewhere =
                      !!activeBoost && activeBoost.predId !== pred.id && activeBoost.type === "boost";
                    const allInToggledElsewhere =
                      !!activeBoost && activeBoost.predId !== pred.id && activeBoost.type === "all_in";
                    const canUseBoost = boostsRemaining > 0 && !boostToggledElsewhere;
                    const canUseAllIn =
                      isAllInAvailableForRound(Number(pred.round) || 1) && !allInToggledElsewhere;

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

                  {/* All caught up — slightly different copy when the match
                      is over (read-only past-battles flow) vs mid-match. */}
                  {openPreds.length === 0 && (
                    <div className="game-card flex flex-col items-center justify-center py-16 text-center p-6">
                      <span className="text-5xl mb-4">🏏</span>
                      <h3
                        className="text-xl text-white mb-2"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                      >
                        {matchData?.status === "completed" ? "MATCH COMPLETE" : "ALL CAUGHT UP!"}
                      </h3>
                      <p className="text-sm text-white/50 max-w-[260px]">
                        {matchData?.status === "completed"
                          ? "Open My Picks below to see how you did."
                          : "New predictions drop at the end of this over. Keep watching!"}
                      </p>
                    </div>
                  )}

                  {/* My Picks — grouped into per-over drawers with an "Others"
                      drawer for non-per-over picks (hot takes, bold calls,
                      rivalry calls, live-player, pre-match, punter card).
                      Each drawer starts collapsed; user taps to expand. */}
                  {(answeredPreds.length > 0 || missedPreds.length > 0) && (() => {
                    const allPicks = [...answeredPreds, ...missedPreds];

                    // Bucket picks: per-over cards go under their overNumber;
                    // everything else goes under "others".
                    const overBuckets = new Map<number, any[]>();
                    const others: any[] = [];
                    for (const p of allPicks) {
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
                      setExpandedPickGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    };

                    const renderPickCard = (pred: any) => {
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
                          {isClosed && isCorrect === false && pred.userAnswer?.feedbackText && (
                            <p className="text-xs mt-2 text-[#ff9b80] italic">
                              {pred.userAnswer.feedbackText}
                            </p>
                          )}
                        </div>
                      );
                    };

                    const renderGroup = (key: string, title: string, picks: any[]) => {
                      if (picks.length === 0) return null;
                      const open = expandedPickGroups.has(key);
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
                        <div className="space-y-2">
                          {overKeys.map((n) =>
                            renderGroup(`over-${n}`, `Over ${n}`, overBuckets.get(n) || [])
                          )}
                          {renderGroup("others", "Others", others)}
                        </div>
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
