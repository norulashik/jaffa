"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import { api } from "@/lib/api";

interface Match {
  id: string;
  team1: string;
  team2: string;
  status: string;
  venue?: string;
  score?: string;
  overs?: string;
  date?: string;
}

export default function HomeLiveMatches() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push("/login");
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

        {/* LIVE Match Card (Featured) */}
        {matches.length > 0 ? (
          matches.map((match) => (
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
                    <span className="font-label text-[10px] font-bold text-primary-container uppercase tracking-widest">
                      {match.status === "live" ? "LIVE" : match.status?.toUpperCase()}
                    </span>
                  </div>
                  <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-highest px-2 py-1 rounded">
                    {match.venue || "Venue TBD"}
                  </span>
                </div>
                {/* Matchup */}
                <div className="flex justify-between items-center mb-8 px-4">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center p-2 shadow-inner">
                      <span className="font-headline font-bold text-sm text-primary-container">{match.team1?.slice(0, 3)}</span>
                    </div>
                    <span className="font-headline font-bold text-xl tracking-wider">{match.team1?.slice(0, 3)?.toUpperCase()}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-headline font-black text-4xl text-outline-variant italic opacity-50">VS</span>
                    {match.score && (
                      <div className="mt-2 text-center">
                        <div className="text-primary-container font-headline font-bold text-lg leading-tight glow-text">
                          {match.score}
                        </div>
                        {match.overs && (
                          <div className="text-[10px] text-outline font-label uppercase">{match.overs} Overs</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center p-2 shadow-inner">
                      <span className="font-headline font-bold text-sm text-secondary-container">{match.team2?.slice(0, 3)}</span>
                    </div>
                    <span className="font-headline font-bold text-xl tracking-wider">{match.team2?.slice(0, 3)?.toUpperCase()}</span>
                  </div>
                </div>
                {/* Footer Action */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => router.push(`/match/${match.id}`)}
                    className="flex-1 bg-primary-container text-on-primary-container font-headline font-bold py-3 rounded-xl scale-95 active:scale-90 transition-all shadow-[0_4px_20px_rgba(0,255,171,0.4)] uppercase tracking-tight"
                  >
                    Join Now
                  </button>
                  <button className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary-container transition-colors">
                    <MaterialIcon icon="share" />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          /* Demo/Placeholder Match Card when no API data */
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-container to-secondary-container rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-surface-container-low neon-border rounded-xl overflow-hidden p-6">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2 bg-primary-container/10 px-3 py-1 rounded-full border border-primary-container/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-container"></span>
                  </span>
                  <span className="font-label text-[10px] font-bold text-primary-container uppercase tracking-widest">LIVE</span>
                </div>
                <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-highest px-2 py-1 rounded">
                  The Coffee Bean
                </span>
              </div>
              <div className="flex justify-between items-center mb-8 px-4">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center p-2 shadow-inner">
                    <span className="font-headline font-bold text-lg text-primary-container">IND</span>
                  </div>
                  <span className="font-headline font-bold text-xl tracking-wider">IND</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-headline font-black text-4xl text-outline-variant italic opacity-50">VS</span>
                  <div className="mt-2 text-center">
                    <div className="text-primary-container font-headline font-bold text-lg leading-tight glow-text">142/3</div>
                    <div className="text-[10px] text-outline font-label uppercase">16.4 Overs</div>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center p-2 shadow-inner">
                    <span className="font-headline font-bold text-lg text-secondary-container">AUS</span>
                  </div>
                  <span className="font-headline font-bold text-xl tracking-wider">AUS</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button className="flex-1 bg-primary-container text-on-primary-container font-headline font-bold py-3 rounded-xl scale-95 active:scale-90 transition-all shadow-[0_4px_20px_rgba(0,255,171,0.4)] uppercase tracking-tight">
                  Join Now
                </button>
                <button className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary-container transition-colors">
                  <MaterialIcon icon="share" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Matches Title */}
        <h3 className="font-headline text-lg font-bold text-on-surface-variant mt-8 mb-4 border-l-4 border-secondary-container pl-3">
          Upcoming Battles
        </h3>

        {/* Match Card 2 (Standard) */}
        <div className="bg-surface-container-low rounded-xl p-5 border border-white/5 hover:border-white/10 transition-all group">
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col">
              <span className="font-label text-[10px] text-outline uppercase tracking-widest">
                T20 Series • Starts in 2h
              </span>
              <span className="font-label text-[10px] text-secondary-fixed-dim mt-1">
                Melbourne Cricket Ground
              </span>
            </div>
            <div className="bg-surface-container-highest px-3 py-1 rounded-full">
              <span className="font-label text-[10px] font-bold text-on-surface">MAY 24</span>
            </div>
          </div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center p-1.5 border border-white/10">
                <span className="font-headline font-bold text-xs text-primary-container">ENG</span>
              </div>
              <span className="font-headline font-bold text-lg">ENG</span>
            </div>
            <div className="h-[1px] flex-1 mx-4 bg-gradient-to-r from-transparent via-outline-variant to-transparent opacity-30"></div>
            <div className="flex items-center gap-4">
              <span className="font-headline font-bold text-lg">RSA</span>
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center p-1.5 border border-white/10">
                <span className="font-headline font-bold text-xs text-secondary-container">RSA</span>
              </div>
            </div>
          </div>
          <button className="w-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label text-xs font-bold py-2.5 rounded-lg transition-colors border border-white/5 uppercase tracking-widest">
            View Odds
          </button>
        </div>

        {/* Match Card 3 (Standard) */}
        <div className="bg-surface-container-low rounded-xl p-5 border border-white/5 hover:border-white/10 transition-all group">
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col">
              <span className="font-label text-[10px] text-outline uppercase tracking-widest">
                World Cup Qualifiers
              </span>
              <span className="font-label text-[10px] text-secondary-fixed-dim mt-1">Eden Gardens</span>
            </div>
            <div className="bg-surface-container-highest px-3 py-1 rounded-full">
              <span className="font-label text-[10px] font-bold text-on-surface">MAY 25</span>
            </div>
          </div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center p-1.5 border border-white/10">
                <span className="font-headline font-bold text-xs text-primary-container">NZL</span>
              </div>
              <span className="font-headline font-bold text-lg">NZL</span>
            </div>
            <div className="h-[1px] flex-1 mx-4 bg-gradient-to-r from-transparent via-outline-variant to-transparent opacity-30"></div>
            <div className="flex items-center gap-4">
              <span className="font-headline font-bold text-lg">PAK</span>
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center p-1.5 border border-white/10">
                <span className="font-headline font-bold text-xs text-secondary-container">PAK</span>
              </div>
            </div>
          </div>
          <button className="w-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label text-xs font-bold py-2.5 rounded-lg transition-colors border border-white/5 uppercase tracking-widest">
            View Odds
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
