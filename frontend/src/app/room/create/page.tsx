"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Short?: string;
  team2Short?: string;
  team1Img?: string;
  team2Img?: string;
  status: string;
  startTime?: string;
}

function CreateRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dispatch } = useGame();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSeasonRoom, setIsSeasonRoom] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(10);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadMatches();
    // Pre-select match from query param
    const matchIdParam = searchParams.get("matchId");
    if (matchIdParam) setSelectedMatch(matchIdParam);
  }, []);

  const loadMatches = async () => {
    try {
      const data = await api.getMatches();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const available = (data || []).filter((m: Match) => {
        if (m.status !== "live" && m.status !== "upcoming") return false;
        if (!m.startTime) return m.status === "live";
        const matchDate = new Date(m.startTime);
        return matchDate >= today && matchDate < tomorrow;
      });
      setMatches(available);
    } catch {
      toast.error("Failed to load matches");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if ((!selectedMatch && !isSeasonRoom) || !roomName.trim()) return;
    setCreating(true);
    try {
      let matchId = selectedMatch;

      // Auto-import Sportsmonk matches
      if (matchId && matchId.startsWith("sportsmonk_")) {
        const fixtureId = matchId.replace("sportsmonk_", "");
        const result = await api.importMatch(fixtureId);
        matchId = result.match.id;
      }

      const { room, venueId } = await api.createRoom(matchId || null, roomName.trim(), isPublic, maxPlayers, isSeasonRoom);
      dispatch({ type: "SET_VENUE", venueId });
      dispatch({ type: "SET_MATCH", matchId: room.matchId });
      dispatch({ type: "SET_ROOM", roomId: room.id, roomCode: room.code });
      localStorage.setItem("jaffa_venue_id", venueId);
      localStorage.setItem("jaffa_match_id", room.matchId);
      toast.success("Room created!");
      router.push(`/room/${room.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create room");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 space-y-6 max-w-2xl mx-auto">
        <section className="mb-4">
          <h2
            className="text-2xl font-bold tracking-tight uppercase text-white"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            CREATE ROOM
          </h2>
          <p className="text-xs text-[#6b7280] mt-1">Play with your friends in a private room</p>
        </section>

        {/* Room Name */}
        <div className="game-card">
          <label className="text-xs text-[#6b7280] uppercase tracking-wider font-bold mb-2 block">
            Room Name
          </label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value.slice(0, 50))}
            placeholder="e.g. Virat's Den"
            className="nb-input w-full text-lg py-3"
            maxLength={50}
          />
          <p className="text-[10px] text-[#6b7280] mt-1 text-right">{roomName.length}/50</p>
        </div>

        {/* Room Settings */}
        <div className="game-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Public Room</p>
              <p className="text-[10px] text-[#6b7280]">Anyone can join via &quot;Join Random&quot;</p>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              className="w-12 h-7 rounded-full transition-colors relative"
              style={{ background: isPublic ? "#ff6341" : "#333" }}
            >
              <div
                className="w-5 h-5 rounded-full bg-white absolute top-1 transition-all"
                style={{ left: isPublic ? "26px" : "4px" }}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Season Room</p>
              <p className="text-[10px] text-[#6b7280]">Keep this room code and member list across IPL matches</p>
            </div>
            <button
              onClick={() => setIsSeasonRoom(!isSeasonRoom)}
              className="w-12 h-7 rounded-full transition-colors relative"
              style={{ background: isSeasonRoom ? "#3b9eff" : "#333" }}
            >
              <div
                className="w-5 h-5 rounded-full bg-white absolute top-1 transition-all"
                style={{ left: isSeasonRoom ? "26px" : "4px" }}
              />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-white">Max Players</p>
              <span
                className="text-lg font-bold"
                style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}
              >
                {maxPlayers}
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full accent-[#ff6341]"
            />
            <div className="flex justify-between text-[10px] text-[#6b7280]">
              <span>2</span>
              <span>20</span>
            </div>
          </div>
        </div>

        {/* Select Match */}
        <div>
          <h3
            className="text-lg font-bold text-white mb-4 pl-3 uppercase"
            style={{
              fontFamily: "'Bungee', 'Impact', cursive",
              borderLeft: "4px solid #ff6341",
            }}
          >
            SELECT MATCH
          </h3>

          {loading && (
            <div className="flex justify-center py-8">
              <div
                className="w-8 h-8 animate-spin rounded-[2px]"
                style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }}
              />
            </div>
          )}

          {!loading && matches.length === 0 && (
            <div className="game-card text-center">
              <p className="text-sm text-[#6b7280]">No matches available right now</p>
              {isSeasonRoom && (
                <p className="text-xs text-[#3b9eff] mt-2">Season Rooms can still be created and will attach to the next IPL match later.</p>
              )}
            </div>
          )}

          {matches.map((match) => {
            const isSelected = selectedMatch === match.id;
            const startDate = match.startTime ? new Date(match.startTime) : null;
            const timeStr = startDate
              ? startDate.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "";

            return (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedMatch(match.id)}
                className="game-card mb-3 cursor-pointer transition-all"
                style={{
                  border: isSelected ? "2px solid #ff6341" : "2px solid #333",
                  boxShadow: isSelected ? "0 0 12px rgba(255,99,65,0.3)" : "none",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 flex items-center justify-center p-1 overflow-hidden"
                      style={{ border: "2px solid #333", borderRadius: "4px", background: "#1a1a1a" }}
                    >
                      {match.team1Img ? (
                        <img src={match.team1Img} alt={match.team1Short} className="w-full h-full object-contain" />
                      ) : (
                        <span className="font-bold text-[10px]" style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}>
                          {match.team1Short || match.team1?.slice(0, 3)}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-sm" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                      {(match.team1Short || match.team1?.slice(0, 3))?.toUpperCase()}
                    </span>
                  </div>

                  <span className="text-xs font-bold" style={{ color: "#ff6341" }}>VS</span>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                      {(match.team2Short || match.team2?.slice(0, 3))?.toUpperCase()}
                    </span>
                    <div
                      className="w-10 h-10 flex items-center justify-center p-1 overflow-hidden"
                      style={{ border: "2px solid #333", borderRadius: "4px", background: "#1a1a1a" }}
                    >
                      {match.team2Img ? (
                        <img src={match.team2Img} alt={match.team2Short} className="w-full h-full object-contain" />
                      ) : (
                        <span className="font-bold text-[10px]" style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#3b9eff" }}>
                          {match.team2Short || match.team2?.slice(0, 3)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span className={match.status === "live" ? "live-badge" : "info-pill"}>
                    {match.status === "live" ? "LIVE" : timeStr || "UPCOMING"}
                  </span>
                  {isSelected && (
                    <span className="text-xs font-bold" style={{ color: "#22c55e" }}>SELECTED</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Create Button */}
        <button
          onClick={handleCreate}
          disabled={((!selectedMatch && !isSeasonRoom) || !roomName.trim() || creating)}
          className="w-full btn-sticker btn-orange uppercase tracking-tight py-4 text-lg disabled:opacity-40"
        >
          {creating ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={20} className="animate-spin" /> CREATING...
            </span>
          ) : (
            "CREATE ROOM"
          )}
        </button>
      </main>

      <BottomNav />
    </div>
  );
}

export default function CreateRoom() {
  return (
    <Suspense fallback={
      <div className="bg-[#0d0d0d] text-white min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 animate-spin rounded-[2px]" style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }} />
      </div>
    }>
      <CreateRoomContent />
    </Suspense>
  );
}
