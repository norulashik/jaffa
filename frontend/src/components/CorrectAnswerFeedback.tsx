"use client";

import MaterialIcon from "./MaterialIcon";

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
      {/* Overlay Backdrop with Green Pulse */}
      <div className="absolute inset-0 bg-[#00FFAB]/10 backdrop-blur-md"></div>
      <div className="absolute inset-0 confetti-overlay"></div>

      {/* Reward Card */}
      <div className="relative w-full max-w-md bg-surface-container-high/90 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_32px_128px_rgba(0,0,0,0.8)] border border-primary-container/20">
        {/* Top Icon */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-primary-container rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(0,255,171,0.6)] rotate-6">
          <MaterialIcon
            icon="military_tech"
            filled
            className="text-on-primary-container text-4xl font-bold"
          />
        </div>

        {/* Content */}
        <div className="text-center pt-8">
          <h2 className="font-headline text-5xl font-black text-white italic tracking-tighter mb-2 scale-110">
            BOOM!
          </h2>
          <div className="inline-flex items-center gap-2 bg-primary-container/20 px-6 py-2 rounded-full mb-8 border border-primary-container/30">
            <MaterialIcon icon="add_circle" className="text-primary-container text-xl" />
            <span className="font-headline font-bold text-primary-container text-2xl tracking-tight">
              +{points} Points
            </span>
          </div>

          {/* Prediction Highlight */}
          <div className="bg-surface-container-lowest rounded-2xl p-6 text-left border border-primary-container/40 correct-glow mb-8 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-container/5 to-transparent"></div>
            <div className="relative z-10">
              <p className="font-label text-[10px] font-extrabold text-primary-container uppercase tracking-[0.2em] mb-3">
                CORRECT PREDICTION
              </p>
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-headline text-2xl font-bold text-white mb-1 leading-none">
                    {prediction}
                  </h4>
                  <p className="font-body text-sm text-slate-400">Result: {result}</p>
                </div>
                <div className="w-12 h-12 bg-primary-container rounded-xl flex items-center justify-center">
                  <MaterialIcon icon="check" className="text-on-primary-container font-black text-3xl" />
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full bg-primary-container text-on-primary-container font-headline font-bold py-5 rounded-xl hover:shadow-[0_0_25px_rgba(0,255,171,0.4)] transition-all active:scale-95 text-lg uppercase tracking-wider"
          >
            Keep Winning
          </button>
          <p className="mt-6 font-label text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Streaking: {streak} in a row
          </p>
        </div>
      </div>
    </div>
  );
}
