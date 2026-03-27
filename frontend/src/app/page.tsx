"use client";

import { useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { GiTrophyCup, GiPodiumWinner, GiLightningTrio, GiTwoCoins } from "react-icons/gi";
import { DISABLE_MOTION, SAFE_BOOT } from "@/lib/runtime-flags";

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

function SafeBootHome() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl border-2 border-[#ff6341] rounded-[4px] bg-[#1a1a1a] p-8">
        <div className="mb-6">
          <img
            src="/jaffa-logo.svg"
            alt="JAFFA"
            width={180}
            height={54}
            className="h-auto w-[180px]"
          />
        </div>
        <h1 className="text-3xl mb-4" style={BUNGEE}>
          Safe Boot Mode
        </h1>
        <p className="text-white/70 text-sm leading-6 mb-6">
          This lightweight startup path disables session restore, toast mounting,
          and motion-heavy splash rendering so you can test whether the browser
          stays stable on first load.
        </p>
        <div className="space-y-3">
          <Link
            href="/safe"
            className="block w-full px-5 py-3 bg-[#ff6341] text-black font-black uppercase tracking-wider text-center rounded-[3px]"
          >
            Open Safe Route
          </Link>
          <Link
            href="/login"
            className="block w-full px-5 py-3 border-2 border-[#ff6341] text-[#ff6341] font-black uppercase tracking-wider text-center rounded-[3px]"
          >
            Continue To Login
          </Link>
        </div>
      </div>
    </main>
  );
}

function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  if (DISABLE_MOTION) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SplashScreenInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const venueId = searchParams.get("v");
    const matchId = searchParams.get("m");
    if (venueId) localStorage.setItem("jaffa_venue_id", venueId);
    if (matchId) localStorage.setItem("jaffa_match_id", matchId);
  }, [searchParams]);

  if (SAFE_BOOT) {
    return <SafeBootHome />;
  }

  return (
    <main className="relative min-h-screen w-full flex flex-col items-center justify-center bg-[#0d0d0d] overflow-hidden">
      {/* Orange accent stripe at top */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[#ff6341] z-50" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center px-6 py-12 max-w-lg w-full">
        {/* Logo */}
        <FadeIn className="mb-8">
          <img
            src="/jaffa-logo.svg"
            alt="JAFFA"
            width={260}
            height={78}
            className="w-[260px] h-auto"
          />
        </FadeIn>

        {/* Tagline sticker */}
        <FadeIn delay={0.08} className="mb-6">
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
        </FadeIn>

        {/* Description */}
        <FadeIn delay={0.12} className="text-white/70 text-center text-sm mb-10 max-w-xs leading-relaxed">
          <p>
            Over-by-over IPL predictions at your favorite venue. No app needed,
            just cricket instincts.
          </p>
        </FadeIn>

        {/* 4-color feature grid */}
        <FadeIn delay={0.16} className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-10">
          {featureCards.map(({ label, color, Icon }, i) => (
            <div
              key={label}
              className="flex flex-col items-center justify-center p-4 bg-[#1a1a1a]"
              style={{
                border: `2px solid ${color}`,
                borderRadius: "4px",
                boxShadow: `5px 5px 0 0 ${color}`,
                opacity: DISABLE_MOTION ? 1 : 0.96 - i * 0.02,
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
            </div>
          ))}
        </FadeIn>

        {/* Enter Arena button */}
        <FadeIn delay={0.2} className="mb-6 w-full flex justify-center">
          <button
            onClick={() => router.push("/login")}
            className="btn-sticker btn-orange px-10 py-4 text-lg"
            style={BUNGEE}
          >
            ENTER ARENA
          </button>
        </FadeIn>

        {/* Subtitle */}
        <FadeIn delay={0.24} className="text-white/40 text-xs text-center tracking-wider uppercase">
          <p>No app download &bull; No hardware &bull; Zero friction</p>
        </FadeIn>
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
