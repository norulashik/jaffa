"use client";

import { useState, useId } from "react";
import { motion } from "framer-motion";
import { AvatarConfig, AvatarSize, AvatarMood } from "@/types/avatar";
import AvatarPreview from "./avatar/AvatarPreview";

interface CricketAvatarProps {
  config: AvatarConfig;
  size?: AvatarSize;
  mood?: AvatarMood;
  interactive?: boolean;
}

const SIZES: Record<AvatarSize, [number, number]> = {
  sm: [36, 65],
  md: [52, 94],
  lg: [100, 180],
};

const variants = {
  idle: {
    y: [0, -2, 0],
    transition: { repeat: Infinity, duration: 3, ease: "easeInOut" as const },
  },
  celebrate: {
    scale: [1, 1.12, 1],
    rotate: [0, -7, 7, 0],
    transition: { duration: 0.6 },
  },
  disappointed: {
    y: 3,
    rotate: -3,
    transition: { duration: 0.4 },
  },
  excited: {
    y: [0, -6, 0, -3, 0],
    transition: { duration: 0.5 },
  },
};

export default function CricketAvatar({
  config,
  size = "md",
  mood = "idle",
  interactive = false,
}: CricketAvatarProps) {
  const [currentMood, setCurrentMood] = useState<AvatarMood>(mood);
  // useId gives a stable unique prefix — prevents gradient ID collisions when
  // multiple CricketAvatars are rendered on the same page (e.g. header + main).
  const uid = useId().replace(/:/g, "x");
  const [w, h] = SIZES[size];

  const handleTap = () => {
    if (!interactive) return;
    setCurrentMood("celebrate");
    setTimeout(() => setCurrentMood(mood), 800);
  };

  return (
    <motion.div
      onClick={handleTap}
      animate={currentMood}
      variants={variants}
      whileTap={interactive ? { scale: 0.9 } : undefined}
      style={{ width: w, height: h, cursor: interactive ? "pointer" : "default" }}
      className="relative select-none"
    >
      <AvatarPreview config={config} uid={uid} width={w} height={h} />
    </motion.div>
  );
}
