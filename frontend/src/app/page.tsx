"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { GiTrophyCup, GiPodiumWinner, GiLightningTrio, GiTwoCoins } from "react-icons/gi";
import Image from "next/image";

const BUNGEE: React.CSSProperties = {
  fontFamily: "'Bungee', 'Impact', cursive",
  textTransform: "uppercase" as const,
};

const featureCards = [
  { label: "LIVE PREDICTIONS", color: "#ff6341", Icon: GiTrophyCup },
  { label: "COMPETE", color: "#ffd60a", Icon: GiPodiumWinner },
  { label: "INSTANT POINTS", color: "#3b9eff", Icon: GiLightningTrio },
  { label: "WIN REWARDS", color: "#22c55e", Icon: GiTwoCoins },
];

function SplashScreenInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const venueId = searchParams.get("v");
    const matchId = searchParams.get("m");
    if (venueId) localStorage.setItem("jaffa_venue_id", venueId);
    if (matchId) localStorage.setItem("jaffa_match_id", matchId);
  }, [searchParams]);

  return (
    <main className="relative min-h-screen w-full flex flex-col items-center justify-center bg-[#0d0d0d] overflow-hidden">
      {/* Orange accent stripe at top */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[#ff6341] z-50" />

      {/* Corner accents - top right */}
      <div
        className="fixed top-0 right-0 w-0 h-0 z-40"
        style={{
          borderLeft: "80px solid transparent",
          borderTop: "80px solid #ff6341",
        }}
      />
      {/* Corner accents - bottom left */}
      <div
        className="fixed bottom-0 left-0 w-0 h-0 z-40"
        style={{
          borderRight: "80px solid transparent",
          borderBottom: "80px solid #ff6341",
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center px-6 py-12 max-w-lg w-full">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Image
            src="/jaffa-logo.png"
            alt="JAFFA"
            width={260}
            height={100}
            className="w-[260px] h-auto"
            priority
          />
        </motion.div>

        {/* Tagline sticker */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-6"
        >
          <div
            className="px-6 py-3 bg-[#ff6341] border-3 border-black"
            style={{
              ...BUNGEE,
              boxShadow: "6px 6px 0 0 #000000",
              borderRadius: "3px",
              fontSize: "1.1rem",
              color: "#000",
              letterSpacing: "0.08em",
            }}
          >
            PREDICT &bull; COMPETE &bull; WIN
          </div>
        </motion.div>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="text-white/70 text-center text-sm mb-10 max-w-xs leading-relaxed"
        >
          Over-by-over IPL predictions at your favorite venue. No app needed, just cricket instincts.
        </motion.p>

        {/* 4-color feature grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-10"
        >
          {featureCards.map(({ label, color, Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
              className="flex flex-col items-center justify-center p-4 bg-[#1a1a1a]"
              style={{
                border: `2px solid ${color}`,
                borderRadius: "4px",
                boxShadow: `5px 5px 0 0 ${color}`,
              }}
            >
              <Icon size={28} color={color} className="mb-2" />
              <span
                className="text-white text-center leading-tight"
                style={{
                  ...BUNGEE,
                  fontSize: "0.7rem",
                  letterSpacing: "0.02em",
                }}
              >
                {label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Enter Arena button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.9 }}
          className="mb-6 w-full flex justify-center"
        >
          <button
            onClick={() => router.push("/login")}
            className="btn-sticker btn-orange px-10 py-4 text-lg"
            style={BUNGEE}
          >
            ENTER ARENA
          </button>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.1 }}
          className="text-white/40 text-xs text-center tracking-wider uppercase"
        >
          No app download &bull; No hardware &bull; Zero friction
        </motion.p>
      </div>
    </main>
  );
}

export default function SplashScreen() {
  return (
    <Suspense>
      <SplashScreenInner />
    </Suspense>
  );
}
