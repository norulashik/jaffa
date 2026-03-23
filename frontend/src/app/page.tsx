"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { GameProvider, useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import LandingPage from "@/components/LandingPage";
import OTPFlow from "@/components/OTPFlow";
import PreMatchCards from "@/components/PreMatchCards";
import LiveGame from "@/components/LiveGame";

function GameApp() {
  const { state, dispatch } = useGame();
  const searchParams = useSearchParams();

  const [venue, setVenue] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);
  const [gamePhase, setGamePhase] = useState<"landing" | "otp" | "prematch" | "live">("landing");
  const [playerCount, setPlayerCount] = useState(0);

  const venueId = searchParams.get("v") || searchParams.get("venue");
  const matchId = searchParams.get("m") || searchParams.get("match");

  // Load venue info
  useEffect(() => {
    if (venueId) {
      api.getVenue(venueId).then(setVenue).catch(console.error);
      dispatch({ type: "SET_VENUE", venueId, venueName: "" });
    }
  }, [venueId]);

  // Load match info
  useEffect(() => {
    if (matchId) {
      api.getMatch(matchId).then(setMatch).catch(console.error);
      dispatch({ type: "SET_MATCH", matchId });
    } else {
      // Get current matches
      api.getMatches().then((matches) => {
        if (matches.length > 0) {
          setMatch(matches[0]);
          dispatch({ type: "SET_MATCH", matchId: matches[0].id });
        }
      }).catch(console.error);
    }
  }, [matchId]);

  // Update venue name
  useEffect(() => {
    if (venue?.name) {
      dispatch({ type: "SET_VENUE", venueId: venue.id, venueName: venue.name });
    }
  }, [venue]);

  // Load player count
  useEffect(() => {
    if (match?.id && venueId) {
      api.getPlayerCount(match.id, venueId).then((d) => setPlayerCount(d.count)).catch(() => {});
    }
  }, [match?.id, venueId]);

  // Auto-advance phase based on state
  useEffect(() => {
    if (state.isLoading) return;
    if (!venueId && !matchId) return; // No URL params, show fallback

    if (!state.user) {
      setGamePhase("landing");
      return;
    }

    if (!match) return; // Match still loading, wait
    if (!venueId) return; // Need venue to get match state

    // User is logged in and match is loaded
    api.getMatchState(match.id, venueId)
      .then((data) => {
        if (data.participant) {
          // Already joined — check if they've answered all pre-match questions
          const unansweredPreMatch = data.openPredictions.filter(
            (p: any) => p.category === "pre_match" && !p.userAnswered
          );
          if (unansweredPreMatch.length > 0) {
            setGamePhase("prematch");
          } else {
            setGamePhase("live");
          }
        } else {
          // Not joined yet — show pre-match cards (which also joins them)
          setGamePhase("prematch");
        }
      })
      .catch(() => setGamePhase("prematch"));
  }, [state.user, state.isLoading, match, venueId, matchId]);

  if (state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="text-5xl font-black text-orange-500 mb-4">JAFFA</div>
          <div className="text-slate-400 animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  // Check if game is open (45 min before match start)
  const isGameOpen = (() => {
    if (!match?.startTime) return false;
    if (match.status === "live") return true; // always open if match is live
    const matchStart = new Date(match.startTime).getTime();
    const now = Date.now();
    const fortyFiveMinBefore = matchStart - 45 * 60 * 1000;
    return now >= fortyFiveMinBefore;
  })();

  if (!isGameOpen && match && venue) {
    return (
      <CountdownGate match={match} venue={venue} />
    );
  }

  if (gamePhase === "landing" && !state.user) {
    return (
      <LandingPage
        venue={venue}
        match={match}
        playerCount={playerCount}
        onJoin={() => setGamePhase("otp")}
      />
    );
  }

  if (gamePhase === "otp") {
    return (
      <OTPFlow
        onComplete={() => {
          setGamePhase("prematch");
        }}
      />
    );
  }

  if (gamePhase === "prematch" && match) {
    return (
      <PreMatchCards
        match={match}
        venueId={venueId || ""}
        onComplete={() => setGamePhase("live")}
      />
    );
  }

  if (gamePhase === "live" && match) {
    return (
      <LiveGame
        match={match}
        venueId={venueId || ""}
      />
    );
  }

  // Fallback: no venue or match
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl font-black text-orange-500 mb-4">JAFFA</div>
        <p className="text-slate-400 mb-6">
          Scan the QR code at your cafe to join the game!
        </p>
        <div className="text-sm text-slate-600">
          Predict. Play. Win.
        </div>
      </div>
    </div>
  );
}

function CountdownGate({ match, venue }: { match: any; venue: any }) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, mins: 0, secs: 0 });

  useEffect(() => {
    const opensAt = new Date(match.startTime).getTime() - 45 * 60 * 1000;

    const tick = () => {
      const diff = opensAt - Date.now();
      if (diff <= 0) {
        window.location.reload();
        return;
      }
      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        mins: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        secs: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [match.startTime]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
      <h1 className="text-5xl font-black text-orange-500 mb-4">JAFFA</h1>
      <div className="w-full max-w-sm bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 mb-6 text-center">
        <p className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-3">
          {match.team1Short} vs {match.team2Short}
        </p>
        <p className="text-white font-semibold text-lg mb-4">
          Game opens 45 minutes before the match
        </p>
        <div className="bg-slate-900 rounded-xl p-4 mb-3">
          <p className="text-slate-400 text-sm mb-2">Opens in</p>
          <div className="flex justify-center gap-3">
            <div className="text-center">
              <p className="text-3xl font-black text-orange-500">{String(timeLeft.hours).padStart(2, "0")}</p>
              <p className="text-xs text-slate-500">hours</p>
            </div>
            <p className="text-3xl font-black text-slate-600">:</p>
            <div className="text-center">
              <p className="text-3xl font-black text-orange-500">{String(timeLeft.mins).padStart(2, "0")}</p>
              <p className="text-xs text-slate-500">mins</p>
            </div>
            <p className="text-3xl font-black text-slate-600">:</p>
            <div className="text-center">
              <p className="text-3xl font-black text-orange-500">{String(timeLeft.secs).padStart(2, "0")}</p>
              <p className="text-xs text-slate-500">secs</p>
            </div>
          </div>
        </div>
        <p className="text-slate-500 text-xs">
          Playing at {venue.name}
        </p>
      </div>
      <p className="text-slate-600 text-sm">Come back closer to match time!</p>
    </div>
  );
}

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950">
    <div className="text-center">
      <div className="text-5xl font-black text-orange-500 mb-4">JAFFA</div>
      <div className="text-slate-400 animate-pulse">Loading...</div>
    </div>
  </div>
);

const GameAppNoSSR = dynamic(() => Promise.resolve(GameApp), {
  ssr: false,
  loading: () => <LoadingFallback />,
});

export default function Home() {
  return (
    <GameProvider>
      <Suspense fallback={<LoadingFallback />}>
        <GameAppNoSSR />
      </Suspense>
    </GameProvider>
  );
}
