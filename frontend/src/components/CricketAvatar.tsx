"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AvatarConfig, AvatarSize, AvatarMood } from "@/types/avatar";
import { getTeamByCode } from "@/lib/iplTeams";

interface CricketAvatarProps {
  config: AvatarConfig;
  size?: AvatarSize;
  mood?: AvatarMood;
  interactive?: boolean;
}

const SIZES = { sm: 36, md: 52, lg: 100 };
const OL = "#2d1b0e"; // outline color

export default function CricketAvatar({
  config,
  size = "md",
  mood = "idle",
  interactive = false,
}: CricketAvatarProps) {
  const [currentMood, setCurrentMood] = useState<AvatarMood>(mood);
  const px = SIZES[size];
  const teamData = config.iplTeam ? getTeamByCode(config.iplTeam) : null;
  const hairColor = config.hairColor ?? "#1a1a2e";
  const hairStyle = config.hairStyle ?? 0;
  const facialHair = config.facialHair ?? 0;

  const handleTap = () => {
    if (!interactive) return;
    setCurrentMood("celebrate");
    setTimeout(() => setCurrentMood(mood), 800);
  };

  const containerVariants = {
    idle: { y: [0, -2, 0], transition: { repeat: Infinity, duration: 3, ease: "easeInOut" as const } },
    celebrate: { scale: [1, 1.15, 1], rotate: [0, -8, 8, 0], transition: { duration: 0.6 } },
    disappointed: { y: 3, rotate: -5, transition: { duration: 0.4 } },
    excited: { y: [0, -6, 0, -3, 0], transition: { duration: 0.5 } },
  };

  const accent = teamData?.secondaryColor || "white";
  const accentOp = teamData?.secondaryColor ? 0.5 : 0.2;
  const shoulders = [22, 26, 20][config.bodyType] || 22;

  return (
    <motion.div
      onClick={handleTap}
      animate={currentMood}
      variants={containerVariants}
      whileTap={interactive ? { scale: 0.9 } : undefined}
      style={{ width: px, height: px, cursor: interactive ? "pointer" : "default" }}
      className="relative select-none"
    >
      <svg viewBox="0 0 100 150" width={px} height={px} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        {/* === LEGS === */}
        {/* Left leg */}
        <rect x="36" y="100" width="11" height="32" rx="5" fill="#f0f0f0" stroke={OL} strokeWidth="0.8" />
        {/* Right leg */}
        <rect x="53" y="100" width="11" height="32" rx="5" fill="#f0f0f0" stroke={OL} strokeWidth="0.8" />

        {/* === SHOES === */}
        <ellipse cx="41" cy="134" rx="8" ry="5" fill="#333" stroke={OL} strokeWidth="0.6" />
        <ellipse cx="41" cy="133" rx="6" ry="2" fill="#555" />
        <ellipse cx="59" cy="134" rx="8" ry="5" fill="#333" stroke={OL} strokeWidth="0.6" />
        <ellipse cx="59" cy="133" rx="6" ry="2" fill="#555" />

        {/* === BODY / JERSEY === */}
        <path
          d={`M ${50 - shoulders} 62 Q ${50 - shoulders - 2} 62 ${50 - shoulders - 4} 64 L ${50 - shoulders - 4} 100 L ${50 + shoulders + 4} 100 L ${50 + shoulders + 4} 64 Q ${50 + shoulders + 2} 62 ${50 + shoulders} 62 Z`}
          fill={config.jerseyColor} stroke={OL} strokeWidth="0.8"
        />

        {/* Sleeves */}
        <path d={`M ${50 - shoulders} 62 Q ${50 - shoulders - 8} 60 ${50 - shoulders - 10} 68 L ${50 - shoulders - 10} 78 Q ${50 - shoulders - 8} 82 ${50 - shoulders - 4} 78`}
          fill={config.jerseyColor} stroke={OL} strokeWidth="0.6" />
        <path d={`M ${50 + shoulders} 62 Q ${50 + shoulders + 8} 60 ${50 + shoulders + 10} 68 L ${50 + shoulders + 10} 78 Q ${50 + shoulders + 8} 82 ${50 + shoulders + 4} 78`}
          fill={config.jerseyColor} stroke={OL} strokeWidth="0.6" />

        {/* Arms (skin) */}
        <rect x={50 - shoulders - 10} y={76} width="8" height="16" rx="4" fill={config.skinTone} stroke={OL} strokeWidth="0.5" />
        <rect x={50 + shoulders + 2} y={76} width="8" height="16" rx="4" fill={config.skinTone} stroke={OL} strokeWidth="0.5" />
        {/* Hands */}
        <circle cx={50 - shoulders - 6} cy={93} r="4.5" fill={config.skinTone} stroke={OL} strokeWidth="0.5" />
        <circle cx={50 + shoulders + 6} cy={93} r="4.5" fill={config.skinTone} stroke={OL} strokeWidth="0.5" />

        {/* Jersey patterns */}
        {config.jerseyPattern === 1 && (
          <rect x={50 - shoulders - 3} y={76} width={(shoulders + 3) * 2} height={5} fill={accent} opacity={accentOp} />
        )}
        {config.jerseyPattern === 2 && (
          <polygon points={`${50 - shoulders + 2},62 50,78 ${50 + shoulders - 2},62`} fill={accent} opacity={accentOp} />
        )}
        {config.jerseyPattern === 3 && (
          <>
            <rect x={50 - shoulders - 3} y={62} width="5" height="38" rx="2" fill={accent} opacity={accentOp} />
            <rect x={50 + shoulders - 2} y={62} width="5" height="38" rx="2" fill={accent} opacity={accentOp} />
          </>
        )}

        {/* Collar */}
        <path d="M 42 60 Q 46 65 50 66 Q 54 65 58 60" stroke={accent} strokeWidth="1.5" fill="none" opacity={accentOp + 0.15} />

        {/* Team code */}
        {teamData?.shortName ? (
          <text x="50" y="90" textAnchor="middle" fontSize="7" fill={accent} fontWeight="bold" opacity="0.6"
            style={{ fontFamily: "Arial, sans-serif" }}>{teamData.shortName}</text>
        ) : (
          <circle cx="50" cy="86" r="4" fill="white" opacity="0.1" />
        )}

        {/* === NECK === */}
        <rect x="44" y="54" width="12" height="10" rx="5" fill={config.skinTone} />

        {/* === HEAD === */}
        <ellipse cx="50" cy="35" rx="22" ry="24" fill={config.skinTone} stroke={OL} strokeWidth="0.8" />

        {/* Ears */}
        <ellipse cx="28" cy="38" rx="4.5" ry="6" fill={config.skinTone} stroke={OL} strokeWidth="0.5" />
        <ellipse cx="28" cy="38" rx="2.5" ry="3.5" fill={OL} opacity="0.08" />
        <ellipse cx="72" cy="38" rx="4.5" ry="6" fill={config.skinTone} stroke={OL} strokeWidth="0.5" />
        <ellipse cx="72" cy="38" rx="2.5" ry="3.5" fill={OL} opacity="0.08" />

        {/* === HAIR === */}
        <Hair style={hairStyle} color={hairColor} />

        {/* === FACE === */}
        <Expression type={config.expression} mood={currentMood} />

        {/* Nose */}
        <path d="M 48 43 Q 50 46 52 43" stroke={OL} strokeWidth="0.8" fill="none" opacity="0.25" strokeLinecap="round" />

        {/* Cheek blush */}
        <circle cx="36" cy="44" r="3.5" fill="#ff9999" opacity="0.12" />
        <circle cx="64" cy="44" r="3.5" fill="#ff9999" opacity="0.12" />

        {/* Facial hair */}
        <FacialHair type={facialHair} color={hairColor} />

        {/* === HELMET === */}
        <Helmet style={config.helmetStyle} color={config.helmetColor} />

        {/* === ACCESSORY === */}
        <Accessory type={config.accessory} />

        {/* === BAT (lg only) === */}
        {size === "lg" && <Bat style={config.batStyle} skinTone={config.skinTone} />}
      </svg>
    </motion.div>
  );
}

