"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface BattingEntry {
  name: string;
  image: string | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOut: boolean;
  dismissal: string;
  fowScore: number | null;
  fowBalls: number | null;
  scoreboard: string;
  teamId: number;
  sort: number;
}

interface BowlingEntry {
  name: string;
  image: string | null;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  noballs: number;
  scoreboard: string;
  teamId: number;
  sort: number;
}

interface ScorecardProps {
  matchId: string;
  scoreVersion: number;
  matchData: any;
}

export default function Scorecard({ matchId, scoreVersion, matchData }: ScorecardProps) {
  const [batting, setBatting] = useState<BattingEntry[]>([]);
  const [bowling, setBowling] = useState<BowlingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeInnings, setActiveInnings] = useState<"S1" | "S2">("S1");

  const load = useCallback(async () => {
    try {
      setError(false);
      const data = await api.getMatchScorecard(matchId);
      setBatting(data.batting || []);
      setBowling(data.bowling || []);

      // Auto-select current innings
      const sd = matchData?.scoreData || {};
      const currInn = sd.currentInnings || matchData?.currentInnings || 1;
      setActiveInnings(currInn === 2 ? "S2" : "S1");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [matchId, matchData]);

  useEffect(() => {
    load();
  }, [load, scoreVersion]);

  const sd = matchData?.scoreData || {};
  const innings1 = sd.innings1;
  const innings2 = sd.innings2;
  const hasInnings2 = batting.some((b) => b.scoreboard === "S2") || bowling.some((b) => b.scoreboard === "S2");

  const innBatting = batting
    .filter((b) => b.scoreboard === activeInnings)
    .sort((a, b) => a.sort - b.sort);

  const innBowling = bowling
    .filter((b) => b.scoreboard === activeInnings)
    .sort((a, b) => a.sort - b.sort);

  // Fall of wickets
  const fow = innBatting
    .filter((b) => b.fowScore !== null)
    .sort((a, b) => (a.fowBalls || 0) - (b.fowBalls || 0));

  // Innings summary
  const innData = activeInnings === "S1" ? innings1 : innings2;

  if (loading) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/50 font-bold uppercase tracking-wider animate-pulse">
          Loading scorecard...
        </p>
      </div>
    );
  }

  if (error || (innBatting.length === 0 && innBowling.length === 0)) {
    return (
      <div className="py-16 text-center">
        <div
          className="inline-block text-5xl mb-4 bg-[#1a1a1a] p-4 rounded-[4px] border-2 border-[#2a2a2a]"
          style={{ boxShadow: "4px 4px 0 0 #2a2a2a" }}
        >
          📊
        </div>
        <h3
          className="text-xl text-white mb-2"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          SCORECARD NOT AVAILABLE
        </h3>
        <p className="text-sm text-white/50 max-w-[240px] mx-auto">
          Scorecard will appear once the match begins on SportsMonk.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Innings Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveInnings("S1")}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-[3px] border-2 transition-all ${
            activeInnings === "S1"
              ? "bg-[#ff6341] text-black border-black shadow-[2px_2px_0_0_#000]"
              : "bg-[#0d0d0d] text-white/50 border-[#2a2a2a]"
          }`}
        >
          1st Innings
        </button>
        {hasInnings2 && (
          <button
            onClick={() => setActiveInnings("S2")}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-[3px] border-2 transition-all ${
              activeInnings === "S2"
                ? "bg-[#ff6341] text-black border-black shadow-[2px_2px_0_0_#000]"
                : "bg-[#0d0d0d] text-white/50 border-[#2a2a2a]"
            }`}
          >
            2nd Innings
          </button>
        )}
      </div>

      {/* Batting */}
      {innBatting.length > 0 && (
        <div className="game-card p-4 overflow-hidden">
          <h4
            className="text-sm font-black uppercase tracking-wider text-[#ff6341] mb-3"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            Batting
          </h4>

          {/* Header */}
          <div className="flex items-center text-[10px] font-black uppercase tracking-wider text-white/40 mb-2 px-1">
            <span className="flex-1">Batter</span>
            <span className="w-8 text-center">R</span>
            <span className="w-8 text-center">B</span>
            <span className="w-7 text-center">4s</span>
            <span className="w-7 text-center">6s</span>
            <span className="w-10 text-center">SR</span>
          </div>

          {/* Rows */}
          <div className="space-y-0">
            {innBatting.map((b, i) => (
              <div
                key={i}
                className={`py-2 px-1 ${i < innBatting.length - 1 ? "border-b border-white/5" : ""}`}
              >
                <div className="flex items-center">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${b.isOut ? "text-white/70" : "text-white"}`}>
                      {b.name}
                    </p>
                    <p className="text-[10px] text-white/40 truncate">
                      {b.dismissal}
                    </p>
                  </div>
                  <span className={`w-8 text-center text-sm font-black ${b.isOut ? "text-white/70" : "text-white"}`}>
                    {b.runs}
                  </span>
                  <span className="w-8 text-center text-xs text-white/50">{b.balls}</span>
                  <span className="w-7 text-center text-xs text-white/50">{b.fours}</span>
                  <span className="w-7 text-center text-xs text-white/50">{b.sixes}</span>
                  <span className="w-10 text-center text-xs text-white/40">{b.strikeRate}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          {innData && (
            <div className="mt-3 pt-3 border-t-2 border-[#2a2a2a] flex justify-between items-center px-1">
              <span className="text-xs font-black uppercase text-white/60">Total</span>
              <span className="text-sm font-black text-white">
                {innData.score}/{innData.wickets} ({innData.overs} ov)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bowling */}
      {innBowling.length > 0 && (
        <div className="game-card p-4 overflow-hidden">
          <h4
            className="text-sm font-black uppercase tracking-wider text-[#ff6341] mb-3"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            Bowling
          </h4>

          {/* Header */}
          <div className="flex items-center text-[10px] font-black uppercase tracking-wider text-white/40 mb-2 px-1">
            <span className="flex-1">Bowler</span>
            <span className="w-8 text-center">O</span>
            <span className="w-7 text-center">M</span>
            <span className="w-8 text-center">R</span>
            <span className="w-7 text-center">W</span>
            <span className="w-10 text-center">Econ</span>
          </div>

          {/* Rows */}
          <div className="space-y-0">
            {innBowling.map((b, i) => (
              <div
                key={i}
                className={`flex items-center py-2 px-1 ${i < innBowling.length - 1 ? "border-b border-white/5" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white/70 truncate">{b.name}</p>
                </div>
                <span className="w-8 text-center text-xs text-white/50">{b.overs}</span>
                <span className="w-7 text-center text-xs text-white/50">{b.maidens}</span>
                <span className="w-8 text-center text-sm font-bold text-white/70">{b.runs}</span>
                <span className={`w-7 text-center text-sm font-black ${b.wickets > 0 ? "text-[#22c55e]" : "text-white/50"}`}>
                  {b.wickets}
                </span>
                <span className="w-10 text-center text-xs text-white/40">{b.economy}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fall of Wickets */}
      {fow.length > 0 && (
        <div className="game-card p-4">
          <h4
            className="text-sm font-black uppercase tracking-wider text-[#ff6341] mb-3"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            Fall of Wickets
          </h4>
          <p className="text-xs text-white/60 leading-relaxed">
            {fow.map((b, i) => (
              <span key={i}>
                {i > 0 && <span className="text-white/20"> · </span>}
                <span className="text-white/80 font-bold">{i + 1}/{b.fowScore}</span>
                <span className="text-white/40"> ({b.name.split(" ").pop()}, {b.fowBalls} ov)</span>
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
