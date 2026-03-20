/* eslint-disable @next/next/no-img-element */
"use client";

import { motion } from "framer-motion";
import { IoMdPeople } from "react-icons/io";
import { MdSportsCricket } from "react-icons/md";

interface LandingPageProps {
  venue: { name: string; rewardConfig: any } | null;
  match: { team1: string; team2: string; team1Short: string; team2Short: string; startTime: string; scoreData?: { team1Img?: string; team2Img?: string } } | null;
  playerCount: number;
  onJoin: () => void;
}

export default function LandingPage({ venue, match, playerCount, onJoin }: LandingPageProps) {
  const timeUntilMatch = match
    ? getTimeUntil(new Date(match.startTime))
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: "spring" }}
        className="mb-8"
      >
        <h1 className="text-6xl font-black text-orange-500 tracking-tight">
          JAFFA
        </h1>
        <p className="text-slate-400 text-center text-sm mt-1">
          Predict. Play. Win.
        </p>
      </motion.div>

      {/* Match Card */}
      {match && (
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-orange-400 uppercase tracking-wider">
              Today's Match
            </span>
            {match.startTime && (
              <span className="text-xs text-slate-400">
                {timeUntilMatch}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center mb-2 overflow-hidden">
                {match.scoreData?.team1Img ? (
                  <img src={match.scoreData.team1Img} alt={match.team1Short} className="w-full h-full object-cover" />
                ) : (
                  <MdSportsCricket className="text-2xl text-orange-400" />
                )}
              </div>
              <div className="font-bold text-lg">{match.team1Short}</div>
              <div className="text-xs text-slate-400">{match.team1}</div>
            </div>

            <div className="text-2xl font-bold text-slate-500">VS</div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center mb-2 overflow-hidden">
                {match.scoreData?.team2Img ? (
                  <img src={match.scoreData.team2Img} alt={match.team2Short} className="w-full h-full object-cover" />
                ) : (
                  <MdSportsCricket className="text-2xl text-blue-400" />
                )}
              </div>
              <div className="font-bold text-lg">{match.team2Short}</div>
              <div className="text-xs text-slate-400">{match.team2}</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Venue info */}
      {venue && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-6"
        >
          <p className="text-slate-400 text-sm">Playing at</p>
          <p className="text-white font-semibold text-lg">{venue.name}</p>
        </motion.div>
      )}

      {/* Player count */}
      {playerCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-2 text-slate-400 text-sm mb-8"
        >
          <IoMdPeople className="text-lg" />
          <span>{playerCount} {playerCount === 1 ? "person" : "people"} already playing</span>
        </motion.div>
      )}

      {/* Rewards preview */}
      {venue?.rewardConfig && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20 rounded-xl p-4 mb-8"
        >
          <p className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-2">
            Win Rewards
          </p>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-yellow-400">1st Place</span>
              <span className="text-white">{venue.rewardConfig.roundReward.top1}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">2nd Place</span>
              <span className="text-slate-300">{venue.rewardConfig.roundReward.top2}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-orange-300">3rd Place</span>
              <span className="text-slate-300">{venue.rewardConfig.roundReward.top3}</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Join button */}
      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        whileTap={{ scale: 0.95 }}
        onClick={onJoin}
        className="w-full max-w-sm bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg py-4 px-8 rounded-2xl transition-colors shadow-lg shadow-orange-500/20"
      >
        Join the Game
      </motion.button>

      <p className="text-slate-600 text-xs mt-4">Takes 30 seconds to start</p>
    </div>
  );
}

function getTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return "LIVE NOW";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `Starts in ${hours}h ${mins}m`;
  return `Starts in ${mins}m`;
}
