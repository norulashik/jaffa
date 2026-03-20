"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "@/context/GameContext";
import { IoClose, IoLogOut, IoPerson } from "react-icons/io5";

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  venueName?: string;
}

export default function ProfileDrawer({ isOpen, onClose, venueName }: ProfileDrawerProps) {
  const { state, dispatch } = useGame();

  const handleLogout = () => {
    dispatch({ type: "LOGOUT" });
    onClose();
    // Reload the page to reset all state
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-slate-900 border-l border-slate-800 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h2 className="text-white font-semibold">Profile</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                <IoClose className="text-xl" />
              </button>
            </div>

            {/* Profile info */}
            <div className="p-4 space-y-4">
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <IoPerson className="text-2xl text-orange-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">{state.user?.displayName}</p>
                  <p className="text-slate-400 text-sm">{state.user?.phone}</p>
                </div>
              </div>

              {/* Stats */}
              {venueName && (
                <div className="bg-slate-800 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Playing at</p>
                  <p className="text-white font-medium">{venueName}</p>
                </div>
              )}

              <div className="bg-slate-800 rounded-xl p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400">Points</p>
                    <p className="text-lg font-bold text-orange-400">{state.totalPoints}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Streak</p>
                    <p className="text-lg font-bold text-yellow-400">{state.currentStreak}</p>
                  </div>
                </div>
              </div>

              {/* Power-ups status */}
              <div className="bg-slate-800 rounded-xl p-3 space-y-2">
                <p className="text-xs text-slate-400 font-medium uppercase">Power-ups</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Boosts this round</span>
                  <span className="text-yellow-400">{2 - state.boostsUsedThisRound} / 2</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">All-In</span>
                  <span className={state.allInUsed ? "text-slate-500" : "text-purple-400"}>
                    {state.allInUsed ? "Used" : "Available"}
                  </span>
                </div>
              </div>
            </div>

            {/* Logout at bottom */}
            <div className="mt-auto p-4 border-t border-slate-800">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium py-3 rounded-xl transition-colors"
              >
                <IoLogOut className="text-lg" />
                Sign Out
              </button>
              <p className="text-xs text-slate-600 text-center mt-2">
                You can sign back in with the same number
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
