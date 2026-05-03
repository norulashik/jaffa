"use client";

// 5v5 play page. The user sees ONLY their 3 role questions (server-enforced).
// Submit-on-pick (each question saves immediately). Locks at match start —
// from then on the user just sees their selections until results arrive.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Lock, Trophy } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { connectSocket, joinSocketRoom, leaveSocketRoom } from "@/lib/socket";
import {
  fiveVsFiveApi,
  ROLE_VIEW,
  type FiveVsFiveQuestionsDto,
  type FiveVsFiveRoomDto,
  type RoleNumber,
} from "@/lib/fiveVsFiveApi";

export default function FiveVsFivePlay() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId as string;
  const [room, setRoom] = useState<FiveVsFiveRoomDto | null>(null);
  const [bundle, setBundle] = useState<FiveVsFiveQuestionsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r, q] = await Promise.all([
        fiveVsFiveApi.getRoom(roomId),
        fiveVsFiveApi.getQuestions(roomId),
      ]);
      setRoom(r);
      setBundle(q);
      // Lifecycle navigation guards.
      if (r.status === "waiting") router.push(`/5v5/${roomId}`);
      if (r.status === "completed" || r.status === "voided") {
        router.push(`/5v5/${roomId}/results`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [roomId, router]);

  useEffect(() => { refresh(); }, [refresh]);

  // Socket: refresh on submission events (so users see "X just locked role 3"
  // updates) + auto-route on resolve/void.
  useEffect(() => {
    if (!roomId) return;
    const socket = connectSocket();
    const channel = `5v5:${roomId}`;
    joinSocketRoom(channel);
    const onAnswer = () => refresh();
    const onResolved = () => router.push(`/5v5/${roomId}/results`);
    const onVoided = () => router.push(`/5v5/${roomId}/results`);
    socket.on("5v5.answerSubmitted", onAnswer);
    socket.on("5v5.resolved", onResolved);
    socket.on("5v5.voided", onVoided);
    return () => {
      leaveSocketRoom(channel);
      socket.off("5v5.answerSubmitted", onAnswer);
      socket.off("5v5.resolved", onResolved);
      socket.off("5v5.voided", onVoided);
    };
  }, [roomId, refresh, router]);

  const matchStarted = useMemo(() => {
    const t = room?.match?.startTime ? new Date(room.match.startTime).getTime() : 0;
    return t > 0 && t <= Date.now();
  }, [room]);

  const submit = async (predictionId: string, optionKey: string) => {
    if (matchStarted) {
      toast.error("Match has started — answers locked");
      return;
    }
    setSubmitting(predictionId);
    try {
      await fiveVsFiveApi.submitAnswer(roomId, predictionId, optionKey);
      // Optimistic update so the UI flips before the socket round-trips back.
      setBundle((prev) =>
        prev ? {
          ...prev,
          questions: prev.questions.map((q) =>
            q.id === predictionId
              ? { ...q, userAnswer: { selectedOption: optionKey, isCorrect: null, pointsEarned: 0 } }
              : q,
          ),
        } : prev,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0d0d0d] text-white min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#6b7280] w-7 h-7" />
      </div>
    );
  }
  if (!room || !bundle) return null;

  const view = ROLE_VIEW[bundle.slot.role as RoleNumber];
  const t1Short = room.match?.team1Short || room.match?.team1 || "Team 1";
  const t2Short = room.match?.team2Short || room.match?.team2 || "Team 2";
  const myTeamShort = bundle.slot.teamSide === "team1" ? t1Short : t2Short;
  const answered = bundle.questions.filter((q) => q.userAnswer).length;

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 max-w-2xl mx-auto space-y-5">
        {/* Header card — role + team identity */}
        <section
          className="game-card p-4 flex items-center gap-3"
          style={{ borderColor: view.color, boxShadow: `4px 4px 0 0 ${view.color}` }}
        >
          <span className="text-3xl leading-none">{view.emoji}</span>
          <div className="flex-1 min-w-0">
            <div
              className="text-base font-black uppercase tracking-wide"
              style={{ fontFamily: "'Bungee', cursive", color: view.color }}
            >
              {view.title}
            </div>
            <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider">
              {view.subtitle} · Side: <span className="text-white">{myTeamShort}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#9ca3af] uppercase tracking-widest font-bold">
              Locked
            </div>
            <div
              className="text-xl font-black"
              style={{ fontFamily: "'Bungee', cursive", color: view.color }}
            >
              {answered}/{bundle.questions.length}
            </div>
          </div>
        </section>

        {matchStarted && (
          <div className="game-card p-3 flex items-center gap-2 text-xs" style={{ borderColor: "#3a3a3a" }}>
            <Lock className="w-4 h-4 text-[#9ca3af]" />
            <span className="text-[#9ca3af]">
              Match started — answers locked. Hang tight for the result.
            </span>
          </div>
        )}

        {/* Questions */}
        <section className="space-y-4">
          {bundle.questions.map((q, i) => {
            const isWildcard = q.options.some((o) => o.points >= 50);
            return (
              <div
                key={q.id}
                className="game-card p-4 space-y-3"
                style={isWildcard ? { borderColor: "#ffd60a", boxShadow: "4px 4px 0 0 #ffd60a" } : {}}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[#9ca3af]">
                    Q{i + 1}{isWildcard ? " · WILDCARD ✨" : ""}
                  </div>
                  {q.userAnswer && (
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-[#22c55e]">
                      <Lock className="w-3 h-3" /> Locked
                    </div>
                  )}
                </div>
                <p className="text-white font-bold text-sm">{q.question}</p>
                <div className="space-y-2">
                  {q.options.map((opt) => {
                    const picked = q.userAnswer?.selectedOption === opt.key;
                    const busy = submitting === q.id;
                    return (
                      <motion.button
                        key={opt.key}
                        whileTap={{ scale: 0.98 }}
                        disabled={busy || matchStarted}
                        onClick={() => submit(q.id, opt.key)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-[3px] transition-colors disabled:opacity-50"
                        style={
                          picked
                            ? {
                                background: isWildcard ? "rgba(255,214,10,0.12)" : "rgba(255,99,65,0.12)",
                                border: `2px solid ${isWildcard ? "#ffd60a" : "#ff6341"}`,
                                boxShadow: `3px 3px 0 0 ${isWildcard ? "#ffd60a" : "#ff6341"}`,
                              }
                            : { background: "#0d0d0d", border: "2px solid #2a2a2a" }
                        }
                      >
                        <span className="text-white font-bold text-sm">{opt.label}</span>
                        <span
                          className="text-[10px] font-black uppercase tracking-wider"
                          style={{ color: isWildcard ? "#ffd60a" : "#9ca3af" }}
                        >
                          {opt.points} pts
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* Footer hint */}
        <section className="text-center text-[11px] text-[#6b7280]">
          {answered === bundle.questions.length ? (
            <span className="text-[#22c55e] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3" /> All locked. Match end → results.
            </span>
          ) : (
            <>Lock all 3 to maximise your role-vs-role total.</>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