// --- Hair styles ---
function Hair({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // Buzz cut - very short, just a cap of color
      return (
        <path d="M 29 32 Q 29 11 50 11 Q 71 11 71 32 Q 65 28 50 28 Q 35 28 29 32 Z"
          fill={color} opacity="0.7" />
      );
    case 1: // Short neat
      return (
        <g>
          <path d="M 28 36 Q 28 10 50 10 Q 72 10 72 36 Q 68 30 50 28 Q 32 30 28 36 Z" fill={color} />
          {/* Side hair */}
          <path d="M 28 36 Q 26 34 27 30" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 72 36 Q 74 34 73 30" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      );
    case 2: // Spiky
      return (
        <g>
          <path d="M 28 34 Q 28 12 50 12 Q 72 12 72 34 Q 66 28 50 26 Q 34 28 28 34 Z" fill={color} />
          {/* Spikes */}
          <path d="M 35 16 L 38 8 L 41 16" fill={color} />
          <path d="M 43 14 L 46 5 L 50 13" fill={color} />
          <path d="M 52 13 L 55 4 L 58 14" fill={color} />
          <path d="M 60 16 L 63 8 L 65 17" fill={color} />
        </g>
      );
    case 3: // Curly
      return (
        <g>
          <path d="M 27 38 Q 25 8 50 8 Q 75 8 73 38 Q 66 28 50 26 Q 34 28 27 38 Z" fill={color} />
          {/* Curly texture */}
          <circle cx="35" cy="16" r="4" fill={color} />
          <circle cx="44" cy="12" r="4.5" fill={color} />
          <circle cx="55" cy="11" r="4.5" fill={color} />
          <circle cx="64" cy="14" r="4" fill={color} />
          <circle cx="30" cy="24" r="3.5" fill={color} />
          <circle cx="70" cy="24" r="3.5" fill={color} />
        </g>
      );
    case 4: // Long / flowing
    default:
      return (
        <g>
          <path d="M 26 42 Q 24 8 50 8 Q 76 8 74 42 Q 68 30 50 28 Q 32 30 26 42 Z" fill={color} />
          {/* Side flow */}
          <path d="M 26 42 Q 24 50 26 55" stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M 74 42 Q 76 50 74 55" stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

// --- Facial hair ---
function FacialHair({ type, color }: { type: number; color: string }) {
  switch (type) {
    case 1: // Stubble
      return (
        <g opacity="0.25">
          {[40,43,46,49,52,55,58].map(x =>
            [50,52,54].map(y =>
              <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill={color} />
            )
          )}
        </g>
      );
    case 2: // Goatee
      return (
        <g>
          <path d="M 46 52 Q 50 58 54 52" fill={color} opacity="0.5" />
          <path d="M 47 49 Q 50 50 53 49" stroke={color} strokeWidth="1.2" fill="none" opacity="0.4" />
        </g>
      );
    case 3: // Full beard
      return (
        <path d="M 36 44 Q 36 48 38 52 Q 42 60 50 62 Q 58 60 62 52 Q 64 48 64 44 Q 58 46 50 46 Q 42 46 36 44 Z"
          fill={color} opacity="0.45" />
      );
    default:
      return null;
  }
}

// --- Helmet ---
function Helmet({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // Classic helmet
      return (
        <g>
          <path d="M 28 36 Q 28 8 50 8 Q 72 8 72 36" fill={color} stroke={OL} strokeWidth="0.6" />
          <rect x="35" y="40" width="30" height="4" rx="2" fill={color} opacity="0.85" />
          {[37, 41, 45, 49, 53, 57, 61].map(x => (
            <line key={x} x1={x} y1="40" x2={x} y2="44" stroke="white" strokeWidth="0.6" opacity="0.35" />
          ))}
          <ellipse cx="40" cy="18" rx="7" ry="5" fill="white" opacity="0.08" />
        </g>
      );
    case 1: // Cap
      return (
        <g>
          <path d="M 28 28 Q 28 10 50 10 Q 72 10 72 28 Q 66 24 50 24 Q 34 24 28 28 Z" fill={color} stroke={OL} strokeWidth="0.5" />
          <path d="M 28 27 L 20 28 Q 18 29 20 30 L 28 29" fill={color} stroke={OL} strokeWidth="0.4" />
          <circle cx="50" cy="10" r="2" fill={color} />
          <ellipse cx="42" cy="18" rx="5" ry="3" fill="white" opacity="0.06" />
        </g>
      );
    case 2: // Modern helmet
      return (
        <g>
          <path d="M 27 38 Q 27 6 50 6 Q 73 6 73 38" fill={color} stroke={OL} strokeWidth="0.6" />
          <path d="M 32 36 Q 32 32 50 32 Q 68 32 68 36 L 68 42 Q 68 44 50 44 Q 32 44 32 42 Z"
            fill="#1a1a2e" opacity="0.55" />
          <path d="M 36 35 Q 44 34 52 35" stroke="white" strokeWidth="0.8" fill="none" opacity="0.25" />
          <ellipse cx="40" cy="16" rx="7" ry="4" fill="white" opacity="0.07" />
        </g>
      );
    case 3: // Retro
    default:
      return (
        <g>
          <path d="M 28 36 Q 28 6 50 6 Q 72 6 72 36" fill={color} stroke={OL} strokeWidth="0.6" />
          <path d="M 50 4 L 50 30" stroke="white" strokeWidth="3.5" opacity="0.12" strokeLinecap="round" />
          <ellipse cx="40" cy="16" rx="6" ry="3.5" fill="white" opacity="0.06" />
        </g>
      );
  }
}

// --- Expressions ---
function Expression({ type, mood }: { type: number; mood: AvatarMood }) {
  const m = mood === "disappointed" ? 2 : 0;

  switch (type) {
    case 0: // Happy
      return (
        <g>
          <path d={`M 37 ${30+m} Q 40 ${28+m} 44 ${30+m}`} stroke={OL} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
          <path d={`M 56 ${30+m} Q 59 ${28+m} 63 ${30+m}`} stroke={OL} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
          <ellipse cx="41" cy={35+m} rx="4.5" ry="4" fill="white" stroke={OL} strokeWidth="0.4" />
          <circle cx="42" cy={35.5+m} r="2.5" fill={OL} />
          <circle cx="42.8" cy={34.5+m} r="1" fill="white" />
          <ellipse cx="59" cy={35+m} rx="4.5" ry="4" fill="white" stroke={OL} strokeWidth="0.4" />
          <circle cx="58" cy={35.5+m} r="2.5" fill={OL} />
          <circle cx="58.8" cy={34.5+m} r="1" fill="white" />
          <path d={`M 42 ${49+m} Q 50 ${mood === "disappointed" ? 47 : 55} 58 ${49+m}`}
            stroke={OL} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      );
    case 1: // Determined
      return (
        <g>
          <path d={`M 36 ${31+m} L 44 ${29+m}`} stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
          <path d={`M 64 ${31+m} L 56 ${29+m}`} stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
          <ellipse cx="41" cy={35+m} rx="4.5" ry="3" fill="white" stroke={OL} strokeWidth="0.4" />
          <circle cx="42" cy={35+m} r="2.2" fill={OL} />
          <ellipse cx="59" cy={35+m} rx="4.5" ry="3" fill="white" stroke={OL} strokeWidth="0.4" />
          <circle cx="58" cy={35+m} r="2.2" fill={OL} />
          <line x1="44" y1={50+m} x2="56" y2={50+m} stroke={OL} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      );
    case 2: // Wink
      return (
        <g>
          <path d={`M 37 ${30+m} Q 40 ${28+m} 44 ${30+m}`} stroke={OL} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
          <path d={`M 56 ${29+m} Q 59 ${27+m} 63 ${29+m}`} stroke={OL} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
          <ellipse cx="41" cy={35+m} rx="4.5" ry="4" fill="white" stroke={OL} strokeWidth="0.4" />
          <circle cx="42" cy={35.5+m} r="2.5" fill={OL} />
          <circle cx="42.8" cy={34.5+m} r="1" fill="white" />
          <path d={`M 55 ${36+m} Q 59 ${34+m} 63 ${36+m}`} stroke={OL} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d={`M 43 ${49+m} Q 50 ${54+m} 58 ${48+m}`} stroke={OL} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      );
    case 3: // Excited
      return (
        <g>
          <path d={`M 36 ${27+m} Q 41 ${25+m} 45 ${27+m}`} stroke={OL} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
          <path d={`M 55 ${27+m} Q 59 ${25+m} 64 ${27+m}`} stroke={OL} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
          <ellipse cx="41" cy={35+m} rx="5.5" ry="5" fill="white" stroke={OL} strokeWidth="0.4" />
          <circle cx="41" cy={36+m} r="3.2" fill={OL} />
          <circle cx="42" cy={34.5+m} r="1.3" fill="white" />
          <ellipse cx="59" cy={35+m} rx="5.5" ry="5" fill="white" stroke={OL} strokeWidth="0.4" />
          <circle cx="59" cy={36+m} r="3.2" fill={OL} />
          <circle cx="60" cy={34.5+m} r="1.3" fill="white" />
          <ellipse cx="50" cy={51+m} rx="5" ry="4" fill={OL} />
          <ellipse cx="50" cy={50+m} rx="3.5" ry="1.8" fill="white" opacity="0.85" />
        </g>
      );
    case 4: // Cool
    default:
      return (
        <g>
          <line x1="36" y1={31+m} x2="45" y2={31+m} stroke={OL} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="55" y1={31+m} x2="64" y2={31+m} stroke={OL} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <path d={`M 36 ${36+m} Q 41 ${34+m} 45 ${36+m}`} stroke={OL} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M 55 ${36+m} Q 59 ${34+m} 64 ${36+m}`} stroke={OL} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M 44 ${49+m} Q 50 ${52+m} 56 ${49+m}`} stroke={OL} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

// --- Accessories ---
function Accessory({ type }: { type: number }) {
  switch (type) {
    case 1: // Sunglasses
      return (
        <g>
          <rect x="33" y="31" width="14" height="10" rx="3" fill="#1a1a2e" opacity="0.85" stroke={OL} strokeWidth="0.3" />
          <rect x="53" y="31" width="14" height="10" rx="3" fill="#1a1a2e" opacity="0.85" stroke={OL} strokeWidth="0.3" />
          <line x1="47" y1="36" x2="53" y2="36" stroke="#1a1a2e" strokeWidth="1.5" />
          <line x1="33" y1="36" x2="28" y2="35" stroke="#1a1a2e" strokeWidth="1" />
          <line x1="67" y1="36" x2="72" y2="35" stroke="#1a1a2e" strokeWidth="1" />
          <rect x="35" y="33" width="5" height="2" rx="1" fill="white" opacity="0.15" />
          <rect x="55" y="33" width="5" height="2" rx="1" fill="white" opacity="0.15" />
        </g>
      );
    case 2: // Sweatband
      return (
        <g>
          <path d="M 28 28 Q 50 24 72 28" stroke="#ff4444" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
          <path d="M 30 28 Q 50 25 70 28" stroke="#ff6666" strokeWidth="1.5" fill="none" opacity="0.35" />
        </g>
      );
    case 3: // War paint
      return (
        <g>
          <path d="M 32 42 L 40 39 L 32 44" fill={OL} opacity="0.2" />
          <path d="M 68 42 L 60 39 L 68 44" fill={OL} opacity="0.2" />
        </g>
      );
    case 4: // Earring
      return (
        <g>
          <circle cx="27" cy="44" r="2.8" fill="#ffd700" stroke="#daa520" strokeWidth="0.5" />
          <circle cx="27" cy="44" r="1.3" fill="#ffed4a" />
        </g>
      );
    case 5: // Bandana
      return (
        <g>
          <path d="M 27 26 Q 50 20 73 26" stroke="#e11d48" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M 73 26 L 79 33 L 77 31 L 75 34" fill="#e11d48" />
        </g>
      );
    default:
      return null;
  }
}

// --- Bat ---
function Bat({ style, skinTone }: { style: number; skinTone: string }) {
  const batColors = ["#d4a574", "#8B4513", "#f5deb3"];
  const color = batColors[style] || batColors[0];

  return (
    <g transform="translate(78, 80) rotate(20)">
      <circle cx="0" cy="6" r="4.5" fill={skinTone} stroke={OL} strokeWidth="0.4" />
      <rect x="-2.5" y="6" width="5" height="10" rx="2" fill="#444" />
      <rect x="-2" y="-2" width="4" height="10" rx="1.5" fill="#5c3d1e" />
      <rect x="-5.5" y="-24" width="11" height="24" rx="2.5" fill={color} stroke={OL} strokeWidth="0.3" />
      <rect x="-5.5" y="-24" width="3" height="24" rx="1" fill="white" opacity="0.1" />
    </g>
  );
}
