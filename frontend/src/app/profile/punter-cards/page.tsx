"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Card = {
  matchId: string;
  team1: string | null;
  team2: string | null;
  team1Short: string | null;
  team2Short: string | null;
  startTime: string | null;
  status: string | null;
  correctCount: number;
  resolvedCount: number;
  totalCount: number;
  totalPoints: number;
};

export default function MyPunterCardsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const res = await api.getMyPunterCards();
        setCards(res.cards);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load cards");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <main className="min-h-screen bg-black text-white pb-20">
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 rounded hover:bg-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">My Punter Cards</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <p className="opacity-60 text-center py-10">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="opacity-60 text-center py-10">
            No punter cards yet. They'll appear here once you answer one.
          </p>
        ) : (
          cards.map((c) => {
            const t1 = c.team1Short || c.team1 || "T1";
            const t2 = c.team2Short || c.team2 || "T2";
            const isResolved = c.status === "completed" && c.resolvedCount > 0;
            return (
              <Link
                key={c.matchId}
                href={`/punter-card/${c.matchId}`}
                className="block border border-slate-800 rounded-lg bg-slate-900/60 hover:bg-slate-900 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">
                      {t1} <span className="opacity-50">vs</span> {t2}
                    </p>
                    <p className="text-xs opacity-60 mt-0.5">{fmtDate(c.startTime)}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className="opacity-70">
                        Picks:{" "}
                        <span className="text-white font-medium">{c.totalCount}</span>
                      </span>
                      {isResolved ? (
                        <>
                          <span className="opacity-70">
                            Right:{" "}
                            <span className="text-emerald-400 font-medium">{c.correctCount}</span>
                          </span>
                          <span className="opacity-70">
                            Points:{" "}
                            <span className="text-orange-400 font-medium">{c.totalPoints}</span>
                          </span>
                        </>
                      ) : (
                        <span className="opacity-70">
                          Status: <span className="text-amber-300 font-medium">pending</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-40" />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
