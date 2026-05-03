"use client";

// 5v5 room lobby. Three states the user can be in:
//   1. No slot yet → pick a team side (auto-routed if one side is full)
//      then pick a role (locked roles greyed out).
//   2. Has a slot, room not full → see the 5-a-side board, copy the code,
//      wait for others.
//   3. Room full → host sees "START 5V5" button; everyone else sees a
//      "Waiting for host" hint. Once started, all clients navigate to /play.
//
// After `5v5.resolved` socket → navigate to /results.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, LogOut, Lock, Loader2, Play, Crown } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { connectSocket, joinSocketRoom, leaveSocketRoom } from "@/lib/socket";
import {
  fiveVsFiveApi,
  ROLE_VIEW,
  type FiveVsFiveRoomDto,
  type RoleNumber,
  type TeamSide,
} from "@/lib/fiveVsFiveApi";

const ROLES: RoleNumber[] = [1, 2, 3, 4, 5];

export default function FiveVsFiveLobby() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId as string;
  const [room, setRoom] = useState<FiveVsFiveRoomDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [pendingTeam, setPendingTeam] = useState<TeamSide | null>(null);
  const [busy, setBusy] = useState(false);

  // Pull current user id from cached jaffa_user blob — no extra network call
  // needed since the regular /lobby flow already populates it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("jaffa_token")) {
      router.replace("/login");
      return;
    }
    try {
      const u = JSON.parse(localStorage.getItem("jaffa_user") || "{}");
      if (u?.id) setMeId(u.id);
    } catch {}
  }, [router]);

  const refresh = useCallback(async () => {
    try {
      const r = await fiveVsFiveApi.getRoom(roomId);
      setRoom(r);
      // Auto-route on lifecycle transitions.
      if (r.status === "active") router.push(`/5v5/${roomId}/play`);
      if (r.status === "completed" || r.status === "voided") router.push(`/5v5/${roomId}/results`);
    } catch (err: any) {
      toast.error(err.message || "Failed to load room");
    } finally {
      setLoading(false);
    }
  }, [roomId, router]);

  useEffect(() => { refresh(); }, [refresh]);

  // Socket subscription — refresh on any 5v5 event for this room.
  useEffect(() => {
    if (!roomId) return;
    const socket = connectSocket();
    const channel = `5v5:${roomId}`;
    joinSocketRoom(channel);
    const onSlot = () => refresh();
    const onStarted = () => router.push(`/5v5/${roomId}/play`);
    const onResolved = () => router.push(`/5v5/${roomId}/results`);
    const onVoided = () => {
      toast("Room voided — not enough players by match start");
      router.push(`/5v5/${roomId}/results`);
    };
    socket.on("5v5.slotClaimed", onSlot);
    socket.on("5v5.slotReleased", onSlot);
    socket.on("5v5.started", onStarted);
    socket.on("5v5.resolved", onResolved);
    socket.on("5v5.voided", onVoided);
    return () => {
      leaveSocketRoom(channel);
      socket.off("5v5.slotClaimed", onSlot);
      socket.off("5v5.slotReleased", onSlot);
      socket.off("5v5.started", onStarted);
      socket.off("5v5.resolved", onResolved);
      socket.off("5v5.voided", onVoided);
    };
  }, [roomId, refresh, router]);

  const mySlot = useMemo(
    () => room?.slots.find((s) => s.userId === meId) || null,
    [room, meId],
  );
  const isHost = !!room && meId === room.hostUserId;
  const team1Slots = useMemo(
    () => room?.slots.filter((s) => s.teamSide === "team1") || [],
    [room],
  );
  const team2Slots = useMemo(
    () => room?.slots.filter((s) => s.teamSide === "team2") || [],
    [room],
  );
  const team1Full = team1Slots.length >= 5;
  const team2Full = team2Slots.length >= 5;
  const allFull = (room?.slotsFilled || 0) >= (room?.slotsTotal || 10);

  const t1Short = room?.match?.team1Short || room?.match?.team1 || "Team 1";
  const t2Short = room?.match?.team2Short || room?.match?.team2 || "Team 2";

  const claim = async (teamSide: TeamSide, role: number) => {
    setBusy(true);
    try {
      const r = await fiveVsFiveApi.claimSlot(roomId, teamSide, role);
      setRoom(r);
      setPendingTeam(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to claim role");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!confirm("Leave this 5v5 room? Your slot opens up for someone else.")) return;
    setBusy(true);
    try {
      await fiveVsFiveApi.leaveRoom(roomId);
      router.push("/5v5");
    } catch (err: any) {
      toast.error(err.message || "Failed to leave");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      await fiveVsFiveApi.startRoom(roomId);
      // The 5v5.started socket will push us to /play.
    } catch (err: any) {
      toast.error(err.message || "Failed to start");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0d0d0d] text-white min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#6b7280] w-7 h-7" />
      </div>
    );
  }
  if (!room) return null;

  // Effective team to claim: pendingTeam OR auto-balanced if one side is full.
  const effectiveTeam: TeamSide | null =
    mySlot ? null
    : team1Full && team2Full ? null
    : team1Full ? "team2"
    : team2Full ? "team1"
    : pendingTeam;

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 max-w-2xl mx-auto space-y-5">
        {/* Top: code + match label */}
        <section className="game-card p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#9ca3af] font-bold mb-1">
              Match
            </div>
            <div className="text-white font-bold" style={{ fontFamily: "'Bungee', cursive" }}>
              {t1Short} vs {t2Short}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-[#9ca3af] font-bold mb-1">
              Code
            </div>
            <button
              onClick={copyCode}
              className="font-mono text-xl tracking-[0.3em] text-[#ff6341] flex items-center gap-1.5"
              style={{ fontFamily: "'Bungee', cursive" }}
            >
              {room.code}
              <Copy className="w-3.5 h-3.5 text-[#9ca3af]" />
            </button>
          </div>
        </section>

        {/* No slot yet → claim flow */}
        {!mySlot && (
          <section>
            {!effectiveTeam ? (
              <div className="game-card p-5">
                <h3 className="text-base font-black uppercase mb-3" style={{ fontFamily: "'Bungee', cursive" }}>
                  Pick your side
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <TeamPickButton
                    teamShort={t1Short}
                    filled={team1Slots.length}
                    full={team1Full}
                    onClick={() => setPendingTeam("team1")}
                  />
                  <TeamPickButton
                    teamShort={t2Short}
                    filled={team2Slots.length}
                    full={team2Full}
                    onClick={() => setPendingTeam("team2")}
                  />
                </div>
              </div>
            ) : (
              <div className="game-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-black uppercase" style={{ fontFamily: "'Bungee', cursive" }}>
                    Pick your role · {effectiveTeam === "team1" ? t1Short : t2Short}
                  </h3>
                  {pendingTeam && (team1Full ? !team2Full : !team1Full) && (
                    <button
                      type="button"
                      onClick={() => setPendingTeam(null)}
                      className="text-[10px] text-[#9ca3af] uppercase font-bold hover:text-white"
                    >
                      Switch side
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {ROLES.map((r) => {
                    const taken = (effectiveTeam === "team1" ? team1Slots : team2Slots)
                      .find((s) => s.role === r);
                    const view = ROLE_VIEW[r];
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={!!taken || busy}
                        onClick={() => claim(effectiveTeam, r)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-[3px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        style={{
                          background: "#0d0d0d",
                          border: `2px solid ${taken ? "#2a2a2a" : view.color}`,
                          boxShadow: taken ? "none" : `3px 3px 0 0 ${view.color}`,
                        }}
                      >
                        <span className="text-2xl leading-none">{view.emoji}</span>
                        <div className="flex-1 text-left">
                          <div className="font-black uppercase text-sm" style={{ fontFamily: "'Bungee', cursive", color: taken ? "#6b7280" : view.color }}>
                            {view.title}
                          </div>
                          <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider">
                            {view.subtitle}
                          </div>
                        </div>
                        {taken ? (
                          <Lock className="w-4 h-4 text-[#6b7280]" />
                        ) : (
                          <span className="text-[10px] font-black text-[#9ca3af] uppercase">
                            Tap
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* The 5-a-side board */}
        <section>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
            <TeamColumn teamShort={t1Short} slots={team1Slots} youAre={mySlot?.id} accent="#ff6341" />
            <div className="flex items-center justify-center">
              <span
                className="text-2xl text-[#ff6341]"
                style={{ fontFamily: "'Bungee', cursive" }}
              >
                VS
              </span>
            </div>
            <TeamColumn teamShort={t2Short} slots={team2Slots} youAre={mySlot?.id} accent="#3b9eff" />
          </div>
        </section>

        {/* Status / start CTA */}
        <section className="game-card p-4 flex items-center justify-between gap-3">
          <div className="text-xs">
            {allFull ? (
              <span className="text-[#22c55e] font-black uppercase">Ready! All 10 in.</span>
            ) : (
              <span className="text-[#9ca3af]">
                Waiting for{" "}
                <span className="text-white font-bold">{(room.slotsTotal || 10) - room.slotsFilled}</span>{" "}
                more
              </span>
            )}
          </div>
          {allFull && isHost && (
            <button
              onClick={start}
              disabled={busy}
              className="btn-sticker btn-orange px-6 py-2.5 text-sm flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> Start 5v5
            </button>
          )}
          {allFull && !isHost && (
            <span className="text-[10px] text-[#6b7280] uppercase tracking-wider flex items-center gap-1">
              <Crown className="w-3 h-3 text-[#ffd60a]" /> Waiting for host
            </span>
          )}
        </section>

        {/* Leave room — only while waiting */}
        {mySlot && room.status === "waiting" && (
          <button
            onClick={leave}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase text-[#6b7280] hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Leave room
          </button>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function TeamPickButton({
  teamShort,
  filled,
  full,
  onClick,
}: {
  teamShort: string;
  filled: number;
  full: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={full}
      onClick={onClick}
      className="px-4 py-5 rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: "#0d0d0d",
        border: `2px solid ${full ? "#2a2a2a" : "#ff6341"}`,
        boxShadow: full ? "none" : "4px 4px 0 0 #ff6341",
      }}
    >
      <div className="text-base font-black uppercase mb-1" style={{ fontFamily: "'Bungee', cursive" }}>
        {teamShort}
      </div>
      <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider">
        {filled}/5 {full ? "FULL" : "open"}
      </div>
    </motion.button>
  );
}

function TeamColumn({
  teamShort,
  slots,
  youAre,
  accent,
}: {
  teamShort: string;
  slots: { id: string; role: number; user: { displayName: string } | null }[];
  youAre: string | undefined;
  accent: string;
}) {
  return (
    <div
      className="rounded-[4px] p-3 space-y-2"
      style={{ background: "#1a1a1a", border: `2px solid ${accent}33` }}
    >
      <div
        className="text-center font-black uppercase text-sm pb-2 border-b border-[#2a2a2a]"
        style={{ fontFamily: "'Bungee', cursive", color: accent }}
      >
        {teamShort}
      </div>
      {[1, 2, 3, 4, 5].map((role) => {
        const slot = slots.find((s) => s.role === role);
        const view = ROLE_VIEW[role as RoleNumber];
        const isMe = slot?.id === youAre;
        return (
          <div
            key={role}
            className="rounded px-2 py-2 min-h-[58px] flex items-center gap-2"
            style={{
              background: slot ? "#0d0d0d" : "#161616",
              border: `1px dashed ${slot ? view.color : "#2a2a2a"}`,
              borderStyle: slot ? "solid" : "dashed",
            }}
          >
            <span className="text-lg leading-none">{view.emoji}</span>
            <div className="flex-1 min-w-0">
              <div
                className="text-[10px] font-black uppercase tracking-wider truncate"
                style={{ color: slot ? view.color : "#3a3a3a" }}
              >
                {view.title}
              </div>
              <div className="text-[11px] text-white truncate font-bold">
                {slot?.user?.displayName || (
                  <span className="text-[#3a3a3a] italic font-normal">Awaiting…</span>
                )}
                {isMe && <span className="text-[#ffd60a] ml-1">(you)</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
