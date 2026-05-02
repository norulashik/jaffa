"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import RoomLeaderboard from "@/components/RoomLeaderboard";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { connectSocket, joinSocketRoom, leaveSocketRoom, joinVenueMatch } from "@/lib/socket";
import { toast } from "sonner";
import { Copy, Share2, Users, Trophy, LogOut, Loader2, Crown } from "lucide-react";

interface RoomMember {
  userId: string;
  displayName: string;
  avatarConfig?: any;
  joinedAt: string;
}

interface RoomData {
  id: string;
  name: string;
  code: string;
  hostUserId: string;
  matchId: string;
  isSeasonRoom?: boolean;
  isPublic: boolean;
  maxPlayers: number;
  status: string;
  members: RoomMember[];
  memberCount: number;
  match?: {
    id: string;
    team1: string;
    team2: string;
    team1Short?: string;
    team2Short?: string;
    status: string;
    startTime?: string;
    currentPhase?: string;
    scoreData?: any;
  };
  host?: {
    id: string;
    displayName: string;
  };
}

interface MatchSummary {
  id: string;
  team1: string;
  team2: string;
  team1Short?: string;
  team2Short?: string;
  status: string;
  startTime?: string;
}

export default function RoomLobby() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  const { state, dispatch } = useGame();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [enteringMatch, setEnteringMatch] = useState(false);
  const [activeTab, setActiveTab] = useState<"members" | "leaderboard">("members");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [currentSeasonMatch, setCurrentSeasonMatch] = useState<MatchSummary | null>(null);

  const loadRoom = useCallback(async () => {
    try {
      const data = await api.getRoom(roomId);
      setRoom(data.room);
      setVenueId(data.venueId);
      setCurrentSeasonMatch(data.currentSeasonMatch || null);
    } catch (err: any) {
      toast.error(err.message || "Failed to load room");
      router.push("/lobby");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadRoom();
  }, [loadRoom]);

  // Socket setup for live member updates
  useEffect(() => {
    if (!roomId) return;

    const socket = connectSocket();
    joinSocketRoom(roomId);

    socket.on("memberJoined", (data: { userId: string; displayName: string; avatarConfig?: any; memberCount: number }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const alreadyMember = prev.members.some((m) => m.userId === data.userId);
        if (alreadyMember) return { ...prev, memberCount: data.memberCount };
        return {
          ...prev,
          memberCount: data.memberCount,
          members: [...prev.members, { userId: data.userId, displayName: data.displayName, avatarConfig: data.avatarConfig, joinedAt: new Date().toISOString() }],
        };
      });
    });

    socket.on("memberLeft", (data: { userId: string; memberCount: number }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          memberCount: data.memberCount,
          members: prev.members.filter((m) => m.userId !== data.userId),
        };
      });
    });

    return () => {
      leaveSocketRoom(roomId);
      socket.off("memberJoined");
      socket.off("memberLeft");
    };
  }, [roomId]);

  const handleShare = async () => {
    if (!room) return;
    const shareUrl = `${window.location.origin}/room/join?code=${room.code}`;
    const shareText = `Join my JAFFA room "${room.name}" for ${room.match?.team1Short || "Team 1"} vs ${room.match?.team2Short || "Team 2"}! Code: ${room.code}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: `JAFFA Room: ${room.name}`, text: shareText, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      toast.success("Room link copied!");
    } catch {
      toast.error("Could not share");
    }
  };

  const handleCopyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      toast.success("Code copied!");
    } catch {
      toast.error("Could not copy");
    }
  };

  const handlePlayNow = async () => {
    if (!room || !venueId) return;
    const targetMatchId = room.isSeasonRoom ? currentSeasonMatch?.id : room.matchId;
    if (!targetMatchId) {
      toast.error("No active IPL match is available for this season room");
      return;
    }
    setEnteringMatch(true);
    try {
      await api.enterRoomMatch(room.id, targetMatchId);
    dispatch({ type: "SET_VENUE", venueId });
    dispatch({ type: "SET_MATCH", matchId: targetMatchId });
    dispatch({ type: "SET_ROOM", roomId: room.id, roomCode: room.code });
    localStorage.setItem("jaffa_venue_id", venueId);
    localStorage.setItem("jaffa_match_id", targetMatchId);

    // Join the venue match socket room for live events
    joinVenueMatch(venueId, targetMatchId);

      router.push(`/match/${targetMatchId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to enter match");
    } finally {
      setEnteringMatch(false);
    }
  };

  const handleLeave = async () => {
    if (!room) return;
    setLeaving(true);
    try {
      await api.leaveRoom(room.id);
      dispatch({ type: "CLEAR_ROOM" });
      toast.success("Left room");
      router.push("/lobby");
    } catch (err: any) {
      toast.error(err.message || "Failed to leave room");
    } finally {
      setLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0d0d0d] text-white min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 animate-spin rounded-[2px]" style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!room) return null;

  const isHost = state.userId === room.hostUserId;
  const displayMatch = room.isSeasonRoom ? currentSeasonMatch : room.match;
  const matchIsLive = displayMatch?.status === "live";
  const matchIsUpcoming = displayMatch?.status === "upcoming";
  const startDate = displayMatch?.startTime ? new Date(displayMatch.startTime) : null;
  const canPlay = matchIsLive || (matchIsUpcoming && startDate && startDate.getTime() - Date.now() <= 45 * 60 * 1000);

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 space-y-5 max-w-2xl mx-auto">
        {/* Room Header */}
        <div className="game-card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2
                className="text-xl font-bold text-white uppercase"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                {room.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={room.status === "active" ? "live-badge" : "info-pill"}>
                  {room.status === "active" ? "LIVE" : room.status.toUpperCase()}
                </span>
                {room.isPublic && <span className="info-pill">PUBLIC</span>}
                {room.isSeasonRoom && <span className="info-pill">SEASON</span>}
              </div>
            </div>
            {isHost && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase" style={{ color: "#ffd60a" }}>
                <Crown size={14} /> Host
              </span>
            )}
          </div>

          {/* Match Info */}
          {displayMatch && (
            <div className="flex items-center justify-center gap-4 py-3" style={{ borderTop: "1px solid #333" }}>
              <span className="font-bold text-sm" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                {(displayMatch.team1Short || displayMatch.team1?.slice(0, 3))?.toUpperCase()}
              </span>
              <span className="text-xs font-bold" style={{ color: "#ff6341" }}>VS</span>
              <span className="font-bold text-sm" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                {(displayMatch.team2Short || displayMatch.team2?.slice(0, 3))?.toUpperCase()}
              </span>
              {startDate && !matchIsLive && (
                <span className="text-[10px] text-[#6b7280] ml-2">
                  {startDate.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Room Code - Prominent */}
        <div className="game-card text-center">
          <p className="text-xs text-[#6b7280] uppercase tracking-wider font-bold mb-2">Room Code</p>
          <div
            className="text-4xl font-black tracking-[0.5em] mb-4"
            style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}
          >
            {room.code}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCopyCode}
              className="flex-1 btn-gray py-2.5 flex items-center justify-center gap-2 text-sm font-bold uppercase"
            >
              <Copy size={16} /> Copy Code
            </button>
            <button
              onClick={handleShare}
              className="flex-1 btn-sticker btn-orange py-2.5 flex items-center justify-center gap-2 text-sm font-bold uppercase"
            >
              <Share2 size={16} /> Share
            </button>
          </div>
        </div>

        {/* Play Now Button */}
        {canPlay && (
          <motion.button
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={handlePlayNow}
            disabled={enteringMatch}
            className="w-full btn-sticker btn-orange uppercase tracking-tight py-4 text-lg font-bold"
            style={{ boxShadow: "0 4px 20px rgba(255,99,65,0.4)" }}
          >
            {enteringMatch ? "ENTERING..." : room.isSeasonRoom ? "ENTER THIS MATCH" : "PLAY NOW"}
          </motion.button>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded" style={{ background: "#1a1a1a" }}>
          <button
            onClick={() => setActiveTab("members")}
            className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5"
            style={{
              background: activeTab === "members" ? "#ff6341" : "transparent",
              color: activeTab === "members" ? "#fff" : "#6b7280",
            }}
          >
            <Users size={14} /> Members ({room.memberCount}/{room.maxPlayers})
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5"
            style={{
              background: activeTab === "leaderboard" ? "#ff6341" : "transparent",
              color: activeTab === "leaderboard" ? "#fff" : "#6b7280",
            }}
          >
            <Trophy size={14} /> Leaderboard
          </button>
        </div>

        {/* Members Tab */}
        {activeTab === "members" && (
          <div className="space-y-2">
            {room.members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between px-4 py-3"
                style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: "#ff6341", color: "#fff" }}
                  >
                    {member.displayName?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="font-bold text-sm text-white">{member.displayName}</span>
                </div>
                {member.userId === room.hostUserId && (
                  <Crown size={14} style={{ color: "#ffd60a" }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard Tab */}
        {activeTab === "leaderboard" && (
          <RoomLeaderboard roomId={roomId} isSeasonRoom={Boolean(room.isSeasonRoom)} />
        )}

        {/* Leave Room */}
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold uppercase text-[#6b7280] hover:text-red-400 transition-colors"
        >
          <LogOut size={16} /> Leave Room
        </button>
      </main>

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="game-card w-full max-w-sm"
          >
            <h3
              className="text-lg font-bold text-center mb-2 text-white uppercase"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              LEAVE ROOM?
            </h3>
            <p className="text-[#6b7280] text-xs text-center mb-6">
              {isHost ? "You are the host. If you leave, another member will become the host." : "Your points will be kept but you won't see the room leaderboard."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 btn-gray py-3 font-bold">
                STAY
              </button>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex-1 py-3 font-bold rounded text-white"
                style={{ background: "#dc2626", border: "2px solid #dc2626" }}
              >
                {leaving ? "LEAVING..." : "LEAVE"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
