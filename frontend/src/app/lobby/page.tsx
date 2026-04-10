"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { Flame, Share2, Loader2, Users, Plus, LogIn } from "lucide-react";
import { api } from "@/lib/api";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";
import { toast } from "sonner";
import RoomCard from "@/components/RoomCard";

interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Short?: string;
  team2Short?: string;
  team1Img?: string;
  team2Img?: string;
  status: string;
  venue?: string;
  score?: string;
  overs?: string;
  startTime?: string;
  note?: string;
  source?: string;
}

export default function HomeLiveMatches() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRooms, setMyRooms] = useState<any[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // Match code modal state
  const [codeModal, setCodeModal] = useState<{ match: Match; code: string; error: string; validating: boolean } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }
    loadMatches();
    loadMyRooms();
  }, []);

  const loadMatches = async () => {
    try {
      const data = await api.getMatches();
      setMatches(data || []);
    } catch {
      // Silently fail - show empty state
    } finally {
      setLoading(false);
    }
  };

  const loadMyRooms = async () => {
    setRoomsLoading(true);
    try {
      const data = await api.getMyRooms();
      setMyRooms(data.rooms || []);
    } catch {
      // Silently fail
    } finally {
      setRoomsLoading(false);
    }
  };

  const hasVenue = typeof window !== "undefined" && isCafeRoute() && !!localStorage.getItem("jaffa_venue_id") && localStorage.getItem("jaffa_venue_id") !== "00000000-0000-0000-0000-000000000001";
  const liveMatches = matches.filter((m) => m.status === "live");
  const upcomingMatches = matches.filter((m) => m.status === "upcoming");

  const [now, setNow] = useState(Date.now());
  const [importing, setImporting] = useState<string | null>(null);

  // Update clock every 30s so buttons switch from "Notify Me" to "Join Match" on time
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh match list every 15s
  useEffect(() => {
    const interval = setInterval(() => loadMatches(), 15000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = (match: Match) => {
    // Show match code modal
    setCodeModal({ match, code: "", error: "", validating: false });
  };

  const handleShare = async (match: Match) => {
    const shareText = `${match.team1Short || match.team1} vs ${match.team2Short || match.team2} on JAFFA. Join from ${window.location.origin}${cafeUrl("") || ""}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${match.team1Short || match.team1} vs ${match.team2Short || match.team2}`,
          text: shareText,
          url: `${window.location.origin}${cafeUrl("") || ""}`,
        });
        return;
      }

      await navigator.clipboard.writeText(shareText);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not share this match right now");
    }
  };

  const handleCodeSubmit = async () => {
    if (!codeModal || codeModal.code.length !== 4) return;
    const { match, code } = codeModal;
    setCodeModal({ ...codeModal, validating: true, error: "" });

    try {
      const venueId = localStorage.getItem("jaffa_venue_id") || "";

      if (!venueId) {
        setCodeModal({ ...codeModal, validating: false, error: "Please scan your cafe's QR code first." });
        return;
      }

      // Validate the code first
      const validation = await api.validateMatchCode(venueId, match.id, code);
      if (!validation.valid) {
        setCodeModal({ ...codeModal, validating: false, error: "Invalid code. Please try again." });
        return;
      }

      // If it's a Sportsmonk match, auto-import first
      let matchId = match.id;
      if (match.id.startsWith("sportsmonk_")) {
        const fixtureId = match.id.replace("sportsmonk_", "");
        setImporting(match.id);
        try {
          const result = await api.importMatch(fixtureId);
          matchId = result.match.id;
        } catch {
          setCodeModal({ ...codeModal, validating: false, error: "Failed to load match." });
          setImporting(null);
          return;
        }
        setImporting(null);
      }

      // Store the code for later use in the match join (clear any stale code first)
      localStorage.removeItem("jaffa_match_code");
      localStorage.setItem("jaffa_match_code", code);
      setCodeModal(null);
      router.push(cafeUrl(`/match/${matchId}`));
    } catch (err: any) {
      setCodeModal({ ...codeModal, validating: false, error: err.message || "Something went wrong." });
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 space-y-6 max-w-2xl mx-auto">
        {/* Title Section */}
        <section className="mb-4">
          <h2
            className="text-3xl font-bold tracking-tight uppercase text-white"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            ACTIVE BATTLES
          </h2>
        </section>

        {/* Play with Friends Section — global users only */}
        {!hasVenue && (
          <section className="mb-6">
            <h3
              className="text-lg font-bold text-white mb-4 pl-3 uppercase"
              style={{
                fontFamily: "'Bungee', 'Impact', cursive",
                borderLeft: "4px solid #3b9eff",
              }}
            >
              PLAY WITH FRIENDS
            </h3>

            <div className="flex gap-3 mb-4">
              <button
                onClick={() => router.push("/room/create")}
                className="flex-1 btn-sticker uppercase tracking-tight py-3 flex items-center justify-center gap-2 text-sm font-bold"
                style={{ background: "#3b9eff", color: "#fff", border: "2px solid #3b9eff" }}
              >
                <Plus size={18} /> Create Room
              </button>
              <button
                onClick={() => router.push("/room/join")}
                className="flex-1 btn-sticker uppercase tracking-tight py-3 flex items-center justify-center gap-2 text-sm font-bold"
                style={{ background: "#1a1a1a", color: "#fff", border: "2px solid #3b9eff" }}
              >
                <LogIn size={18} /> Join Room
              </button>
            </div>

            {/* My Active Rooms */}
            {roomsLoading && (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin text-[#6b7280]" />
              </div>
            )}

            {!roomsLoading && myRooms.length > 0 && (
              <div>
                <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold mb-2">
                  <Users size={12} className="inline mr-1" />
                  My Rooms
                </p>
                {myRooms.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-12">
            <div
              className="w-8 h-8 animate-spin rounded-[2px]"
              style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {/* Live Matches */}
        {!loading && liveMatches.length > 0 && liveMatches.map((match) => (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="game-card"
          >
            {/* Status Row */}
            <div className="flex justify-between items-center mb-6">
              <span className="live-badge">LIVE</span>
              {match.note && (
                <span className="info-pill">{match.note}</span>
              )}
            </div>

            {/* Matchup */}
            <div className="flex justify-between items-center mb-6 px-2">
              {/* Team 1 */}
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 flex items-center justify-center p-2 overflow-hidden"
                  style={{ border: "2px solid #ff6341", borderRadius: "4px", background: "#1a1a1a" }}
                >
                  {match.team1Img ? (
                    <img src={match.team1Img} alt={match.team1Short || match.team1} className="w-full h-full object-contain" />
                  ) : (
                    <span
                      className="font-bold text-sm"
                      style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}
                    >
                      {match.team1Short || match.team1?.slice(0, 3)}
                    </span>
                  )}
                </div>
                <span
                  className="font-bold text-lg tracking-wider text-white"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  {(match.team1Short || match.team1?.slice(0, 3))?.toUpperCase()}
                </span>
              </div>

              {/* VS + Score */}
              <div className="flex flex-col items-center">
                <span
                  className="font-black text-3xl italic"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}
                >
                  VS
                </span>
                {match.score && (
                  <div className="mt-2 text-center">
                    <div className="stat-number text-lg">{match.score}</div>
                    {match.overs && <div className="text-[10px] text-[#6b7280] uppercase">{match.overs} Overs</div>}
                  </div>
                )}
              </div>

              {/* Team 2 */}
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 flex items-center justify-center p-2 overflow-hidden"
                  style={{ border: "2px solid #ff6341", borderRadius: "4px", background: "#1a1a1a" }}
                >
                  {match.team2Img ? (
                    <img src={match.team2Img} alt={match.team2Short || match.team2} className="w-full h-full object-contain" />
                  ) : (
                    <span
                      className="font-bold text-sm"
                      style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#3b9eff" }}
                    >
                      {match.team2Short || match.team2?.slice(0, 3)}
                    </span>
                  )}
                </div>
                <span
                  className="font-bold text-lg tracking-wider text-white"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  {(match.team2Short || match.team2?.slice(0, 3))?.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Footer Action */}
            <div className="flex items-center gap-3">
              {hasVenue ? (
                <button
                  onClick={() => handleJoin(match)}
                  disabled={importing === match.id}
                  className="flex-1 btn-sticker btn-orange uppercase tracking-tight disabled:opacity-50"
                >
                  {importing === match.id ? "LOADING..." : "JOIN NOW"}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => router.push(`/room/create?matchId=${match.id}`)}
                    className="flex-1 btn-sticker btn-orange uppercase tracking-tight"
                  >
                    CREATE ROOM
                  </button>
                  <button
                    onClick={() => router.push(`/room/join?matchId=${match.id}`)}
                    className="flex-1 btn-sticker uppercase tracking-tight"
                    style={{ background: "#1a1a1a", color: "#fff", border: "2px solid #ff6341" }}
                  >
                    JOIN ROOM
                  </button>
                </>
              )}
              <button
                onClick={() => handleShare(match)}
                className="w-12 h-12 flex items-center justify-center text-[#6b7280] hover:text-[#ff6341] transition-colors"
                style={{ border: "2px solid #333", borderRadius: "4px", background: "#1a1a1a" }}
              >
                <Share2 size={20} />
              </button>
            </div>
          </motion.div>
        ))}

        {/* No live matches message */}
        {!loading && liveMatches.length === 0 && (
          <div className="game-card text-center">
            <div className="text-4xl mb-3">🏏</div>
            <p
              className="text-lg text-white mb-1"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              NO LIVE MATCHES
            </p>
            <p className="text-xs text-[#6b7280]">Check back when a match is being played</p>
          </div>
        )}

        {/* Upcoming Matches Title */}
        {upcomingMatches.length > 0 && (
          <h3
            className="text-lg font-bold text-white mt-8 mb-4 pl-3 uppercase"
            style={{
              fontFamily: "'Bungee', 'Impact', cursive",
              borderLeft: "4px solid #ff6341",
            }}
          >
            UPCOMING BATTLES
          </h3>
        )}

        {/* Upcoming Match Cards */}
        {upcomingMatches.map((match) => {
          const startDate = match.startTime ? new Date(match.startTime) : null;
          const timeStr = startDate ? startDate.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

          return (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="game-card"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold">
                  {match.note || "Upcoming"}
                </span>
                {startDate && (
                  <span className="info-pill">{timeStr}</span>
                )}
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 flex items-center justify-center p-1.5 overflow-hidden"
                    style={{ border: "2px solid #333", borderRadius: "4px", background: "#1a1a1a" }}
                  >
                    {match.team1Img ? (
                      <img src={match.team1Img} alt={match.team1Short || match.team1} className="w-full h-full object-contain" />
                    ) : (
                      <span
                        className="font-bold text-xs"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}
                      >
                        {match.team1Short || match.team1?.slice(0, 3)}
                      </span>
                    )}
                  </div>
                  <span
                    className="font-bold text-base text-white"
                    style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                  >
                    {(match.team1Short || match.team1?.slice(0, 3))?.toUpperCase()}
                  </span>
                </div>

                <div
                  className="h-[2px] flex-1 mx-4"
                  style={{ background: "#333" }}
                />

                <div className="flex items-center gap-3">
                  <span
                    className="font-bold text-base text-white"
                    style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                  >
                    {(match.team2Short || match.team2?.slice(0, 3))?.toUpperCase()}
                  </span>
                  <div
                    className="w-12 h-12 flex items-center justify-center p-1.5 overflow-hidden"
                    style={{ border: "2px solid #333", borderRadius: "4px", background: "#1a1a1a" }}
                  >
                    {match.team2Img ? (
                      <img src={match.team2Img} alt={match.team2Short || match.team2} className="w-full h-full object-contain" />
                    ) : (
                      <span
                        className="font-bold text-xs"
                        style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#3b9eff" }}
                      >
                        {match.team2Short || match.team2?.slice(0, 3)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {startDate && (startDate.getTime() - now) <= 45 * 60 * 1000 ? (
                hasVenue ? (
                  <button
                    onClick={() => handleJoin(match)}
                    disabled={importing === match.id}
                    className="w-full btn-sticker btn-orange uppercase tracking-tight disabled:opacity-50"
                  >
                    {importing === match.id ? "LOADING..." : "JOIN MATCH"}
                  </button>
                ) : (
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => router.push(`/room/create?matchId=${match.id}`)}
                      className="flex-1 btn-sticker btn-orange uppercase tracking-tight"
                    >
                      CREATE ROOM
                    </button>
                    <button
                      onClick={() => router.push(`/room/join?matchId=${match.id}`)}
                      className="flex-1 btn-sticker uppercase tracking-tight"
                      style={{ background: "#1a1a1a", color: "#fff", border: "2px solid #ff6341" }}
                    >
                      JOIN ROOM
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <button
                    className="w-full btn-gray uppercase tracking-widest text-xs font-bold py-2.5 cursor-not-allowed opacity-60"
                    disabled
                    title="Match reminders are not enabled yet"
                  >
                    NOTIFY ME SOON
                  </button>
                  <p className="text-[10px] text-white/35 uppercase tracking-wider text-center">
                    Match reminders are coming soon. Join from the lobby when the match goes live.
                  </p>
                </div>
              )}
            </motion.div>
          );
        })}
      </main>

      {/* Match Code Modal */}
      {codeModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="game-card w-full max-w-sm"
          >
            <h3
              className="text-xl font-bold text-center mb-1 text-white uppercase"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              ENTER MATCH CODE
            </h3>
            <p className="text-[#6b7280] text-xs text-center mb-6">
              Get the 4-digit code from your cafe to join
            </p>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                inputMode="numeric"
                value={codeModal.code}
                onChange={(e) =>
                  setCodeModal({ ...codeModal, code: e.target.value.replace(/\D/g, "").slice(0, 4), error: "" })
                }
                placeholder="0000"
                maxLength={4}
                autoFocus
                className="nb-input flex-1 text-center text-3xl font-black tracking-[0.4em] py-4"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              />
            </div>

            {codeModal.error && (
              <p className="text-xs text-center mb-3" style={{ color: "#ff6341" }}>{codeModal.error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setCodeModal(null)}
                className="flex-1 btn-gray py-3 font-bold"
              >
                CANCEL
              </button>
              <button
                onClick={handleCodeSubmit}
                disabled={codeModal.code.length !== 4 || codeModal.validating}
                className="flex-1 btn-sticker btn-orange py-3 font-bold disabled:opacity-50"
              >
                {codeModal.validating ? "CHECKING..." : "JOIN"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
