"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Flame } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";

/**
 * Centered "you got that right!" celebration modal. Renders the head of
 * the notification queue; user dismisses via close button (or Escape /
 * backdrop click) and the next queued win takes its place automatically.
 */
export default function WinPopup() {
  const { currentPopup, dismissPopup } = useNotifications();

  // Esc to dismiss
  useEffect(() => {
    if (!currentPopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissPopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPopup, dismissPopup]);

  return (
    <AnimatePresence>
      {currentPopup && (
        <motion.div
          key={currentPopup.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
          onClick={dismissPopup}
        >
          <motion.div
            initial={{ scale: 0.6, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className="relative w-full max-w-sm bg-[#0d0d0d] border-4 border-[#22c55e] rounded-[6px] p-6 text-center"
            style={{ boxShadow: "8px 8px 0 0 #166534" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={dismissPopup}
              className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Headline */}
            <p
              className="text-[#22c55e] text-2xl font-black uppercase tracking-wider"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              Woohoo!
            </p>
            <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">
              You called it
            </p>

            {/* Big points */}
            <div className="my-5">
              <div
                className="text-[#22c55e] text-7xl font-black leading-none"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                +{currentPopup.pointsEarned}
              </div>
              <div className="text-xs text-white/50 font-bold uppercase tracking-widest mt-1">
                points
              </div>
            </div>

            {/* Question */}
            <p className="text-sm text-white/85 font-semibold mb-2">
              {currentPopup.question}
            </p>
            {currentPopup.selectedLabel && (
              <p className="text-xs text-white/55">
                Your pick:{" "}
                <span className="text-[#22c55e] font-bold">
                  {currentPopup.selectedLabel}
                </span>
              </p>
            )}

            {/* Streak chip */}
            {currentPopup.streak >= 3 && (
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-[3px] border-2 border-[#ff6341] bg-[#1a0800]">
                <Flame className="w-4 h-4 text-[#ff6341]" />
                <span className="text-xs font-black text-[#ff6341] uppercase tracking-wider">
                  {currentPopup.streak} streak
                </span>
              </div>
            )}

            {/* Dismiss button */}
            <button
              onClick={dismissPopup}
              className="mt-5 w-full py-3 rounded-[3px] bg-[#22c55e] hover:bg-[#16a34a] text-black font-black uppercase tracking-wider text-sm border-2 border-black"
              style={{ boxShadow: "3px 3px 0 0 #000" }}
            >
              Nice
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
