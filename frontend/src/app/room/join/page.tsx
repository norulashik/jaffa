"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { toast } from "sonner";
import { Loader2, Shuffle } from "lucide-react";

function JoinRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dispatch } = useGame();

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const [matchIdFilter, setMatchIdFilter] = useState<string | null>(null);

  // Public rooms list
  const [showPublicRooms, setShowPublicRooms] = useState(false);
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [loadingPublicRooms, setLoadingPublicRooms] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Auto-fill code from URL param
    const codeParam = searchParams.get("code");
    if (codeParam) {
      setCode(codeParam.toUpperCase());
    }

    // If matchId is provided, auto-show public rooms for that match
    const matchIdParam = searchParams.get("matchId");
    if (matchIdParam) {
      setMatchIdFilter(matchIdParam);
      setShowPublicRooms(true);
      loadPublicRooms(matchIdParam);
    }
  }, [searchParams]);

  const handleJoinByCode = async () => {
    if (code.length !== 6) return;
    setJoining(true);
    try {
      const { room, venueId } = await api.joinRoomByCode(code);
      dispatch({ type: "SET_VENUE", venueId });
      dispatch({ type: "SET_MATCH", matchId: room.matchId });
      dispatch({ type: "SET_ROOM", roomId: room.id, roomCode: room.code });
      localStorage.setItem("jaffa_venue_id", venueId);
      localStorage.setItem("jaffa_match_id", room.matchId);
      toast.success("Joined room!");
      router.push(`/room/${room.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to join room");
    } finally {
      setJoining(false);
    }
  };

  const loadPublicRooms = async (filterMatchId?: string) => {
    setLoadingPublicRooms(true);
    try {
      const data = await api.getPublicRooms();
      let rooms = data.rooms || [];
      if (filterMatchId) {
        rooms = rooms.filter((r: any) => r.matchId === filterMatchId);
      }
      setPublicRooms(rooms);
    } catch {
      toast.error("Failed to load rooms");
    } finally {
      setLoadingPublicRooms(false);
    }
  };

  const handleJoinPublicRoom = async (roomCode: string) => {
    setJoining(true);
    try {
      const { room, venueId } = await api.joinRoomByCode(roomCode);
      dispatch({ type: "SET_VENUE", venueId });
      dispatch({ type: "SET_MATCH", matchId: room.matchId });
      dispatch({ type: "SET_ROOM", roomId: room.id, roomCode: room.code });
      localStorage.setItem("jaffa_venue_id", venueId);
      localStorage.setItem("jaffa_match_id", room.matchId);
      toast.success("Joined room!");
      router.push(`/room/${room.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to join room");
    } finally {
      setJoining(false);
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
            JOIN ROOM
          </h2>
          <p className="text-xs text-[#6b7280] mt-1">Enter a room code or join a random room</p>
        </section>

        {/* Join by Code */}
        <div className="game-card">
          <label className="text-xs text-[#6b7280] uppercase tracking-wider font-bold mb-3 block">
            Room Code
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABC123"
            maxLength={6}
            autoFocus
            className="nb-input w-full text-center text-3xl font-black tracking-[0.4em] py-4 mb-4"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          />

          <button
            onClick={handleJoinByCode}
            disabled={code.length !== 6 || joining}
            className="w-full btn-sticker btn-orange uppercase tracking-tight py-3 disabled:opacity-40"
          >
            {joining ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" /> JOINING...
              </span>
            ) : (
              "JOIN ROOM"
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-[1px] bg-[#333]" />
          <span className="text-xs text-[#6b7280] font-bold uppercase">or</span>
          <div className="flex-1 h-[1px] bg-[#333]" />
        </div>

        {/* Public Rooms */}
        <div className="game-card">
          <div className="flex items-center gap-3 mb-3">
            <Shuffle size={20} style={{ color: "#3b9eff" }} />
            <div>
              <p className="text-sm font-bold text-white">Public Rooms</p>
              <p className="text-[10px] text-[#6b7280]">Join an open room and play with others</p>
            </div>
          </div>

          {!showPublicRooms ? (
            <button
              onClick={() => {
                setShowPublicRooms(true);
                loadPublicRooms();
              }}
              className="w-full btn-sticker uppercase tracking-tight py-3"
              style={{ background: "#3b9eff", color: "#fff", border: "2px solid #3b9eff" }}
            >
              FIND A ROOM
            </button>
          ) : (
            <div className="space-y-3">
              {loadingPublicRooms && (
                <div className="flex justify-center py-4">
                  <Loader2 size={20} className="animate-spin" style={{ color: "#3b9eff" }} />
                </div>
              )}

              {!loadingPublicRooms && publicRooms.length === 0 && (
                <p className="text-xs text-[#6b7280] text-center py-4">No public rooms available right now</p>
              )}

              {publicRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => handleJoinPublicRoom(room.code)}
                  disabled={joining}
                  className="w-full flex items-center justify-between p-3 rounded transition-colors disabled:opacity-50"
                  style={{ background: "#1a1a1a", border: "1px solid #333" }}
                >
                  <div>
                    <p className="font-bold text-sm text-white text-left" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                      {room.name}
                    </p>
                    <p className="text-[10px] text-[#6b7280] text-left">
                      {(room.match?.team1Short || "T1")?.toUpperCase()} vs {(room.match?.team2Short || "T2")?.toUpperCase()} &bull; {room.memberCount}/{room.maxPlayers} players
                    </p>
                  </div>
                  <span className={room.match?.status === "live" ? "live-badge" : "info-pill"}>
                    {room.match?.status === "live" ? "LIVE" : "WAITING"}
                  </span>
                </button>
              ))}

              <button
                onClick={() => setShowPublicRooms(false)}
                className="w-full btn-gray py-2 text-xs uppercase"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* No public rooms fallback */}
        {matchIdFilter && publicRooms.length === 0 && !loadingPublicRooms && showPublicRooms && (
          <div className="game-card text-center">
            <p className="text-sm text-[#6b7280] mb-3">No public rooms available for this match.</p>
            <p className="text-xs text-[#6b7280] mb-4">Create your own room and invite friends!</p>
            <button
              onClick={() => router.push(`/room/create?matchId=${matchIdFilter}`)}
              className="w-full btn-sticker uppercase tracking-tight py-3"
              style={{ background: "#3b9eff", color: "#fff", border: "2px solid #3b9eff" }}
            >
              CREATE ROOM
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default function JoinRoom() {
  return (
    <Suspense fallback={
      <div className="bg-[#0d0d0d] text-white min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 animate-spin rounded-[2px]" style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }} />
      </div>
    }>
      <JoinRoomContent />
    </Suspense>
  );
}
