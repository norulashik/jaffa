"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { IoFlame, IoRocket, IoTrophy } from "react-icons/io5";
import { GiCrownCoin } from "react-icons/gi";
import CricketAvatar from "@/components/CricketAvatar";
import { AvatarConfig } from "@/types/avatar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "");

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
      const res = await fetch(`${API_URL}/matches/${matchId}`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (res.ok) setMatch(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const loadLeaderboards = async () => {
    try {
      const [roundRes, matchRes, countRes] = await Promise.all([
        fetch(`${API_URL}/leaderboard/${matchId}/${venueId}/round/${currentRound}`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        }),
        fetch(`${API_URL}/leaderboard/${matchId}/${venueId}/match`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        }),
        fetch(`${API_URL}/leaderboard/${matchId}/${venueId}/count`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        }),
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0d0d' }}>
        <div className="text-center">
          <h1 className="text-7xl mb-4" style={{ fontFamily: 'Bungee', color: '#ff6341' }}>JAFFA</h1>
          <p className="text-2xl font-black text-white/50 uppercase">TV Display</p>
          <div className="mt-6 p-4" style={{ background: '#1a1a1a', border: '2px solid #ff6341', borderRadius: '4px', boxShadow: '4px 4px 0 0 #ff6341' }}>
            <p className="text-white/60 font-bold">Add <span className="text-[#ff6341]">?v=VENUE_ID&m=MATCH_ID</span> to the URL</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 overflow-hidden" style={{ background: '#0d0d0d' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between mb-8 p-6"
        style={{ background: '#1a1a1a', border: '3px solid #ff6341', borderRadius: '4px', boxShadow: '6px 6px 0 0 #000' }}
      >
        <div className="flex items-center gap-6">
          <h1 className="text-5xl" style={{ fontFamily: 'Bungee', color: '#ff6341' }}>JAFFA</h1>
          {match && (
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-white uppercase">{match.team1Short}</span>
              <span className="text-2xl font-black px-3 py-1" style={{ fontFamily: 'Bungee', color: '#ff6341', background: '#111', border: '2px solid #ff6341', borderRadius: '2px' }}>VS</span>
              <span className="text-3xl font-black text-white uppercase">{match.team2Short}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2" style={{ background: '#ff6341', border: '2px solid #000', borderRadius: '2px', boxShadow: '3px 3px 0 0 #000' }}>
            <GiCrownCoin className="w-5 h-5 text-black" />
            <span className="text-black font-black">{playerCount} PLAYERS</span>
          </div>
          <div className="px-3 py-1" style={{ background: '#222', border: '2px solid #555', borderRadius: '2px' }}>
            <span className="text-sm font-black text-white uppercase">
              {displayMode === "round" ? `Round ${currentRound}` : displayMode === "match" ? "Overall" : displayMode === "pulse" ? "Prediction" : "Hype"}
            </span>
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
              <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bungee' }}>
                ROUND <span style={{ color: '#ff6341' }}>{currentRound}</span> LEADERBOARD
              </h2>
              <p className="text-white/50 font-bold uppercase">Top performers this round</p>
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
              <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bungee' }}>
                MATCH <span style={{ color: '#ffd60a' }}>LEADERBOARD</span>
              </h2>
              <p className="text-white/50 font-bold uppercase">Overall standings</p>
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
            <div className="text-center max-w-3xl p-12" style={{ background: '#1a1a1a', border: '3px solid #ff6341', borderRadius: '4px', boxShadow: '8px 8px 0 0 #ff6341' }}>
              <span className="live-badge mb-6 inline-block">PREDICTION RESULT</span>
              <div className="text-xl text-white/60 mb-4 font-bold uppercase">{pulseData.question}</div>
              <div className="text-5xl mb-6" style={{ fontFamily: 'Bungee', color: '#22c55e' }}>
                {pulseData.correctLabel}
              </div>
              <div className="text-2xl font-black text-white">
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
                  <motion.div animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }} transition={{ duration: 0.5 }}>
                    <IoRocket className="text-8xl mx-auto mb-6" style={{ color: '#ffd60a' }} />
                  </motion.div>
                  <p className="text-6xl mb-4" style={{ fontFamily: 'Bungee', color: '#ffd60a' }}>ALL IN!</p>
                  <p className="text-2xl font-black text-white">
                    {hypeData.playerName} is going all in!
                  </p>
                </>
              )}

              {hypeData.type === "all_in_failed" && (
                <>
                  <motion.div animate={{ rotate: [0, -15, 15, -10, 10, 0], scale: [1, 0.8, 1] }} transition={{ duration: 0.6 }}>
                    <IoRocket className="text-8xl mx-auto mb-6" style={{ color: '#ff6341' }} />
                  </motion.div>
                  <p className="text-6xl mb-4" style={{ fontFamily: 'Bungee', color: '#ff6341' }}>ALL IN FAILED!</p>
                  <p className="text-2xl font-black text-white">
                    {hypeData.playerName} lost {hypeData.pointsLost} points
                  </p>
                  <p className="text-xl text-white/50 mt-2 font-bold">That&apos;s gotta hurt.</p>
                </>
              )}

              {hypeData.type === "streak" && (
                <>
                  <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: 3, duration: 0.3 }}>
                    <IoFlame className="text-8xl mx-auto mb-6" style={{ color: '#ffd60a' }} />
                  </motion.div>
                  <p className="text-6xl mb-4" style={{ fontFamily: 'Bungee', color: '#ffd60a' }}>
                    {hypeData.streak} STREAK!
                  </p>
                  <p className="text-2xl font-black text-white">
                    {hypeData.playerName} is on fire!
                  </p>
                </>
              )}

              {hypeData.type === "round_winner" && (
                <>
                  <motion.div animate={{ rotate: [0, -5, 5, 0] }} transition={{ repeat: 2, duration: 0.5 }}>
                    <IoTrophy className="text-8xl mx-auto mb-6" style={{ color: '#ffd60a' }} />
                  </motion.div>
                  <p className="text-5xl mb-8" style={{ fontFamily: 'Bungee' }}>
                    {hypeData.isGrandPrize ? (
                      <span style={{ color: '#ffd60a' }}>MATCH CHAMPION!</span>
                    ) : (
                      <>ROUND <span style={{ color: '#ff6341' }}>{hypeData.round}</span> WINNERS!</>
                    )}
                  </p>
                  <div className="space-y-4">
                    {hypeData.winners?.map((w: any) => (
                      <motion.div
                        key={w.position}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: w.position * 0.3 }}
                        className="flex items-center justify-center gap-6 p-4"
                        style={{
                          background: '#1a1a1a',
                          border: `2px solid ${w.position === 1 ? '#ffd60a' : w.position === 2 ? '#9ca3af' : '#ff6341'}`,
                          borderRadius: '4px',
                          boxShadow: `4px 4px 0 0 ${w.position === 1 ? '#ffd60a' : w.position === 2 ? '#9ca3af' : '#ff6341'}`,
                        }}
                      >
                        <span className={w.position <= 3 ? 'rank-badge' : 'rank-badge-gray'} style={w.position === 1 ? { background: '#ffd60a' } : w.position === 2 ? { background: '#9ca3af' } : {}}>
                          #{w.position}
                        </span>
                        <span className="text-2xl font-black text-white uppercase">{w.displayName}</span>
                        <span className="text-xl font-black" style={{ color: '#ff6341' }}>{w.points} pts</span>
                        <span className="text-lg font-black" style={{ color: '#22c55e' }}>{w.reward}</span>
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
      <div
        className="fixed bottom-0 left-0 right-0 px-8 py-4 flex items-center justify-between"
        style={{ background: '#1a1a1a', borderTop: '3px solid #ff6341', boxShadow: '0 -4px 0 0 #000' }}
      >
        <p className="text-white/50 font-bold uppercase">
          Scan the QR code to join! <span className="font-black" style={{ color: '#ff6341' }}>JAFFA</span>
        </p>
        <p className="text-white/30 text-sm font-bold uppercase">Predict. Play. Win.</p>
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

  const getRankColor = (index: number) => {
    if (index === 0) return '#ffd60a';
    if (index === 1) return '#9ca3af';
    if (index === 2) return '#ff6341';
    return '#4b5563';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {top10.map((entry, index) => (
        <motion.div
          key={entry.displayName}
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-center gap-5 px-6 py-5"
          style={{
            background: '#1a1a1a',
            border: `2px solid ${index < 3 ? getRankColor(index) : '#2a2a2a'}`,
            borderRadius: '4px',
            boxShadow: `4px 4px 0 0 ${index < 3 ? getRankColor(index) : '#333'}`,
          }}
        >
          {/* Rank */}
          <span className={index < 3 ? 'rank-badge' : 'rank-badge-gray'} style={index === 0 ? { background: '#ffd60a' } : index === 1 ? { background: '#9ca3af' } : {}}>
            {entry.rank}
          </span>

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
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-white uppercase">{entry.displayName}</span>
              {entry.currentStreak >= 3 && (
                <span className="flex items-center gap-1 text-sm font-black" style={{ color: '#ffd60a' }}>
                  <IoFlame /> {entry.currentStreak}
                </span>
              )}
            </div>
          </div>

          {/* Points */}
          <div className="text-right">
            <span className="text-3xl" style={{ fontFamily: 'Bungee', color: index === 0 ? '#ffd60a' : '#ffffff' }}>
              {(entry as any)[pointsKey]}
            </span>
            <span className="text-sm text-white/50 font-black ml-1 uppercase">pts</span>
          </div>
        </motion.div>
      ))}

      {top10.length === 0 && (
        <div className="text-center py-20 p-12" style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', borderRadius: '4px', boxShadow: '4px 4px 0 0 #ff6341' }}>
          <p className="text-2xl font-black text-white/50 uppercase">Waiting for players...</p>
          <p className="text-white/30 mt-2 font-bold">Scan the QR code to join!</p>
        </div>
      )}
    </div>
  );
}
