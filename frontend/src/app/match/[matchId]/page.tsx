"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import CorrectAnswerFeedback from "@/components/CorrectAnswerFeedback";
import { api } from "@/lib/api";
import { connectSocket, joinVenueMatch, disconnectSocket } from "@/lib/socket";
import { useGame } from "@/context/GameContext";

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
  "Man of the Match",
  "Toss Call",
  "Six Showdown",
  "First Wicket",
];

export default function MatchDashboard() {
  const params = useParams();
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
  const [showAllPicks, setShowAllPicks] = useState(false);
  const [picksExpanded, setPicksExpanded] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const { state: gameState, dispatch } = useGame();

  const [venueId, setVenueId] = useState("");

  useEffect(() => {
    setVenueId(localStorage.getItem("jaffa_venue_id") || "");
  }, []);

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

        // Join the match (pass match code if available)
        // Note: "already joined" returns 200 (not an error), so catch = real failure
        try {
          const matchCode = localStorage.getItem("jaffa_match_code") || undefined;
          await api.joinMatch(matchId, venueId, matchCode);
          localStorage.removeItem("jaffa_match_code");
        } catch (err: any) {
          console.error("Join match failed:", err.message);
          localStorage.removeItem("jaffa_match_code");
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

    return () => {
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
  const handleOptionSelect = async (predictionId: string, optionKey: string) => {
    if (selectedAnswers[predictionId]) return; // already answered
    setSelectedAnswers((prev) => ({ ...prev, [predictionId]: optionKey }));
    try {
      await api.submitPrediction(predictionId, optionKey, venueId);
    } catch {
      // Revert on failure
      setSelectedAnswers((prev) => { const n = { ...prev }; delete n[predictionId]; return n; });
    }
  };

  // ─── LOADING PHASE ───
  if (phase === "loading") {
    return (
      <div className="bg-surface min-h-screen flex flex-col items-center justify-center">
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-surface-container-low flex items-center justify-center">
            <MaterialIcon icon="sports_cricket" className="text-4xl text-primary-container" />
          </div>
          <div className="absolute inset-0 rounded-2xl animate-ping bg-primary-container/10"></div>
        </div>
        <p className="font-headline text-lg font-bold text-on-surface mb-2">Getting Ready...</p>
        <p className="font-body text-sm text-on-surface-variant">Loading match predictions</p>
      </div>
    );
  }

  // ─── PRE-MATCH PHASE ───
  if (phase === "prematch") {
    const currentPred = preMatchPredictions[currentCardIndex];
    const questionLabel = QUESTION_LABELS[currentCardIndex] || `Question ${currentCardIndex + 1}`;

    return (
      <div className="bg-surface min-h-screen flex flex-col">
        {/* Pre-match Header */}
        <div className="px-4 pt-6 pb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <MaterialIcon icon="sports_cricket" className="text-primary-container text-lg" />
              <span className="font-label text-xs text-on-surface-variant font-bold uppercase tracking-widest">
                {matchData?.team1Short || "Team 1"} vs {matchData?.team2Short || "Team 2"}
              </span>
            </div>
            <span className="font-label text-xs text-on-surface-variant">
              {currentCardIndex + 1} / {preMatchPredictions.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1.5 mt-3">
            {preMatchPredictions.map((_: any, i: number) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  i < currentCardIndex
                    ? "bg-primary-container"
                    : i === currentCardIndex
                    ? "bg-primary-container/70"
                    : "bg-surface-container-highest/30"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Card Area */}
        <div className="flex-1 flex items-center justify-center px-4 py-6">
          <div
            className={`w-full max-w-md transition-all duration-300 ${
              cardExiting ? "opacity-0 translate-x-[-60px]" : "opacity-100 translate-x-0"
            }`}
          >
            {/* Question Category Label */}
            <div className="mb-3">
              <span className="font-label text-[10px] font-black text-amber-500 uppercase tracking-widest">
                {questionLabel}
              </span>
            </div>

            {/* Question Text */}
            <h2 className="font-headline text-2xl font-bold text-on-surface leading-tight mb-2">
              {currentPred?.question}
            </h2>

            {/* Points hint */}
            <p className="font-body text-xs text-on-surface-variant mb-8">
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
                    className={`w-full text-left px-5 py-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-between ${
                      isSelected
                        ? "bg-primary-container text-on-primary-container scale-[0.98]"
                        : hasSelection
                        ? "bg-surface-container-low/50 text-on-surface-variant/50"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container active:scale-[0.98]"
                    }`}
                    style={{
                      animationDelay: `${i * 50}ms`,
                    }}
                  >
                    <span className="font-body text-sm font-medium">{option.label}</span>
                    <div className="flex items-center gap-2">
                      {isSelected && showPreMatchResult && (
                        <MaterialIcon icon="check_circle" filled className="text-on-primary-container" />
                      )}
                      <span className={`font-label text-xs font-bold ${
                        isSelected ? "text-on-primary-container/80" : "text-primary-container"
                      }`}>
                        {option.points} pts
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom hint */}
        <div className="text-center pb-8">
          <p className="font-body text-xs text-on-surface-variant/50">Tap to select your prediction</p>
        </div>
      </div>
    );
  }

  // ─── LIVE DASHBOARD PHASE ───
  return (
    <div className="bg-surface text-on-surface font-body overflow-x-hidden">
      {/* TopAppBar */}
      <Header
        rightContent={
          <>
            <Link href="/profile" className="w-10 h-10 rounded-full border-2 border-primary-container p-0.5 overflow-hidden bg-surface-container-highest">
              <div className="w-full h-full flex items-center justify-center rounded-full">
                <MaterialIcon icon="person" className="text-primary-container" />
              </div>
            </Link>
          </>
        }
      />

      <main className="pt-24 pb-32 px-4 min-h-screen space-y-6 max-w-2xl mx-auto">
        {/* Scoreboard Hero Section */}
        {(() => {
          const sd = matchData?.scoreData || {};
          const currInn = sd.currentInnings || matchData?.currentInnings || 1;
          const innings1 = sd.innings1;
          const innings2 = sd.innings2;

          // Determine batting/bowling teams — batting always left, bowling always right
          const battingFirstShort = sd.battingFirstShort || matchData?.team1Short || "T1";
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
            <section className="relative overflow-hidden rounded-xl bg-surface-container-low p-5 border border-white/5">
              {/* Series & Live badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="font-label text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">
                  {sd.series || `${matchData?.team1Short || "T1"} vs ${matchData?.team2Short || "T2"}`}
                </span>
                <div className="flex items-center gap-2 bg-error-container/20 px-3 py-1 rounded-full border border-error/30">
                  <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                  <span className="font-label text-[10px] font-bold text-error uppercase tracking-widest">Live</span>
                </div>
              </div>

              {/* Score Display */}
              <div className="flex items-center justify-between">
                {/* Batting Team — LEFT */}
                <div className="flex items-center gap-3">
                  {battingImg && (
                    <img src={battingImg} alt={battingTeam} className="w-8 h-8 rounded-full bg-surface-container-highest" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-headline text-lg font-bold text-on-surface">{battingTeam}</span>
                      <span className="font-label text-[10px] font-bold bg-primary-container/20 text-primary-container px-1.5 py-0.5 rounded uppercase tracking-wider">BAT</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-headline text-2xl font-black text-primary-container">{score}/{wickets}</span>
                      <span className="font-body text-sm text-on-surface-variant">({overs} ov)</span>
                    </div>
                  </div>
                </div>

                {/* VS / Target */}
                <div className="text-center">
                  {target ? (
                    <div>
                      <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Need</div>
                      <div className="font-headline text-lg font-black text-secondary-container">{runsNeeded}</div>
                      <div className="font-label text-[10px] text-on-surface-variant/60">off {(20 - overs) > 0 ? Math.ceil((20 - overs) * 6) : 0} balls</div>
                    </div>
                  ) : (
                    <div className="font-headline font-bold text-sm text-on-surface-variant/40">VS</div>
                  )}
                </div>

                {/* Bowling Team — RIGHT */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-headline text-lg font-bold text-on-surface-variant">{bowlingTeam}</span>
                      <span className="font-label text-[10px] font-bold bg-secondary-container/20 text-secondary-container px-1.5 py-0.5 rounded uppercase tracking-wider">BOWL</span>
                    </div>
                    {innings1 && currInn === 2 && (
                      <div className="font-body text-sm text-on-surface-variant">
                        {innings1.score}/{innings1.wickets} ({innings1.overs} ov)
                      </div>
                    )}
                    {currInn === 1 && (
                      <div className="font-label text-xs text-on-surface-variant/50">Yet to bat</div>
                    )}
                  </div>
                  {bowlingImg && (
                    <img src={bowlingImg} alt={bowlingTeam} className="w-8 h-8 rounded-full bg-surface-container-highest" />
                  )}
                </div>
              </div>

              {/* CRR / RRR */}
              <div className="flex items-center justify-between mt-3 text-[11px]">
                <span className="font-label font-bold text-on-surface-variant/60 uppercase tracking-widest">
                  CRR: <span className="text-on-surface font-bold">{crr}</span>
                </span>
                {rrr && (
                  <span className="font-label font-bold text-on-surface-variant/60 uppercase tracking-widest">
                    RRR: <span className="text-secondary-container font-bold">{rrr}</span>
                  </span>
                )}
              </div>
            </section>
          );
        })()}

        {/* Predict Tabs */}
        {(() => {
          const unanswered = predictions.filter((p: any) => p.status === "open" && !selectedAnswers[p.id] && !p.userAnswer?.selectedOption);
          const openPreds = unanswered.filter((p: any) => !p.expiresAt || new Date(p.expiresAt).getTime() > now);
          const missedPreds = unanswered.filter((p: any) => p.expiresAt && new Date(p.expiresAt).getTime() <= now);
          const answeredPreds = predictions.filter((p: any) => selectedAnswers[p.id] || p.userAnswer?.selectedOption);

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

                    return (
                    <section key={pred.id} className={`prediction-card rounded-xl p-5 relative overflow-hidden ${pred.category === "hot_take" ? "border-l-4 border-l-amber-500" : ""} ${isExpired ? "opacity-50" : ""}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex flex-col">
                          <span className="font-label text-[10px] font-black text-amber-500 uppercase tracking-widest">
                            {getCategoryLabel(pred)}
                          </span>
                          <h3 className="font-headline text-lg font-bold">{pred.question}</h3>
                        </div>
                        {timeLeft !== null && (
                          <span className={`font-label text-[10px] font-bold px-2 py-1 rounded-full ${
                            isExpired
                              ? "bg-error/20 text-error"
                              : timeLeft <= 15
                              ? "bg-error/20 text-error animate-pulse"
                              : "bg-primary-container/20 text-primary-container"
                          }`}>
                            {isExpired ? "Locked" : `${timeLeft}s`}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 mb-4">
                        {(pred.options || []).map((opt: any, i: number) => {
                          const optKey = opt.key || opt.label;
                          return (
                            <button
                              key={i}
                              onClick={() => !isExpired && handleOptionSelect(pred.id, optKey)}
                              disabled={isExpired}
                              className={`option-button w-full p-3 rounded-lg flex justify-between items-center transition-all duration-200 ${
                                isExpired
                                  ? "text-on-surface/40 cursor-not-allowed"
                                  : "text-on-surface hover:bg-surface-container active:scale-[0.98]"
                              }`}
                            >
                              <span className="font-body text-sm font-medium">{opt.label}</span>
                              <span className="font-label text-xs font-bold text-primary-container">{opt.points} pts</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button className="flex items-center gap-1.5 bg-primary-container/10 border border-primary-container/20 px-3 py-1.5 rounded-full">
                          <MaterialIcon icon="bolt" filled className="text-primary-container text-sm" />
                          <span className="font-label text-[10px] font-bold text-primary-container uppercase tracking-tighter">2x Boost</span>
                        </button>
                        <button className="flex items-center gap-1.5 bg-secondary-container/10 border border-secondary-container/20 px-3 py-1.5 rounded-full">
                          <MaterialIcon icon="rocket_launch" filled className="text-secondary-container text-sm" />
                          <span className="font-label text-[10px] font-bold text-secondary-container uppercase tracking-tighter">3x All-In</span>
                        </button>
                      </div>
                    </section>
                    );
                  })}

                  {/* All caught up */}
                  {openPreds.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <span className="text-5xl mb-4">🏏</span>
                      <h3 className="font-headline text-xl font-bold text-on-surface mb-2">All caught up!</h3>
                      <p className="font-body text-sm text-on-surface-variant max-w-[240px]">
                        New predictions drop at the end of this over. Keep watching!
                      </p>
                    </div>
                  )}

                  {/* My Picks */}
                  {(answeredPreds.length > 0 || missedPreds.length > 0) && (() => {
                    const allPicks = [...answeredPreds, ...missedPreds];
                    const visiblePicks = showAllPicks ? allPicks : allPicks.slice(0, 5);
                    const hasMore = allPicks.length > 5;
                    return (
                    <div className="mt-2">
                      <button
                        onClick={() => setPicksExpanded(!picksExpanded)}
                        className="flex justify-between items-center w-full mb-3 px-1"
                      >
                        <span className="font-label text-sm font-bold text-on-surface-variant">My Picks ({allPicks.length})</span>
                        <MaterialIcon
                          icon={picksExpanded ? "expand_less" : "expand_more"}
                          className="text-on-surface-variant text-xl"
                        />
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
                          {hasMore && (
                            <button
                              onClick={() => setShowAllPicks(!showAllPicks)}
                              className="w-full py-3 text-center font-label text-xs font-bold text-primary-container uppercase tracking-widest hover:text-primary-container/80 transition-colors"
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
        <div className="max-w-2xl mx-auto bg-surface-container-highest/90 backdrop-blur-md rounded-full px-6 py-3 flex items-center justify-between pointer-events-auto border border-white/5 shadow-2xl">
          <div className="flex items-center gap-2">
            <MaterialIcon icon="stars" className="text-primary-container text-sm" />
            <span className="font-label text-xs font-bold uppercase tracking-tighter">
              Points: <span className="text-on-surface">{gameState.totalPoints}</span>
            </span>
          </div>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <MaterialIcon icon="leaderboard" className="text-secondary-container text-sm" />
            <span className="font-label text-xs font-bold uppercase tracking-tighter">
              Rank: <span className="text-on-surface">{userRank ? `#${userRank}` : "--"}</span>
            </span>
          </div>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <MaterialIcon icon="local_fire_department" filled className="text-error text-sm" />
            <span className="font-label text-xs font-bold uppercase tracking-tighter">
              Streak: <span className="text-on-surface">{gameState.currentStreak}</span>
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

