"use client";

// 5v5 landing page. Shows:
//   - User's currently-open 5v5 rooms (Resume CTA per row)
//   - Match-of-the-day picker + Create Room button
//   - Code input + Join Room button
// One-room-per-match is enforced server-side (returns 409 with the existing
// roomId so we can route the user back without losing context).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { LogIn, Plus, Loader2, Users, Swords } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";
import { fiveVsFiveApi, type FiveVsFiveRoomDto } from "@/lib/fiveVsFiveApi";

export default function FiveVsFiveLanding() {
  const router = useRouter();
  const [activeRooms, setActiveRooms] = useState<FiveVsFiveRoomDto[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("jaffa_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const [activeRes, matchRes] = await Promise.all([
          fiveVsFiveApi.active(),
          api.getMatches(),
        ]);
        setActiveRooms(activeRes.rooms || []);
        // Pool: today's IPL matches that haven't started yet (5v5 lives in
        // the pre-match window). Use a generous 24h horizon so the user can
        // create a room shortly after midnight for a 7:30 PM match.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const eligible = (matchRes || []).filter((m: any) => {
          if (!m.startTime) return false;
          if (m.status !== "upcoming" && m.status !== "live") return false;
          const t = new Date(m.startTime);
          return t >= today && t < tomorrow && t.getTime() > Date.now();
        });
        setMatches(eligible);
        if (eligible.length === 1) setSelectedMatch(eligible[0].id);
      } catch {
        // Silent — render empty state.
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!selectedMatch) { toast.error("Pick a match first"); return; }
    setCreating(true);
    try {
      const room = await fiveVsFiveApi.createRoom(selectedMatch);
      router.push(`/5v5/${room.id}`);
    } catch (err: any) {
      // 409 means there's already a room for this match — bounce them back.
      if (err.status === 409 && err.body?.roomId) {
        toast("Already in a room for this match — opening it");
        router.push(`/5v5/${err.body.roomId}`);
      } else {
        toast.error(err.message || "Failed to create room");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (joinCode.trim().length < 6) { toast.error("Enter a 6-character code"); return; }
    setJoining(true);
    try {
      const room = await fiveVsFiveApi.joinByCode(joinCode);
      router.push(`/5v5/${room.id}`);
    } catch (err: any) {
      if (err.status === 409 && err.body?.roomId) {
        toast("Already in another 5v5 for this match");
        router.push(`/5v5/${err.body.roomId}`);
      } else {
        toast.error(err.message || "Failed to join");
      }
    } finally {
      setJoining(false);
    }
  };

  const matchNoActive = useMemo(
    () => activeRooms.length === 0,
    [activeRooms],
  );

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 max-w-2xl mx-auto space-y-6">
        {/* Title */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <Swords className="w-6 h-6 text-[#ff6341]" />
            <h2
              className="text-3xl font-bold tracking-tight uppercase text-white"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              5V5
            </h2>
          </div>
          <p className="text-xs text-[#9ca3af]">
            10 players · 2 teams · 5 roles · winner-takes-bananas. Predictions
            lock at match start.
          </p>
        </section>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-[#6b7280] w-7 h-7" />
          </div>
        )}

        {!loading && activeRooms.length > 0 && (
          <section>
            <h3
              className="text-lg font-bold text-white mb-3 pl-3 uppercase"
              style={{
                fontFamily: "'Bungee', 'Impact', cursive",
                borderLeft: "4px solid #22c55e",
              }}
            >
              Your active rooms
            </h3>
            <div className="space-y-2">
              {activeRooms.map((r) => {
                const t1 = r.match?.team1Short || r.match?.team1 || "T1";
                const t2 = r.match?.team2Short || r.match?.team2 || "T2";
                return (
                  <button
                    key={r.id}
                    onClick={() => router.push(`/5v5/${r.id}`)}
                    className="w-full game-card p-4 flex items-center justify-between hover:border-[#22c55e] transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-bold uppercase tracking-wider"
                        style={{ fontFamily: "'Bungee', cursive" }}
                      >
                        {t1} vs {t2}
                      </div>
                      <div className="text-[11px] text-[#9ca3af] mt-1 flex items-center gap-2">
                        <Users className="w-3 h-3" /> {r.slotsFilled}/{r.slotsTotal} players
                        <span className="text-[#3a3a3a]">·</span>
                        <span className="font-mono">{r.code}</span>
                      </div>
                    </div>
                    <span
                      className="text-[10px] font-black uppercase px-2 py-1 rounded"
                      style={{
                        background: r.status === "active" ? "rgba(34,197,94,0.18)" : "rgba(251,146,60,0.18)",
                        color: r.status === "active" ? "#22c55e" : "#fb923c",
                      }}
                    >
                      {r.status === "active" ? "LIVE" : "WAITING"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!loading && matchNoActive && (
          <>
            <section>
              <h3
                className="text-lg font-bold text-white mb-3 pl-3 uppercase"
                style={{
                  fontFamily: "'Bungee', 'Impact', cursive",
                  borderLeft: "4px solid #ff6341",
                }}
              >
                Start a 5v5
              </h3>
              <div className="game-card p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#6b7280] mb-1.5 block">
                    Today&apos;s match
                  </label>
                  {matches.length === 0 ? (
                    <p className="text-xs text-[#9ca3af] py-3">
                      No upcoming matches today. 5v5 opens at midnight on match day.
                    </p>
                  ) : (
                    <select
                      value={selectedMatch}
                      onChange={(e) => setSelectedMatch(e.target.value)}
                      className="w-full nb-input px-3 py-3"
                      style={{ background: "#0d0d0d", border: "2px solid #555", borderRadius: 4, color: "#fff" }}
                    >
                      <option value="">Pick a match…</option>
                      {matches.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {(m.team1Short || m.team1)} vs {(m.team2Short || m.team2)} ·{" "}
                          {new Date(m.startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreate}
                  disabled={creating || !selectedMatch}
                  className="w-full btn-sticker btn-orange py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {creating ? "Creating…" : "Create Room"}
                </motion.button>
              </div>
            </section>

            <section>
              <h3
                className="text-lg font-bold text-white mb-3 pl-3 uppercase"
                style={{
                  fontFamily: "'Bungee', 'Impact', cursive",
                  borderLeft: "4px solid #3b9eff",
                }}
              >
                Got a code?
              </h3>
              <div className="game-card p-5 space-y-4">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  placeholder="6-char code"
                  className="w-full nb-input px-3 py-3 text-center text-xl tracking-[0.3em] font-mono"
                  style={{ background: "#0d0d0d", border: "2px solid #555", borderRadius: 4, color: "#fff" }}
                />
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleJoin}
                  disabled={joining || joinCode.length < 6}
                  className="w-full btn-sticker py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase disabled:opacity-50"
                  style={{ background: "#1a1a1a", color: "#fff", border: "2px solid #3b9eff" }}
                >
                  <LogIn className="w-4 h-4" />
                  {joining ? "Joining…" : "Join Room"}
                </motion.button>
              </div>
            </section>
          </>
        )}

        {/* "How it works" card — sets expectations */}
        <section className="game-card p-4 text-[11px] text-[#9ca3af] leading-relaxed">
          <div className="text-white font-black uppercase tracking-wider text-xs mb-2" style={{ fontFamily: "'Bungee', cursive" }}>
            How 5v5 works
          </div>
          <ol className="list-decimal pl-4 space-y-1">
            <li>10 players, split into 2 teams of 5.</li>
            <li>Pick a role: Top Banana · Gibbon · Chimp · Brawler · Knuckler.</li>
            <li>Each role gets 3 questions about your team&apos;s players.</li>
            <li>Match starts → answers lock → resolution at match end.</li>
            <li>Win your role: <span className="text-[#ffd60a] font-bold">+5 🍌</span>. Win the team total: <span className="text-[#ffd60a] font-bold">+10 🍌</span>.</li>
          </ol>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
