"use client";

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Share2, ArrowLeft, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { toJpeg } from "html-to-image";
import { api } from "@/lib/api";
import { JAFFA_LOGO_DATA_URL } from "./jaffaLogo";

type Question = {
  id: string;
  templateKey: string;
  question: string;
  options: { key: string; label: string; points: number }[];
  userAnswer: { selectedOption: string; pointsEarned: number; isCorrect: boolean | null } | null;
  status: string;
  correctOption?: string | null;
};

// Questions that should render as a wide multi-column list (player pools).
const POOL_TEMPLATES = new Set(["punter_motm", "punter_top_batter", "punter_top_bowler"]);

export default function PunterCardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = params?.matchId as string;
  const venueId = searchParams?.get("venueId") || undefined;

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [allAnswered, setAllAnswered] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const res = await api.getPunterCard(matchId, venueId);
        setMatch(res.match);
        setQuestions(res.questions);
        setAllAnswered(res.allAnswered);
        // Pre-fill selections from saved answers
        const initialSel: Record<string, string> = {};
        const initialExp: Record<string, boolean> = {};
        for (const q of res.questions) {
          if (q.userAnswer?.selectedOption) initialSel[q.id] = q.userAnswer.selectedOption;
          // Default collapsed except the first unanswered
          initialExp[q.id] = false;
        }
        const firstUnanswered = res.questions.find((q) => !q.userAnswer);
        if (firstUnanswered) initialExp[firstUnanswered.id] = true;
        setSelections(initialSel);
        setExpanded(initialExp);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load punter card");
      } finally {
        setLoading(false);
      }
    })();
  }, [matchId, venueId, router]);

  const pendingSelections = useMemo(() => {
    return questions
      .filter((q) => !q.userAnswer && selections[q.id])
      .map((q) => ({ predictionId: q.id, selectedOption: selections[q.id] }));
  }, [questions, selections]);

  const canLock = pendingSelections.length > 0 && !!venueId;

  const handleSelect = (qid: string, optKey: string) => {
    setSelections((s) => ({ ...s, [qid]: optKey }));
  };

  const toggleExpand = (qid: string) => {
    setExpanded((e) => ({ ...e, [qid]: !e[qid] }));
  };

  const handleLockIn = async () => {
    if (!venueId) {
      toast.error("Pick a match first");
      return;
    }
    if (pendingSelections.length === 0) {
      toast.error("No new picks to lock in");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitPunterCard(matchId, venueId, pendingSelections);
      toast.success(`Locked in ${res.saved} pick${res.saved === 1 ? "" : "s"}`);
      // Refresh
      const refreshed = await api.getPunterCard(matchId, venueId);
      setQuestions(refreshed.questions);
      setAllAnswered(refreshed.allAnswered);
    } catch (err: any) {
      toast.error(err?.message || "Failed to lock in picks");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — paste anywhere");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const handleShare = async () => {
    if (!shareRef.current || sharing) return;
    setSharing(true);
    try {
      // JPEG (not PNG) at pixelRatio 1.5 — keeps the image under ~700KB,
      // which is the practical ceiling for iOS WhatsApp's "Send to" share
      // sheet. Bigger PNGs trigger "This item cannot be shared." Quality
      // 0.92 is visually indistinguishable from PNG for the gradient card.
      // cacheBust intentionally OFF: it appends ?t=… to the embedded
      // /jaffa-logo-mark.png src and races the rasterizer, which sometimes
      // produced a logo-less card.
      const dataUrl = await toJpeg(shareRef.current, {
        pixelRatio: 1.5,
        quality: 0.92,
        backgroundColor: "#1a0033",
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "punter-card.jpg", { type: "image/jpeg" });
      const title = `My Punter Card — ${match?.team1Short || "T1"} vs ${match?.team2Short || "T2"}`;

      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        try {
          await navAny.share({
            files: [file],
            title,
            text: "Predict from anywhere · playjaffa.com 🏏",
          });
          return;
        } catch {
          // user cancelled or permission denied — fall through
        }
      }

      // Fallback: download the JPEG so the user can manually attach it.
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "punter-card.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Card downloaded — attach to WhatsApp or Insta");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't generate share image");
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="opacity-60">Loading punter card…</p>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <p className="text-lg opacity-80 mb-2">Punter card not available yet</p>
        <p className="text-sm opacity-50 max-w-xs text-center">
          This match's card opens at midnight on match day, or as soon as we have enough player data.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-6 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
        >
          Back
        </button>
      </main>
    );
  }

  const t1 = match?.team1Short || match?.team1 || "T1";
  const t2 = match?.team2Short || match?.team2 || "T2";
  const startLabel = match?.startTime ? new Date(match.startTime).toLocaleString() : "";

  return (
    <main className="min-h-screen bg-black text-white pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 rounded hover:bg-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">
              Punter Card — {t1} vs {t2}
            </h1>
            <p className="text-xs opacity-60 truncate">{startLabel}</p>
          </div>
          {allAnswered && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-lg border border-orange-500 text-orange-300 hover:bg-orange-500/10 text-sm font-semibold flex items-center gap-1.5"
                title="Copy link to this card"
              >
                <LinkIcon className="w-4 h-4" />
                Copy Link
              </button>
              <button
                onClick={handleShare}
                className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-sm font-semibold flex items-center gap-1.5"
                title="Share card image"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {!venueId && (
          <div className="bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm rounded-lg p-3">
            Pick a venue first to lock in your card. Open this from inside the match lobby.
          </div>
        )}

        {questions.map((q) => {
          const isOpen = !!expanded[q.id];
          const isPool = POOL_TEMPLATES.has(q.templateKey);
          const answered = !!q.userAnswer;
          const locked = answered;
          const resolved = q.status === "resolved" && q.correctOption;
          return (
            <div key={q.id} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/60">
              <button
                onClick={() => toggleExpand(q.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{q.question}</p>
                  {answered && (
                    <p className="text-xs opacity-60 mt-0.5 truncate">
                      Picked:{" "}
                      <span className="text-orange-400 font-medium">
                        {q.options.find((o) => o.key === q.userAnswer!.selectedOption)?.label || q.userAnswer!.selectedOption}
                      </span>
                      {resolved && (
                        <>
                          {" · "}
                          {q.userAnswer!.isCorrect ? (
                            <span className="text-emerald-400">+{q.userAnswer!.pointsEarned} pts</span>
                          ) : (
                            <span className="text-rose-400">missed</span>
                          )}
                        </>
                      )}
                    </p>
                  )}
                </div>
                {isOpen ? <ChevronUp className="w-5 h-5 opacity-60" /> : <ChevronDown className="w-5 h-5 opacity-60" />}
              </button>

              {isOpen && (
                <div className={`px-3 pb-3 ${isPool ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "space-y-2"}`}>
                  {q.options.map((opt) => {
                    const selected = selections[q.id] === opt.key;
                    const isCorrect = resolved && q.correctOption === opt.key;
                    const isWrong = resolved && q.userAnswer?.selectedOption === opt.key && !q.userAnswer.isCorrect;
                    return (
                      <button
                        key={opt.key}
                        disabled={locked}
                        onClick={() => handleSelect(q.id, opt.key)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-md border text-left text-sm transition ${
                          isCorrect
                            ? "border-emerald-500 bg-emerald-500/20"
                            : isWrong
                            ? "border-rose-500 bg-rose-500/20"
                            : selected
                            ? "border-orange-500 bg-orange-500/15"
                            : "border-slate-700 bg-slate-800/60 hover:bg-slate-800"
                        } ${locked ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <span className="truncate">{opt.label}</span>
                        <span className="text-blue-300 font-semibold ml-2 whitespace-nowrap">{opt.points}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lock-in bar */}
      {!allAnswered && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <p className="text-sm opacity-70 flex-1">
              {pendingSelections.length > 0
                ? `${pendingSelections.length} pick${pendingSelections.length === 1 ? "" : "s"} ready`
                : "Tap options above to fill your card"}
            </p>
            <button
              onClick={handleLockIn}
              disabled={!canLock || submitting}
              className={`px-5 py-2.5 rounded-lg font-semibold text-sm ${
                canLock && !submitting
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              {submitting ? "Locking…" : "Lock In"}
            </button>
          </div>
        </div>
      )}

      {/* Hidden render-to-image share card. Positioned off-screen but in the
          layout tree so html-to-image can rasterize it. 1080×1350 is the
          Instagram story / portrait post size. */}
      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        <ShareCard ref={shareRef} match={match} questions={questions} selections={selections} />
      </div>
    </main>
  );
}

// ---- Share card (rendered off-screen, rasterized to PNG on Share) ----

const ShareCard = forwardRef<HTMLDivElement, {
  match: any;
  questions: Question[];
  selections: Record<string, string>;
}>(function ShareCard({ match, questions, selections }, ref) {
  const t1 = match?.team1Short || match?.team1 || "T1";
  const t2 = match?.team2Short || match?.team2 || "T2";
  const startLabel = match?.startTime ? new Date(match.startTime).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

  const picks = questions
    .map((q) => {
      const key = q.userAnswer?.selectedOption || selections[q.id];
      if (!key) return null;
      const opt = q.options.find((o) => o.key === key);
      if (!opt) return null;
      return { question: q.question, pick: opt.label, points: opt.points };
    })
    .filter(Boolean) as { question: string; pick: string; points: number }[];

  const totalPts = picks.reduce((s, p) => s + p.points, 0);

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        minHeight: 1350,
        padding: 56,
        // Neon purple → fuchsia gradient with two soft "lightning" radials
        // baked into the background so the result has the energetic, glassy
        // look of the reference card without needing extra SVG art.
        background:
          "radial-gradient(ellipse at 12% 18%, rgba(255,45,200,0.55) 0%, transparent 42%), " +
          "radial-gradient(ellipse at 88% 82%, rgba(120,40,255,0.55) 0%, transparent 42%), " +
          "linear-gradient(135deg, #1a0033 0%, #3d0a5e 50%, #5b1278 100%)",
        color: "white",
        fontFamily: "'Bungee', 'Impact', cursive",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header — JAFFA brand mark centered at the top, with the date
          pill floated to the top-right so the logo stays visually anchored
          as the focal point of the card. */}
      <div style={{ position: "relative", marginBottom: 36, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 140 }}>
        <img
          src={JAFFA_LOGO_DATA_URL}
          alt="JAFFA"
          style={{ height: 140, width: "auto", objectFit: "contain", filter: "drop-shadow(0 0 22px rgba(255,255,255,0.45))" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontSize: 22,
            padding: "10px 20px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.25)",
            backdropFilter: "blur(8px)",
            letterSpacing: 1,
          }}
        >
          {startLabel}
        </div>
      </div>

      {/* Glassmorphism inner card */}
      <div
        style={{
          flex: 1,
          padding: "44px 40px",
          borderRadius: 28,
          background: "rgba(255,255,255,0.07)",
          border: "2px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 0 80px rgba(180,40,220,0.45), inset 0 0 40px rgba(255,255,255,0.04)",
          display: "flex",
          flexDirection: "column",
          gap: 28,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Title block */}
        <div>
          <div style={{ fontSize: 24, opacity: 0.7, letterSpacing: 4, fontFamily: "'Bungee', 'Impact', cursive" }}>
            PUNTER CARD
          </div>
          <div
            style={{
              fontSize: 88,
              marginTop: 6,
              letterSpacing: 1,
              lineHeight: 1,
              fontFamily: "'Bungee', 'Impact', cursive",
              textShadow: "0 0 30px rgba(255,180,255,0.45)",
            }}
          >
            {t1} <span style={{ opacity: 0.4, fontSize: 64 }}>VS</span> {t2}
          </div>
        </div>

        {/* Picks list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {picks.map((p, i) => (
            <div
              key={i}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: "18px 22px",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div style={{ flex: 1, fontFamily: "system-ui, -apple-system, sans-serif" }}>
                <div style={{ fontSize: 16, opacity: 0.6, marginBottom: 4, fontWeight: 500 }}>{p.question}</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{p.pick}</div>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontFamily: "'Bungee', 'Impact', cursive",
                  color: "#7be4ff",
                  background: "rgba(123,228,255,0.14)",
                  padding: "8px 16px",
                  borderRadius: 10,
                  whiteSpace: "nowrap",
                  textShadow: "0 0 12px rgba(123,228,255,0.6)",
                }}
              >
                {p.points} PTS
              </div>
            </div>
          ))}
        </div>

        {/* Max-potential footer */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 18, opacity: 0.6, letterSpacing: 3 }}>MAX POTENTIAL</div>
            <div
              style={{
                fontSize: 64,
                marginTop: 4,
                color: "#ff79f0",
                fontFamily: "'Bungee', 'Impact', cursive",
                textShadow: "0 0 22px rgba(255,121,240,0.65)",
              }}
            >
              {totalPts} PTS
            </div>
          </div>
          <div style={{ textAlign: "right", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            <div style={{ fontSize: 18, opacity: 0.75, fontWeight: 600 }}>Predict from anywhere</div>
            <div style={{ fontSize: 16, opacity: 0.6, marginTop: 2 }}>Enjoy your rewards</div>
            <div
              style={{
                fontSize: 18,
                marginTop: 8,
                color: "#7be4ff",
                fontFamily: "'Bungee', 'Impact', cursive",
                letterSpacing: 1,
              }}
            >
              playjaffa.com
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
