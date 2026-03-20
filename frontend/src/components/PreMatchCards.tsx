"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import { IoCheckmarkCircle } from "react-icons/io5";
import { MdSportsCricket } from "react-icons/md";

// IPL team colors for rendering
const TEAM_COLORS: Record<string, string> = {
  CSK: "#f9cd05",
  MI: "#004ba0",
  RCB: "#d4213d",
  KKR: "#3a225d",
  DC: "#004c93",
  RR: "#ea1a85",
  PBKS: "#ed1b24",
  SRH: "#f7a721",
  GT: "#1c1c2b",
  LSG: "#005da0",
};

interface PreMatchCardsProps {
  match: any;
  venueId: string;
  onComplete: () => void;
}

export default function PreMatchCards({ match, venueId, onComplete }: PreMatchCardsProps) {
  const { state } = useGame();
  const [predictions, setPredictions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [joinedMatch, setJoinedMatch] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Join match first, then load predictions
  useEffect(() => {
    if (match?.id && venueId && state.user && !joinedMatch) {
      api.joinMatch(match.id, venueId)
        .then(() => {
          setJoinedMatch(true);
        })
        .catch((err) => {
          console.error("Join error:", err);
          // Still mark as joined if already joined (409/duplicate)
          setJoinedMatch(true);
        });
    }
  }, [match?.id, venueId, state.user]);

  // Load predictions after joining
  useEffect(() => {
    if (match?.id && venueId && joinedMatch) {
      api.getPredictions(match.id, venueId, 0)
        .then((preds) => {
          const preMatch = preds.filter(
            (p: any) => p.category === "pre_match" && !p.userAnswer
          );
          setPredictions(preMatch);
          setLoaded(true);
          if (preMatch.length === 0) {
            onComplete();
          }
        })
        .catch((err) => {
          console.error("Load predictions error:", err);
          setLoaded(true);
          onComplete();
        });
    }
  }, [match?.id, venueId, joinedMatch]);

  const currentPrediction = predictions[currentIndex];

  const handleSelect = async (optionKey: string) => {
    if (submitting || selectedOption) return;

    setSelectedOption(optionKey);
    setSubmitting(true);

    try {
      await api.submitPrediction(currentPrediction.id, optionKey, venueId);
      setAnswers({ ...answers, [currentPrediction.id]: optionKey });

      setShowResult(true);

      setTimeout(() => {
        setShowResult(false);
        setSelectedOption(null);
        setSubmitting(false);

        if (currentIndex < predictions.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onComplete();
        }
      }, 800);
    } catch (err) {
      console.error("Submit error:", err);
      setSelectedOption(null);
      setSubmitting(false);
    }
  };

  // Detect question layout type
  const getLayoutType = (pred: any): "team_vs" | "player_grid" | "list" => {
    if (!pred) return "list";
    const opts = pred.options;
    // 2 options with team data = team vs team (big cards side by side)
    if (opts.length === 2 && opts[0].team && opts[1].team) return "team_vs";
    // Options with player images = grid layout
    if (opts.some((o: any) => o.image?.includes("/players/"))) return "player_grid";
    return "list";
  };

  if (!loaded || predictions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <MdSportsCricket className="text-5xl text-orange-500 mx-auto mb-4" />
          <p className="text-white font-semibold text-lg mb-2">Getting ready...</p>
          <p className="text-slate-400 text-sm">Loading predictions</p>
        </div>
      </div>
    );
  }

  const layoutType = getLayoutType(currentPrediction);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-400">
          {match.team1Short} vs {match.team2Short}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-400">
            {currentIndex + 1} / {predictions.length}
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("jaffa_token");
              window.location.reload();
            }}
            className="text-xs text-slate-600 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 mb-8">
        {predictions.map((_: any, i: number) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i < currentIndex
                ? "bg-orange-500"
                : i === currentIndex
                ? "bg-orange-400"
                : "bg-slate-700"
            }`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPrediction.id}
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -80, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-sm"
          >
            {/* Question */}
            <div className="mb-8">
              <div className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-3">
                {getQuestionLabel(currentIndex)}
              </div>
              <h2 className="text-2xl font-bold text-white leading-tight">
                {currentPrediction.question}
              </h2>
              <div className="text-xs text-slate-500 mt-2">
                {getPointsLabel(currentPrediction.options)}
              </div>
            </div>

            {/* Team vs Team layout (2 big cards side by side) */}
            {layoutType === "team_vs" && (
              <div className="flex gap-4">
                {currentPrediction.options.map((option: any, i: number) => {
                  const teamColor = option.color || TEAM_COLORS[option.team] || "#64748b";
                  return (
                    <motion.button
                      key={option.key}
                      initial={{ y: 30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => handleSelect(option.key)}
                      disabled={submitting}
                      className={`flex-1 flex flex-col items-center justify-center py-8 rounded-2xl font-bold transition-all duration-200 ${
                        selectedOption === option.key
                          ? "scale-[1.02] ring-2 ring-white"
                          : selectedOption
                          ? "opacity-30 scale-[0.95]"
                          : "hover:scale-[1.02] active:scale-[0.98]"
                      }`}
                      style={{
                        backgroundColor: selectedOption === option.key
                          ? teamColor
                          : `${teamColor}22`,
                        borderWidth: 2,
                        borderColor: teamColor,
                      }}
                    >
                      {/* Team logo placeholder - initials in colored circle */}
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center mb-3 text-2xl font-black"
                        style={{
                          backgroundColor: selectedOption === option.key ? "rgba(255,255,255,0.2)" : teamColor,
                          color: teamColor === "#f9cd05" || teamColor === "#f7a721" ? "#000" : "#fff",
                        }}
                      >
                        {option.label}
                      </div>
                      <span className="text-white text-xl font-bold">{option.label}</span>
                      <span className="text-xs mt-1" style={{ color: `${teamColor}cc` }}>
                        {option.points} pts
                      </span>
                      {selectedOption === option.key && showResult && (
                        <IoCheckmarkCircle className="text-2xl text-white mt-2" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Player grid layout (2 columns) */}
            {layoutType === "player_grid" && (
              <div className="grid grid-cols-2 gap-3">
                {currentPrediction.options.map((option: any, i: number) => {
                  const teamColor = option.color || TEAM_COLORS[option.team] || "#64748b";
                  const initials = option.label.split(" ").map((w: string) => w[0]).join("").slice(0, 2);
                  return (
                    <motion.button
                      key={option.key}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => handleSelect(option.key)}
                      disabled={submitting}
                      className={`flex flex-col items-center py-4 px-3 rounded-xl transition-all duration-200 ${
                        selectedOption === option.key
                          ? "scale-[0.95] ring-2 ring-white"
                          : selectedOption
                          ? "opacity-30"
                          : "hover:scale-[1.02] active:scale-[0.95]"
                      }`}
                      style={{
                        backgroundColor: selectedOption === option.key
                          ? teamColor
                          : `${teamColor}15`,
                        borderWidth: 1,
                        borderColor: `${teamColor}40`,
                      }}
                    >
                      {/* Player avatar - initials */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center mb-2 text-sm font-bold"
                        style={{
                          backgroundColor: teamColor,
                          color: teamColor === "#f9cd05" || teamColor === "#f7a721" ? "#000" : "#fff",
                        }}
                      >
                        {initials}
                      </div>
                      <span className="text-white text-sm font-semibold text-center leading-tight">
                        {option.label}
                      </span>
                      <span className="text-xs mt-1" style={{ color: teamColor }}>
                        {option.team}
                      </span>
                      {selectedOption === option.key && showResult && (
                        <IoCheckmarkCircle className="text-xl text-white mt-1" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Standard list layout */}
            {layoutType === "list" && (
              <div className="space-y-3">
                {currentPrediction.options.map((option: any, i: number) => (
                  <motion.button
                    key={option.key}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => handleSelect(option.key)}
                    disabled={submitting}
                    className={`w-full text-left px-5 py-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-between ${
                      selectedOption === option.key
                        ? "bg-orange-500 text-white scale-[0.98]"
                        : selectedOption
                        ? "bg-slate-800/50 text-slate-500"
                        : "bg-slate-800 text-white hover:bg-slate-700 active:scale-[0.98]"
                    }`}
                  >
                    <span>{option.label}</span>
                    {selectedOption === option.key && showResult && (
                      <IoCheckmarkCircle className="text-xl" />
                    )}
                    {!selectedOption && (
                      <span className="text-xs text-slate-500">{option.points} pts</span>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom hint */}
      <div className="text-center text-slate-600 text-xs mt-4">
        Tap to select your prediction
      </div>
    </div>
  );
}

function getQuestionLabel(index: number): string {
  const labels = [
    "Match Winner",
    "Man of the Match",
    "Toss Call",
    "Six Showdown",
    "First Wicket",
  ];
  return labels[index] || `Question ${index + 1}`;
}

function getPointsLabel(options: { points: number }[]): string {
  const points = [...new Set(options.map((o) => o.points))];
  if (points.length === 1) return `${points[0]} points if correct`;
  return `${Math.min(...points)}-${Math.max(...points)} points based on pick`;
}
