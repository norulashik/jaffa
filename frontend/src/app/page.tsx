"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";

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
    <main className="relative h-screen w-full flex flex-col items-center justify-center bg-stadium-gradient overflow-hidden">
      {/* Ambient Deep Purple Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-full h-full bg-on-tertiary-fixed-variant/20 blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-1/4 -right-1/4 w-full h-full bg-on-secondary-container/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Impact Effect Layers */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="glass-impact w-[140vw] h-[140vw] max-w-[1200px] max-h-[1200px] rounded-full"></div>
        <div className="absolute w-full h-full">
          <div className="cracked-line w-[400px] rotate-[15deg] top-1/2 left-1/2 opacity-20"></div>
          <div className="cracked-line w-[300px] rotate-[165deg] top-1/2 left-1/2 opacity-10"></div>
          <div className="cracked-line w-[500px] rotate-[280deg] top-1/2 left-1/2 opacity-15"></div>
          <div className="cracked-line w-[350px] rotate-[75deg] top-1/2 left-1/2 opacity-5"></div>
        </div>
      </div>

      {/* Central Content Cluster */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Glassmorphic Logo Container */}
        <div className="relative mb-12 group">
          <div className="absolute inset-0 bg-primary-container/20 blur-3xl scale-125 opacity-50"></div>
          <div className="relative bg-surface-bright/30 backdrop-blur-2xl p-10 rounded-full border border-white/10 shadow-[0_0_80px_rgba(0,255,171,0.15)] flex items-center justify-center overflow-hidden">
            <MaterialIcon
              icon="sports_cricket"
              filled
              className="text-8xl text-primary-container text-glow"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>
          </div>
          <div className="absolute -top-4 -right-2 w-2 h-2 bg-secondary-container rounded-full blur-[1px]"></div>
          <div className="absolute bottom-8 -left-6 w-1 h-1 bg-primary-container rounded-full blur-[1px]"></div>
        </div>

        {/* Brand Typography */}
        <div className="text-center space-y-4 px-6">
          <h1 className="font-headline font-black italic text-7xl md:text-9xl tracking-[0.2em] text-primary-container uppercase drop-shadow-[0_0_30px_rgba(0,255,171,0.4)]">
            JAFFA
          </h1>
          <div className="h-1 w-24 bg-gradient-to-r from-transparent via-primary-container to-transparent mx-auto"></div>
          <p className="font-label text-secondary-fixed-dim uppercase tracking-[0.4em] text-xs md:text-sm font-bold opacity-80 mt-6">
            Predict. Play. Win at your café.
          </p>
        </div>
      </div>

      {/* Progress/Pulse Meter at Bottom */}
      <div className="absolute bottom-16 w-48 h-[2px] bg-surface-container-highest overflow-hidden rounded-full">
        <div className="h-full w-2/3 bg-gradient-to-r from-secondary-container to-primary-container shadow-[0_0_10px_#00FFAB] animate-[pulse_2s_infinite]"></div>
      </div>

      {/* Corner Details for Broadcast Feel */}
      <div className="absolute top-10 left-10 hidden md:block">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
          <span className="font-label text-xs font-bold tracking-widest text-on-surface-variant uppercase">
            Live Stream Connected
          </span>
        </div>
      </div>
      <div className="absolute bottom-10 right-10 hidden md:block">
        <div className="flex flex-col items-end">
          <span className="font-headline text-lg font-bold text-on-surface opacity-30">V.2.4.0</span>
          <span className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
            Stadium Engine Active
          </span>
        </div>
      </div>

      {/* Call to Action */}
      <div className="absolute bottom-24 z-20">
        <button
          onClick={() => router.push("/login")}
          className="group flex items-center gap-4 px-8 py-4 bg-primary-container text-on-primary-container rounded-md font-headline font-extrabold text-lg uppercase tracking-wider transition-all hover:shadow-[0_0_40px_rgba(0,255,171,0.4)] active:scale-95"
        >
          Enter Arena
          <MaterialIcon
            icon="double_arrow"
            className="transition-transform group-hover:translate-x-1"
          />
        </button>
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
