"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { IoFlame, IoRocket, IoTrophy } from "react-icons/io5";
import { MdSportsCricket } from "react-icons/md";
import CricketAvatar from "@/components/CricketAvatar";
import { AvatarConfig } from "@/types/avatar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

interface TVLeaderboardEntry {
  rank: number;
  displayName: string;
  points: number;
  totalPoints: number;
  currentStreak: number;
  avatarConfig?: AvatarConfig | null;
}

export default function TVDisplay() {
  const [venueId, setVenueId] = useState<string>("");
  const [matchId, setMatchId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [roundLeaderboard, setRoundLeaderboard] = useState<TVLeaderboardEntry[]>([]);
  const [matchLeaderboard, setMatchLeaderboard] = useState<TVLeaderboardEntry[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [playerCount, setPlayerCount] = useState(0);
  const [displayMode, setDisplayMode] = useState<"round" | "match" | "pulse" | "hype">("round");
  const [pulseData, setPulseData] = useState<any>(null);
  const [hypeData, setHypeData] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const cycleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Parse URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVenueId(params.get("v") || params.get("venue") || "");
    setMatchId(params.get("m") || params.get("match") || "");
  }, []);

  // Load initial data
  useEffect(() => {
    if (!venueId || !matchId) return;

    loadMatch();
    loadLeaderboards();

    // Connect socket
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("joinTV", { venueId, matchId });
    });

    socket.on("leaderboardUpdate", () => loadLeaderboards());
    socket.on("playerCount", (data: { count: number }) => setPlayerCount(data.count));

    socket.on("predictionPulse", (data: any) => {
      setPulseData(data);
      setDisplayMode("pulse");
      setTimeout(() => {
        setDisplayMode("round");
        setPulseData(null);
      }, 10000);
    });

    socket.on("hypeEvent", (data: any) => {
      setHypeData(data);
      setDisplayMode("hype");
      setTimeout(() => {
        setDisplayMode("round");
        setHypeData(null);
      }, 8000);
    });

    socket.on("roundWinner", (data: any) => {
      setHypeData({ type: "round_winner", ...data });
      setDisplayMode("hype");
      setTimeout(() => {
        setDisplayMode("round");
        setHypeData(null);
      }, 15000);
    });

    socket.on("matchEnd", () => {
      setDisplayMode("match");
    });

    return () => {
      socket.disconnect();
    };
  }, [venueId, matchId]);

  // Cycle between round and match leaderboard every 30 seconds
  useEffect(() => {
    if (displayMode !== "round" && displayMode !== "match") return;

    cycleTimerRef.current = setInterval(() => {
      setDisplayMode((prev) => (prev === "round" ? "match" : "round"));
    }, 30000);

    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    };
  }, [displayMode]);

  const loadMatch = async () => {
    try {
      const res = await fetch(`${API_URL}/matches/${matchId}`);
      if (res.ok) setMatch(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const loadLeaderboards = async () => {
    try {
      const [roundRes, matchRes, countRes] = await Promise.all([
        fetch(`${API_URL}/leaderboard/${matchId}/${venueId}/round/${currentRound}`),
        fetch(`${API_URL}/leaderboard/${matchId}/${venueId}/match`),
        fetch(`${API_URL}/leaderboard/${matchId}/${venueId}/count`),
      ]);

      if (roundRes.ok) {
        const data = await roundRes.json();
        setRoundLeaderboard(data.leaderboard);
      }
      if (matchRes.ok) {
        const data = await matchRes.json();
        setMatchLeaderboard(data.leaderboard);
      }
      if (countRes.ok) {
        const data = await countRes.json();
        setPlayerCount(data.count);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!venueId || !matchId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-black text-orange-500 mb-4">JAFFA</h1>
          <p className="text-slate-400 text-xl">TV Display</p>
          <p className="text-slate-600 mt-4">Add ?v=VENUE_ID&m=MATCH_ID to the URL</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-5xl font-black text-orange-500">JAFFA</h1>
          {match && (
            <div className="flex items-center gap-3 ml-4">
              <MdSportsCricket className="text-2xl text-slate-400" />
              <span className="text-2xl font-bold text-white">
                {match.team1Short} vs {match.team2Short}
              </span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg text-slate-400">{playerCount} players</div>
          <div className="text-sm text-orange-400">
            {displayMode === "round" ? `Round ${currentRound}` : displayMode === "match" ? "Overall" : ""}
          </div>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {/* Round Leaderboard */}
        {displayMode === "round" && (
          <motion.div
            key="round"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-white">
                Round {currentRound} Leaderboard
              </h2>
              <p className="text-slate-400">Top performers this round</p>
            </div>
            <TVLeaderboard entries={roundLeaderboard} pointsKey="points" />
          </motion.div>
        )}

        {/* Match Leaderboard */}
        {displayMode === "match" && (
          <motion.div
            key="match"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-white">Match Leaderboard</h2>
              <p className="text-slate-400">Overall standings</p>
            </div>
            <TVLeaderboard entries={matchLeaderboard} pointsKey="totalPoints" />
          </motion.div>
        )}

        {/* Prediction Pulse */}
        {displayMode === "pulse" && pulseData && (
          <motion.div
            key="pulse"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="flex items-center justify-center h-[60vh]"
          >
            <div className="text-center max-w-3xl">
              <div className="text-xl text-slate-400 mb-4">{pulseData.question}</div>
              <div className="text-4xl font-black text-orange-500 mb-6">
                {pulseData.correctLabel}
              </div>
              <div className="text-2xl font-bold text-white">
                {pulseData.pulse}
              </div>
            </div>
          </motion.div>
        )}

        {/* Hype Events */}
        {displayMode === "hype" && hypeData && (
          <motion.div
            key="hype"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="flex items-center justify-center h-[60vh]"
          >
            <div className="text-center">
              {hypeData.type === "all_in" && (
                <>
                  <motion.div
                    animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5 }}
                  >
                    <IoRocket className="text-8xl text-purple-400 mx-auto mb-6" />
                  </motion.div>
                  <p className="text-5xl font-black text-white mb-4">ALL IN!</p>
                  <p className="text-2xl text-purple-300">
                    {hypeData.playerName} is going all in!
                  </p>
                </>
              )}

              {hypeData.type === "all_in_failed" && (
                <>
                  <motion.div
                    animate={{ rotate: [0, -15, 15, -10, 10, 0], scale: [1, 0.8, 1] }}
                    transition={{ duration: 0.6 }}
                  >
                    <IoRocket className="text-8xl text-red-500 mx-auto mb-6" />
                  </motion.div>
                  <p className="text-5xl font-black text-red-400 mb-4">ALL IN FAILED!</p>
                  <p className="text-2xl text-red-300">
                    {hypeData.playerName} lost {hypeData.pointsLost} points
                  </p>
                  <p className="text-xl text-slate-400 mt-2">That&apos;s gotta hurt.</p>
                </>
              )}

              {hypeData.type === "streak" && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: 3, duration: 0.3 }}
                  >
                    <IoFlame className="text-8xl text-yellow-400 mx-auto mb-6" />
                  </motion.div>
                  <p className="text-5xl font-black text-white mb-4">
                    {hypeData.streak} STREAK!
                  </p>
                  <p className="text-2xl text-yellow-300">
                    {hypeData.playerName} is on fire!
                  </p>
                </>
              )}

              {hypeData.type === "round_winner" && (
                <>
                  <motion.div
                    animate={{ rotate: [0, -5, 5, 0] }}
                    transition={{ repeat: 2, duration: 0.5 }}
                  >
                    <IoTrophy className="text-8xl text-yellow-400 mx-auto mb-6" />
                  </motion.div>
                  <p className="text-4xl font-black text-white mb-6">
                    {hypeData.isGrandPrize ? "MATCH CHAMPION!" : `ROUND ${hypeData.round} WINNERS!`}
                  </p>
                  <div className="space-y-4">
                    {hypeData.winners?.map((w: any) => (
                      <motion.div
                        key={w.position}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: w.position * 0.3 }}
                        className="flex items-center justify-center gap-4"
                      >
                        <span className={`text-3xl font-black ${
                          w.position === 1 ? "text-yellow-400" :
                          w.position === 2 ? "text-slate-300" :
                          "text-orange-400"
                        }`}>
                          #{w.position}
                        </span>
                        <span className="text-2xl font-bold text-white">{w.displayName}</span>
                        <span className="text-xl text-slate-400">{w.points} pts</span>
                        <span className="text-lg text-green-400">{w.reward}</span>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur px-8 py-4 flex items-center justify-between">
        <p className="text-slate-400">
          Scan the QR code to join! <span className="text-orange-400 font-bold">JAFFA</span>
        </p>
        <p className="text-slate-500 text-sm">Predict. Play. Win.</p>
      </div>
    </div>
  );
}

function TVLeaderboard({
  entries,
  pointsKey,
}: {
  entries: TVLeaderboardEntry[];
  pointsKey: "points" | "totalPoints";
}) {
  const top10 = entries.slice(0, 10);

  return (
    <div className="max-w-4xl mx-auto">
      {top10.map((entry, index) => (
        <motion.div
          key={entry.displayName}
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: index * 0.05 }}
          className={`flex items-center gap-4 px-6 py-4 mb-2 rounded-xl ${
            index === 0
              ? "bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30"
              : index <= 2
              ? "bg-slate-800/60 border border-slate-700"
              : "bg-slate-900/40"
          }`}
        >
          {/* Rank */}
          <div className={`text-3xl font-black w-12 text-center ${
            index === 0 ? "text-yellow-400" :
            index === 1 ? "text-slate-300" :
            index === 2 ? "text-orange-400" :
            "text-slate-600"
          }`}>
            {entry.rank}
          </div>

          {/* Avatar */}
          {entry.avatarConfig && (
            <CricketAvatar
              config={entry.avatarConfig}
              size="md"
              mood={index === 0 ? "excited" : "idle"}
            />
          )}

          {/* Name + streak */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">{entry.displayName}</span>
              {entry.currentStreak >= 3 && (
                <span className="flex items-center gap-1 text-yellow-400 text-sm">
                  <IoFlame /> {entry.currentStreak}
                </span>
              )}
            </div>
          </div>

          {/* Points */}
          <div className="text-right">
            <span className={`text-2xl font-black ${
              index === 0 ? "text-yellow-400" : "text-white"
            }`}>
              {(entry as any)[pointsKey]}
            </span>
            <span className="text-sm text-slate-500 ml-1">pts</span>
          </div>
        </motion.div>
      ))}

      {top10.length === 0 && (
        <div className="text-center py-20">
          <p className="text-2xl text-slate-500">Waiting for players...</p>
          <p className="text-slate-600 mt-2">Scan the QR code to join!</p>
        </div>
      )}
    </div>
  );
}
