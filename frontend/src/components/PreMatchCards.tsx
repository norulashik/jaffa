"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface PreMatchCardsProps {
  matchId: string;
  venueId: string | null;
}

const ACCENT_COLORS = ["#ff6341", "#ffd60a", "#3b9eff", "#22c55e"];

export default function PreMatchCards({ matchId, venueId }: PreMatchCardsProps) {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!venueId) return;

    api
      .getPredictions(matchId, venueId, 0)
      .then((preds) => {
        const preMatch = preds.filter(
          (p: any) =>
            p.category === "pre_match" && !p.userAnswer && p.status === "open"
        );
        setPredictions(preMatch);
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Load pre-match error:", err);
        setLoaded(true);
      });
  }, [matchId, venueId]);

  const handleSelect = async (optionKey: string) => {
    if (submitting || selectedOption || !venueId) return;

    const currentPred = predictions[currentIndex];
    if (!currentPred) return;

    setSelectedOption(optionKey);
    setSubmitting(true);

    try {
      await api.submitPrediction(currentPred.id, optionKey, venueId);
      toast("Answer locked!");

      setTimeout(() => {
        setSelectedOption(null);
        setSubmitting(false);

        if (currentIndex < predictions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          // All done -- clear predictions to hide component
          setPredictions([]);
        }
      }, 800);
    } catch (err: any) {
      toast(err.message || "Failed to submit");
      setSelectedOption(null);
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/50 font-bold uppercase tracking-wider animate-pulse">
          Loading pre-match questions...
        </p>
      </div>
    );
  }

  if (predictions.length === 0) {
    return null;
  }

  const currentPred = predictions[currentIndex];

  return (
    <div className="space-y-6">
      {/* Progress dots */}
      <div className="flex gap-1.5">
        {predictions.map((_: any, i: number) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-[2px] border border-[#2a2a2a] transition-colors ${
              i < currentIndex
                ? "bg-[#ff6341]"
                : i === currentIndex
                ? "bg-[#ff6341]/60"
                : "bg-[#0d0d0d]"
            }`}
          />
        ))}
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPred.id}
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -80, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="game-card p-5"
        >
          {/* Progress label */}
          <div className="flex items-center justify-between mb-3">
            <span className="info-pill text-[#ff6341]">
              Q{currentIndex + 1} of {predictions.length}
            </span>
            <span className="text-xs text-white/40 font-bold">PRE-MATCH</span>
          </div>

          {/* Question */}
          <h3
            className="text-lg text-white mb-5 leading-tight"
            style={{ fontFamily: "'Bungee', cursive" }}
          >
            {currentPred.question}
          </h3>

          {/* Options */}
          <div className="space-y-2">
            {currentPred.options.map((opt: any, idx: number) => {
              const color = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              const isSelected = selectedOption === opt.key;
              const hasSelection = selectedOption !== null;

              return (
                <motion.button
                  key={opt.key}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handleSelect(opt.key)}
                  disabled={submitting}
                  className={`option-btn px-4 py-3 text-left flex items-center justify-between transition-all ${
                    isSelected ? "selected" : ""
                  } ${hasSelection && !isSelected ? "opacity-30" : ""}`}
                  style={
                    isSelected
                      ? {
                          background: color,
                          borderColor: "#000",
                          color: "#000",
                          boxShadow: "4px 4px 0 0 #000",
                        }
                      : {}
                  }
                >
                  <span className="font-bold text-sm">{opt.label}</span>
                  <span
                    className={`text-xs font-black ${
                      isSelected ? "text-black" : "text-white/40"
                    }`}
                  >
                    {opt.points} pts
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Bottom hint */}
          <p className="text-center text-white/30 text-xs font-bold uppercase mt-4">
            Tap to select your prediction
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
