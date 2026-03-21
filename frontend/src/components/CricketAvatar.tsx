"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AvatarConfig, AvatarSize, AvatarMood } from "@/types/avatar";

interface CricketAvatarProps {
  config: AvatarConfig;
  size?: AvatarSize;
  mood?: AvatarMood;
  interactive?: boolean;
}

const SIZES = { sm: 36, md: 52, lg: 100 };

export default function CricketAvatar({
  config,
  size = "md",
  mood = "idle",
  interactive = false,
}: CricketAvatarProps) {
  const [currentMood, setCurrentMood] = useState<AvatarMood>(mood);
  const px = SIZES[size];

  const handleTap = () => {
    if (!interactive) return;
    setCurrentMood("celebrate");
    setTimeout(() => setCurrentMood(mood), 800);
  };

  // Animation variants
  const containerVariants = {
    idle: { y: [0, -2, 0], transition: { repeat: Infinity, duration: 3, ease: "easeInOut" as const } },
    celebrate: { scale: [1, 1.15, 1], rotate: [0, -8, 8, 0], transition: { duration: 0.6 } },
    disappointed: { y: 3, rotate: -5, transition: { duration: 0.4 } },
    excited: { y: [0, -6, 0, -3, 0], transition: { duration: 0.5 } },
  };

  return (
    <motion.div
      onClick={handleTap}
      animate={currentMood}
      variants={containerVariants}
      whileTap={interactive ? { scale: 0.9 } : undefined}
      style={{ width: px, height: px, cursor: interactive ? "pointer" : "default" }}
      className="relative select-none"
    >
      <svg viewBox="0 0 100 100" width={px} height={px} xmlns="http://www.w3.org/2000/svg">
        {/* Background glow ring */}
        <circle cx="50" cy="50" r="48" fill="none" stroke={config.jerseyColor} strokeWidth="2" opacity="0.25" />
        <circle cx="50" cy="50" r="46" fill={config.jerseyColor + "15"} />

        {/* Body / Jersey */}
        <Body bodyType={config.bodyType} jerseyColor={config.jerseyColor} pattern={config.jerseyPattern} />

        {/* Head */}
        <ellipse cx="50" cy="35" rx="18" ry="20" fill={config.skinTone} />

        {/* Helmet */}
        <Helmet style={config.helmetStyle} color={config.helmetColor} />

        {/* Expression */}
        <Expression type={config.expression} mood={currentMood} />

        {/* Accessory */}
        <Accessory type={config.accessory} />

        {/* Bat (lg only) */}
        {size === "lg" && <Bat style={config.batStyle} />}
      </svg>
    </motion.div>
  );
}

// Body with jersey pattern
function Body({ bodyType, jerseyColor, pattern }: { bodyType: number; jerseyColor: string; pattern: number }) {
  const widths = [22, 26, 20]; // slim, broad, lean
  const hw = widths[bodyType] || 22;

  return (
    <g>
      {/* Torso */}
      <rect x={50 - hw} y={52} width={hw * 2} height={32} rx={6} fill={jerseyColor} />

      {/* Jersey pattern */}
      {pattern === 1 && (
        // Horizontal stripe
        <rect x={50 - hw} y={62} width={hw * 2} height={6} fill="white" opacity="0.2" />
      )}
      {pattern === 2 && (
        // V-neck accent
        <polygon points={`${50 - hw + 4},52 50,64 ${50 + hw - 4},52`} fill="white" opacity="0.15" />
      )}
      {pattern === 3 && (
        // Side panels
        <>
          <rect x={50 - hw} y={52} width={6} height={32} rx={3} fill="white" opacity="0.12" />
          <rect x={50 + hw - 6} y={52} width={6} height={32} rx={3} fill="white" opacity="0.12" />
        </>
      )}

      {/* Jersey number circle */}
      <circle cx="50" cy="68" r="6" fill="white" opacity="0.15" />
    </g>
  );
}

// Helmet styles
function Helmet({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // Classic helmet with grille
      return (
        <g>
          <ellipse cx="50" cy="28" rx="22" ry="16" fill={color} />
          <rect x="40" y="35" width="20" height="3" rx="1" fill={color} opacity="0.7" />
          {/* Grille lines */}
          <line x1="42" y1="36" x2="42" y2="39" stroke="white" strokeWidth="0.8" opacity="0.4" />
          <line x1="46" y1="36" x2="46" y2="39" stroke="white" strokeWidth="0.8" opacity="0.4" />
          <line x1="50" y1="36" x2="50" y2="39" stroke="white" strokeWidth="0.8" opacity="0.4" />
          <line x1="54" y1="36" x2="54" y2="39" stroke="white" strokeWidth="0.8" opacity="0.4" />
          <line x1="58" y1="36" x2="58" y2="39" stroke="white" strokeWidth="0.8" opacity="0.4" />
        </g>
      );
    case 1: // Cap
      return (
        <g>
          <ellipse cx="50" cy="24" rx="20" ry="10" fill={color} />
          <rect x="30" y="22" width="25" height="4" rx="2" fill={color} />
          <rect x="28" y="22" width="12" height="3" rx="1.5" fill={color} opacity="0.8" />
        </g>
      );
    case 2: // Modern helmet with visor
      return (
        <g>
          <ellipse cx="50" cy="27" rx="23" ry="15" fill={color} />
          <rect x="38" y="34" width="24" height="4" rx="2" fill="#1a1a2e" opacity="0.6" />
          {/* Visor shine */}
          <rect x="40" y="35" width="10" height="1.5" rx="0.75" fill="white" opacity="0.3" />
        </g>
      );
    case 3: // Retro helmet
    default:
      return (
        <g>
          <ellipse cx="50" cy="26" rx="21" ry="14" fill={color} />
          <ellipse cx="50" cy="21" rx="18" ry="8" fill={color} />
          {/* Stripe */}
          <rect x="48" y="13" width="4" height="20" rx="2" fill="white" opacity="0.15" />
        </g>
      );
  }
}

