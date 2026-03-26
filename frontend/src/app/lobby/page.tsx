"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import { api } from "@/lib/api";
import { cafeUrl } from "@/lib/navigation";

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

  // Match code modal state
  const [codeModal, setCodeModal] = useState<{ match: Match; code: string; error: string; validating: boolean } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push(cafeUrl("/login"));
      return;
    }
    loadMatches();
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
    <div className="bg-surface text-on-surface font-body min-h-screen pb-24">
      {/* TopAppBar */}
      <Header
        rightContent={
          <>
            <MaterialIcon
              icon="search"
              className="text-slate-400 hover:text-[#14d1ff] transition-colors duration-300 cursor-pointer"
            />
            <div className="w-10 h-10 rounded-full border-2 border-[#00FFAB]/30 overflow-hidden scale-95 active:scale-90 transition-transform cursor-pointer bg-surface-container-highest">
              <div className="w-full h-full flex items-center justify-center">
                <MaterialIcon icon="person" className="text-on-surface-variant" />
              </div>
            </div>
          </>
        }
      />

      <main className="pt-24 px-4 space-y-6 max-w-2xl mx-auto">
        {/* Live Header Section */}
        <section className="flex justify-between items-end mb-4">
          <div>
            <span className="font-label text-xs uppercase tracking-[0.2em] text-secondary-fixed-dim">
              Arena Dashboard
            </span>
            <h2 className="font-headline text-3xl font-bold tracking-tight">Active Battles</h2>
          </div>
          <div className="text-right">
            <span className="font-label text-[10px] uppercase text-outline">Pulse Rate</span>
            <div className="h-1 w-24 bg-surface-container-high rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-secondary-container to-primary-container w-[75%]"></div>
            </div>
          </div>
        </section>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Live Matches */}
        {!loading && liveMatches.length > 0 && liveMatches.map((match) => (
          <div key={match.id} className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-container to-secondary-container rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-surface-container-low neon-border rounded-xl overflow-hidden p-6">
              {/* Status Row */}
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2 bg-primary-container/10 px-3 py-1 rounded-full border border-primary-container/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-container"></span>
                  </span>
                  <span className="font-label text-[10px] font-bold text-primary-container uppercase tracking-widest">LIVE</span>
                </div>
                {match.note && (
                  <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-highest px-2 py-1 rounded">
                    {match.note}
                  </span>
                )}
              </div>
              {/* Matchup */}
              <div className="flex justify-between items-center mb-8 px-4">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center p-2 shadow-inner overflow-hidden">
                    {match.team1Img ? (
                      <img src={match.team1Img} alt={match.team1Short || match.team1} className="w-full h-full object-contain" />
                    ) : (
                      <span className="font-headline font-bold text-sm text-primary-container">{match.team1Short || match.team1?.slice(0, 3)}</span>
                    )}
                  </div>
                  <span className="font-headline font-bold text-xl tracking-wider">{(match.team1Short || match.team1?.slice(0, 3))?.toUpperCase()}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-headline font-black text-4xl text-outline-variant italic opacity-50">VS</span>
                  {match.score && (
                    <div className="mt-2 text-center">
                      <div className="text-primary-container font-headline font-bold text-lg leading-tight glow-text">{match.score}</div>
                      {match.overs && <div className="text-[10px] text-outline font-label uppercase">{match.overs} Overs</div>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center p-2 shadow-inner overflow-hidden">
                    {match.team2Img ? (
                      <img src={match.team2Img} alt={match.team2Short || match.team2} className="w-full h-full object-contain" />
                    ) : (
                      <span className="font-headline font-bold text-sm text-secondary-container">{match.team2Short || match.team2?.slice(0, 3)}</span>
                    )}
                  </div>
                  <span className="font-headline font-bold text-xl tracking-wider">{(match.team2Short || match.team2?.slice(0, 3))?.toUpperCase()}</span>
                </div>
              </div>
              {/* Footer Action */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleJoin(match)}
                  disabled={importing === match.id}
                  className="flex-1 bg-primary-container text-on-primary-container font-headline font-bold py-3 rounded-xl scale-95 active:scale-90 transition-all shadow-[0_4px_20px_rgba(0,255,171,0.4)] uppercase tracking-tight disabled:opacity-50"
                >
                  {importing === match.id ? "Loading..." : "Join Now"}
                </button>
                <button className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary-container transition-colors">
                  <MaterialIcon icon="share" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* No live matches message */}
        {!loading && liveMatches.length === 0 && (
          <div className="bg-surface-container-low rounded-xl p-8 text-center border border-white/5">
            <MaterialIcon icon="sports_cricket" className="text-4xl text-outline-variant mb-3" />
            <p className="font-headline font-bold text-lg text-on-surface-variant">No Live Matches</p>
            <p className="font-label text-xs text-outline mt-1">Check back when a match is being played</p>
          </div>
        )}

        {/* Upcoming Matches Title */}
        {upcomingMatches.length > 0 && (
          <h3 className="font-headline text-lg font-bold text-on-surface-variant mt-8 mb-4 border-l-4 border-secondary-container pl-3">
            Upcoming Battles
          </h3>
        )}

        {/* Upcoming Match Cards */}
        {upcomingMatches.map((match) => {
          const startDate = match.startTime ? new Date(match.startTime) : null;
          const timeStr = startDate ? startDate.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

          return (
            <div key={match.id} className="bg-surface-container-low rounded-xl p-5 border border-white/5 hover:border-white/10 transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                  <span className="font-label text-[10px] text-outline uppercase tracking-widest">
                    {match.note || "Upcoming"}
                  </span>
                </div>
                {startDate && (
                  <div className="bg-surface-container-highest px-3 py-1 rounded-full">
                    <span className="font-label text-[10px] font-bold text-on-surface">{timeStr}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center p-1.5 border border-white/10 overflow-hidden">
                    {match.team1Img ? (
                      <img src={match.team1Img} alt={match.team1Short || match.team1} className="w-full h-full object-contain" />
                    ) : (
                      <span className="font-headline font-bold text-xs text-primary-container">{match.team1Short || match.team1?.slice(0, 3)}</span>
                    )}
                  </div>
                  <span className="font-headline font-bold text-lg">{(match.team1Short || match.team1?.slice(0, 3))?.toUpperCase()}</span>
                </div>
                <div className="h-[1px] flex-1 mx-4 bg-gradient-to-r from-transparent via-outline-variant to-transparent opacity-30"></div>
                <div className="flex items-center gap-4">
                  <span className="font-headline font-bold text-lg">{(match.team2Short || match.team2?.slice(0, 3))?.toUpperCase()}</span>
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center p-1.5 border border-white/10 overflow-hidden">
                    {match.team2Img ? (
                      <img src={match.team2Img} alt={match.team2Short || match.team2} className="w-full h-full object-contain" />
                    ) : (
                      <span className="font-headline font-bold text-xs text-secondary-container">{match.team2Short || match.team2?.slice(0, 3)}</span>
                    )}
                  </div>
                </div>
              </div>
              {startDate && (startDate.getTime() - now) <= 30 * 60 * 1000 ? (
                <button
                  onClick={() => handleJoin(match)}
                  disabled={importing === match.id}
                  className="w-full bg-primary-container text-on-primary-container font-headline font-bold py-3 rounded-xl scale-95 active:scale-90 transition-all shadow-[0_4px_20px_rgba(0,255,171,0.4)] uppercase tracking-tight disabled:opacity-50"
                >
                  {importing === match.id ? "Loading..." : "Join Match"}
                </button>
              ) : (
                <button className="w-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label text-xs font-bold py-2.5 rounded-lg transition-colors border border-white/5 uppercase tracking-widest">
                  Notify Me
                </button>
              )}
            </div>
          );
        })}
      </main>

      {/* Match Code Modal */}
      {codeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-surface-container-low rounded-2xl p-6 w-full max-w-sm border border-white/10 shadow-2xl">
            <h3 className="font-headline text-xl font-bold text-center mb-1">Enter Match Code</h3>
            <p className="text-outline text-xs text-center mb-6">
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
                className="flex-1 bg-surface-container-high text-on-surface text-center text-3xl font-black tracking-[0.4em] px-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-primary-container"
              />
            </div>

            {codeModal.error && (
              <p className="text-red-400 text-xs text-center mb-3">{codeModal.error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setCodeModal(null)}
                className="flex-1 bg-surface-container-high text-on-surface-variant font-label font-bold py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCodeSubmit}
                disabled={codeModal.code.length !== 4 || codeModal.validating}
                className="flex-1 bg-primary-container text-on-primary-container font-headline font-bold py-3 rounded-xl disabled:opacity-50 shadow-[0_4px_20px_rgba(0,255,171,0.3)]"
              >
                {codeModal.validating ? "Checking..." : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
