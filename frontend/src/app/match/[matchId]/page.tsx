"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import CorrectAnswerFeedback from "@/components/CorrectAnswerFeedback";
import { api } from "@/lib/api";
import { connectSocket, joinVenueMatch, disconnectSocket } from "@/lib/socket";

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
  const [activeTab, setActiveTab] = useState<"predict" | "leaderboard" | "rewards">("predict");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [matchData, setMatchData] = useState<any>(null);

  const venueId = typeof window !== "undefined" ? localStorage.getItem("jaffa_venueId") || "" : "";

  // Phase 1: Join match and load pre-match predictions
  useEffect(() => {
    if (!matchId) return;

    const initMatch = async () => {
      try {
        // Load match data
        const match = await api.getMatch(matchId);
        setMatchData(match);

        // Join the match
        try {
          await api.joinMatch(matchId, venueId);
        } catch {
          // Already joined — that's fine
        }

        // Load pre-match predictions (round 0)
        try {
          const preds = await api.getPredictions(matchId, venueId, 0);
          const unanswered = (preds || []).filter(
            (p: any) => p.category === "pre_match" && !p.userAnswer && p.status === "open"
          );

          if (unanswered.length > 0) {
            setPreMatchPredictions(unanswered);
            setPhase("prematch");
          } else {
            // No pre-match questions, go straight to live
            setPhase("live");
          }
        } catch {
          // If predictions fail, go to live
          setPhase("live");
        }
      } catch {
        // If match load fails, still show live with fallback data
        setPhase("live");
      }
    };

    initMatch();
  }, [matchId]);

  // Phase 3: Connect socket when entering live phase
  useEffect(() => {
    if (phase !== "live") return;

    loadLiveData();

    const socket = connectSocket();
    if (venueId && matchId) {
      joinVenueMatch(venueId, matchId);
    }

    socket.on("newPrediction", (data: any) => {
      setPredictions((prev) => [...prev, data]);
    });

    socket.on("scoreUpdate", (data: any) => {
      setMatchData((prev: any) => ({ ...prev, ...data }));
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
      setPredictions(preds || []);
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
  const handleOptionSelect = async (predictionId: string, option: string) => {
    try {
      await api.submitPrediction(predictionId, option, venueId);
    } catch {
      // Handle error silently
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
  // Placeholder predictions matching Stitch design
  const demoPredictions = [
    {
      id: "1",
      badge: "OVER 1",
      question: "Maiden over in over 1? \u{1F3B3}",
      matchLabel: "CSK vs RCB",
      options: [
        { label: "Yes — bowler dominance", points: 30 },
        { label: "No", points: 5 },
      ],
    },
    {
      id: "2",
      badge: "OVER 1",
      question: "Will Ruturaj Gaikwad score 10+ in over 1?",
      matchLabel: "CSK vs RCB",
      options: [
        { label: "Yes — going big", points: 20 },
        { label: "No — staying steady", points: 10 },
      ],
    },
    {
      id: "3",
      badge: "HOT TAKE",
      question: "More runs in the powerplay — first 3 overs or last 3?",
      isHotTake: true,
      options: [
        { label: "First 3 overs (1-3)", points: 20 },
        { label: "Last 3 overs (4-6)", points: 20 },
      ],
    },
  ];

  const displayPredictions = predictions.length > 0 ? predictions : demoPredictions;

  return (
    <div className="bg-surface text-on-surface font-body overflow-x-hidden">
      {/* TopAppBar */}
      <Header
        rightContent={
          <>
            <div className="flex flex-col items-end">
              <span className="font-label text-[10px] text-slate-400 uppercase tracking-tighter">Live Player</span>
              <span className="font-bold text-sm">Virat K.</span>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-primary-container p-0.5 overflow-hidden bg-surface-container-highest">
              <div className="w-full h-full flex items-center justify-center rounded-full">
                <MaterialIcon icon="person" className="text-primary-container" />
              </div>
            </div>
          </>
        }
      />

      <main className="pt-24 pb-32 px-4 min-h-screen space-y-6 max-w-2xl mx-auto">
        {/* Scoreboard Hero Section */}
        <section className="relative overflow-hidden rounded-xl bg-surface-container-low p-6 shadow-2xl">
          <div className="absolute top-0 right-0 p-3">
            <div className="flex items-center gap-2 bg-error-container/20 px-3 py-1 rounded-full border border-error/30">
              <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
              <span className="font-label text-[10px] font-bold text-error uppercase tracking-widest">Live</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col items-start">
                <span className="font-label text-xs text-on-surface-variant font-semibold">
                  {matchData?.team1Short || "IND"}
                </span>
                <h1 className="font-headline text-5xl font-black text-primary-container tracking-tighter">
                  {matchData?.score || "142/4"}
                </h1>
              </div>
              <div className="text-right">
                <span className="font-label text-xs text-on-surface-variant font-semibold">OVERS</span>
                <h2 className="font-headline text-3xl font-bold text-on-surface">
                  {matchData?.overs || "15.2"}
                </h2>
              </div>
            </div>
            <div className="w-full bg-surface-container-highest/30 h-1 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-secondary-container to-primary-container h-full w-[76%]"></div>
            </div>
            <div className="flex justify-between w-full text-[10px] font-label font-bold text-on-surface-variant tracking-widest">
              <span>CRR: {matchData?.crr || "9.26"}</span>
              <span>RRR: {matchData?.rrr || "11.45"}</span>
            </div>
          </div>
        </section>

        {/* Predict Tabs */}
        <div className="flex items-center border-b border-white/5">
          {(["predict", "leaderboard", "rewards"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 font-label text-xs font-bold uppercase tracking-widest ${
                activeTab === tab
                  ? "text-primary-container border-b-2 border-primary-container"
                  : "text-on-surface-variant"
              }`}
            >
              {tab === "predict" ? `Predict (${displayPredictions.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Prediction Stack */}
        {activeTab === "predict" && (
          <div className="space-y-4">
            {displayPredictions.map((pred: any) => (
              <section
                key={pred.id}
                className={`prediction-card rounded-xl p-5 relative overflow-hidden ${
                  pred.isHotTake ? "border-l-4 border-l-amber-500" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col">
                    <span className="font-label text-[10px] font-black text-amber-500 uppercase tracking-widest">
                      {pred.badge || pred.category?.toUpperCase() || "OVER 1"}
                    </span>
                    <h3 className="font-headline text-lg font-bold">{pred.question}</h3>
                  </div>
                  {pred.matchLabel && (
                    <span className="font-label text-[10px] text-on-surface-variant">{pred.matchLabel}</span>
                  )}
                </div>
                <div className="space-y-2 mb-4">
                  {(pred.options || []).map((opt: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => handleOptionSelect(pred.id, opt.label)}
                      className="option-button w-full p-3 rounded-lg flex justify-between items-center group"
                    >
                      <span className="font-body text-sm font-medium">{opt.label}</span>
                      <span className="font-label text-xs font-bold text-primary-container">{opt.points} pts</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 bg-primary-container/10 border border-primary-container/20 px-3 py-1.5 rounded-full hover:bg-primary-container/20 transition-colors">
                    <MaterialIcon icon="bolt" filled className="text-primary-container text-sm" />
                    <span className="font-label text-[10px] font-bold text-primary-container uppercase tracking-tighter">
                      2x Boost (2 left)
                    </span>
                  </button>
                  <button className="flex items-center gap-1.5 bg-secondary-container/10 border border-secondary-container/20 px-3 py-1.5 rounded-full hover:bg-secondary-container/20 transition-colors">
                    <MaterialIcon icon="rocket_launch" filled className="text-secondary-container text-sm" />
                    <span className="font-label text-[10px] font-bold text-secondary-container uppercase tracking-tighter">
                      3x All-In
                    </span>
                  </button>
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Quick Stats */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-surface-container-low p-5 rounded-xl flex items-center gap-4">
            <div className="w-12 h-12 bg-surface-container-highest rounded-lg flex items-center justify-center">
              <MaterialIcon icon="trending_up" className="text-secondary-container" />
            </div>
            <div>
              <span className="block font-label text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                Win Prob
              </span>
              <span className="block font-headline text-xl font-bold">68%</span>
            </div>
          </div>
          <div className="bg-surface-container-low p-5 rounded-xl flex items-center gap-4">
            <div className="w-12 h-12 bg-surface-container-highest rounded-lg flex items-center justify-center">
              <MaterialIcon icon="account_balance_wallet" className="text-primary-container" />
            </div>
            <div>
              <span className="block font-label text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                Pool Size
              </span>
              <span className="block font-headline text-xl font-bold">2.4k</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Stats Bar */}
      <div className="fixed bottom-[84px] left-0 w-full px-4 z-40 pointer-events-none">
        <div className="max-w-2xl mx-auto bg-surface-container-highest/90 backdrop-blur-md rounded-full px-6 py-3 flex items-center justify-between pointer-events-auto border border-white/5 shadow-2xl">
          <div className="flex items-center gap-2">
            <MaterialIcon icon="stars" className="text-primary-container text-sm" />
            <span className="font-label text-xs font-bold uppercase tracking-tighter">
              Points: <span className="text-on-surface">1250</span>
            </span>
          </div>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <MaterialIcon icon="leaderboard" className="text-secondary-container text-sm" />
            <span className="font-label text-xs font-bold uppercase tracking-tighter">
              Rank: <span className="text-on-surface">#42</span>
            </span>
          </div>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <MaterialIcon icon="local_fire_department" filled className="text-error text-sm" />
            <span className="font-label text-xs font-bold uppercase tracking-tighter">
              Streak: <span className="text-on-surface">5</span>
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