// Facial expressions
function Expression({ type, mood }: { type: number; mood: AvatarMood }) {
  const moodOffset = mood === "disappointed" ? 2 : 0;

  switch (type) {
    case 0: // Happy
      return (
        <g>
          <circle cx="43" cy={34 + moodOffset} r="2" fill="#1a1a2e" />
          <circle cx="57" cy={34 + moodOffset} r="2" fill="#1a1a2e" />
          <path d={`M 43 ${42 + moodOffset} Q 50 ${mood === "disappointed" ? 40 : 47} 57 ${42 + moodOffset}`} stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 1: // Determined
      return (
        <g>
          <rect x="41" y={33 + moodOffset} width="4" height="2.5" rx="1" fill="#1a1a2e" />
          <rect x="55" y={33 + moodOffset} width="4" height="2.5" rx="1" fill="#1a1a2e" />
          <line x1="44" y1={42 + moodOffset} x2="56" y2={42 + moodOffset} stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      );
    case 2: // Cheeky wink
      return (
        <g>
          <circle cx="43" cy={34 + moodOffset} r="2" fill="#1a1a2e" />
          <line x1="55" y1={34 + moodOffset} x2="59" y2={33 + moodOffset} stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" />
          <path d={`M 44 ${42 + moodOffset} Q 50 ${46 + moodOffset} 56 ${42 + moodOffset}`} stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 3: // Excited / wide eyes
      return (
        <g>
          <circle cx="43" cy={34 + moodOffset} r="2.5" fill="#1a1a2e" />
          <circle cx="43" cy={33.5 + moodOffset} r="1" fill="white" />
          <circle cx="57" cy={34 + moodOffset} r="2.5" fill="#1a1a2e" />
          <circle cx="57" cy={33.5 + moodOffset} r="1" fill="white" />
          <ellipse cx="50" cy={43 + moodOffset} rx="4" ry="2.5" fill="#1a1a2e" />
        </g>
      );
    case 4: // Cool / squint
    default:
      return (
        <g>
          <line x1="40" y1={34 + moodOffset} x2="46" y2={34 + moodOffset} stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
          <line x1="54" y1={34 + moodOffset} x2="60" y2={34 + moodOffset} stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
          <path d={`M 45 ${42 + moodOffset} Q 50 ${44 + moodOffset} 55 ${42 + moodOffset}`} stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

// Accessories
function Accessory({ type }: { type: number }) {
  switch (type) {
    case 1: // Sunglasses
      return (
        <g>
          <rect x="38" y="31" width="10" height="7" rx="2" fill="#1a1a2e" opacity="0.8" />
          <rect x="52" y="31" width="10" height="7" rx="2" fill="#1a1a2e" opacity="0.8" />
          <line x1="48" y1="34" x2="52" y2="34" stroke="#1a1a2e" strokeWidth="1" />
        </g>
      );
    case 2: // Sweatband
      return <rect x="32" y="28" width="36" height="4" rx="2" fill="#ff4444" opacity="0.7" />;
    case 3: // War paint
      return (
        <g>
          <rect x="36" y="36" width="8" height="2" rx="1" fill="#1a1a2e" opacity="0.3" transform="rotate(-10 40 37)" />
          <rect x="56" y="36" width="8" height="2" rx="1" fill="#1a1a2e" opacity="0.3" transform="rotate(10 60 37)" />
        </g>
      );
    case 4: // Earring
      return <circle cx="32" cy="38" r="2" fill="#ffd700" />;
    case 5: // Bandana
      return (
        <g>
          <path d="M 30 26 Q 50 20 70 26" stroke="#e11d48" strokeWidth="3" fill="none" />
          <path d="M 70 26 L 75 32 L 72 30" fill="#e11d48" />
        </g>
      );
    default: // 0 = no accessory
      return null;
  }
}

// Bat (shown only in lg size)
function Bat({ style }: { style: number }) {
  const batColors = ["#d4a574", "#8B4513", "#f5deb3"];
  const color = batColors[style] || batColors[0];

  return (
    <g transform="translate(72, 50) rotate(30)">
      {/* Handle */}
      <rect x="-2" y="0" width="4" height="18" rx="2" fill="#2d1b0e" />
      {/* Grip */}
      <rect x="-2.5" y="14" width="5" height="6" rx="1" fill="#444" />
      {/* Blade */}
      <rect x="-5" y="-20" width="10" height="22" rx="2" fill={color} />
      {/* Edge highlight */}
      <rect x="-5" y="-20" width="2" height="22" rx="1" fill="white" opacity="0.15" />
    </g>
  );
}
