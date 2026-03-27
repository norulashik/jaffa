"use client";

import { Trophy, Check, Plus } from "lucide-react";

interface CorrectAnswerFeedbackProps {
  points: number;
  prediction: string;
  result: string;
  streak: number;
  onClose: () => void;
}

export default function CorrectAnswerFeedback({
  points,
  prediction,
  result,
  streak,
  onClose,
}: CorrectAnswerFeedbackProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
      {/* Overlay Backdrop — flat black, no blur */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Reward Card */}
      <div
        className="relative w-full max-w-md p-8"
        style={{
          background: "#1a1a1a",
          border: "3px solid #22c55e",
          borderRadius: "4px",
          boxShadow: "8px 8px 0 0 #22c55e",
        }}
      >
        {/* Top Icon */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 flex items-center justify-center"
          style={{
            background: "#22c55e",
            border: "3px solid #000000",
            borderRadius: "4px",
            boxShadow: "4px 4px 0 0 #000000",
          }}
        >
          <Trophy className="w-9 h-9 text-black" strokeWidth={3} />
        </div>

        {/* Content */}
        <div className="text-center pt-8">
          <h2
            className="text-5xl text-white tracking-tighter mb-2"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            BOOM!
          </h2>

          {/* Points pill */}
          <div
            className="inline-flex items-center gap-2 px-6 py-2 mb-8"
            style={{
              background: "#22c55e",
              color: "#000000",
              borderRadius: "3px",
              border: "2px solid #000000",
              boxShadow: "4px 4px 0 0 #000000",
            }}
          >
            <Plus className="w-5 h-5 text-black" strokeWidth={3} />
            <span
              className="text-2xl text-black tracking-tight"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              +{points} POINTS
            </span>
          </div>

          {/* Prediction Highlight */}
          <div className="card-green p-6 text-left mb-8 overflow-hidden relative">
            <div className="relative z-10">
              <p className="info-pill inline-block w-fit text-[#22c55e] mb-3 !text-[10px] !tracking-[0.2em]">
                CORRECT PREDICTION
              </p>
              <div className="flex justify-between items-center">
                <div>
                  <h4
                    className="text-2xl text-white mb-1 leading-none"
                    style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                  >
                    {prediction}
                  </h4>
                  <p className="text-sm text-white/50">Result: {result}</p>
                </div>
                <div
                  className="w-12 h-12 flex items-center justify-center"
                  style={{
                    background: "#22c55e",
                    borderRadius: "4px",
                    border: "2px solid #000000",
                  }}
                >
                  <Check className="w-7 h-7 text-black" strokeWidth={3} />
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={onClose}
            className="btn-sticker btn-green w-full py-5 text-lg tracking-wider"
          >
            KEEP WINNING
          </button>
          <p className="mt-6 text-[10px] font-black text-white/40 uppercase tracking-widest">
            Streaking: {streak} in a row
          </p>
        </div>
      </div>
    </div>
  );
}
