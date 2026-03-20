"use client";

import { motion } from "framer-motion";
import { IoTrophy } from "react-icons/io5";

interface RewardBannerProps {
  rewards: any[];
}

export default function RewardBanner({ rewards }: RewardBannerProps) {
  if (rewards.length === 0) return null;

  const topReward = rewards[0];

  return (
    <motion.div
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-gradient-to-r from-yellow-600/90 to-orange-600/90 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <IoTrophy className="text-xl text-yellow-200 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            You won: {topReward.rewardText}
          </p>
          <p className="text-yellow-100 text-xs">
            Show code <span className="font-bold tracking-wider">{topReward.code}</span> to staff
          </p>
        </div>
        {rewards.length > 1 && (
          <span className="text-xs text-yellow-200 bg-yellow-700/50 px-2 py-1 rounded-full">
            +{rewards.length - 1} more
          </span>
        )}
      </div>
    </motion.div>
  );
}
