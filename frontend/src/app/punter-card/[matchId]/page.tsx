"use client";

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Share2, ArrowLeft, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { toJpeg } from "html-to-image";
import { api } from "@/lib/api";
import { getTeamLogoDataUrl } from "./teamLogos";
import { TEMPLATE, SLOTS, ROW, HEADER, FOOTER, ROW_ORDER, shortLabelFor, type Rect } from "./templateLayout";
import TeamBadge from "@/components/TeamBadge";
import { getTeamColor } from "@/lib/teamColors";
import { GLOBAL_VENUE_ID } from "@/lib/venue";
import PunterCardShareModal from "@/components/PunterCardShareModal";

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
  // Fallback chain so the page always has a venueId to bind picks to:
  //   1. ?venueId=<id> in the URL (lobby's "OPEN PUNTER CARD" passes this)
  //   2. localStorage jaffa_venue_id (set by past-battle nav / cafe onboarding)
  //   3. The synthetic GLOBAL_VENUE_ID for users who never entered a cafe
  // Without this, global users tapping the lobby's punter-card button
  // would land on the page with no venueId, see a "Pick a venue first"
  // banner, and be unable to lock in any picks.
  const venueId =
    searchParams?.get("venueId") ||
    (typeof window !== "undefined" ? localStorage.getItem("jaffa_venue_id") || undefined : undefined) ||
    GLOBAL_VENUE_ID;
  const roomId =
    searchParams?.get("roomId") ||
    (typeof window !== "undefined" ? localStorage.getItem("jaffa_room_id") || undefined : undefined) ||
    undefined;
  // Calibration aid: ?debug=1 paints every overlay slot with a red
  // border + translucent fill on the OFF-SCREEN ShareCard (which gets
  // rasterized into the share JPEG). Lets us screenshot once and read
  // exact alignment vs the template PNG's drawn boxes. Strip after the
  // overlay is calibrated.
  const debug = searchParams?.get("debug") === "1";

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [allAnswered, setAllAnswered] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  // Spotify-style share modal — opens automatically the first time the
  // card flips to "all answered", and from the manual Share button after.
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareDataUrl, setShareDataUrl] = useState<string | null>(null);
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const res = await api.getPunterCard(matchId, venueId, roomId);
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

  // Once the match is completed the share card swaps from pre-match
  // ("picks", showing max-potential per question) to post-match
  // ("results", showing actual points awarded with ✓/✗ + the correct
  // answer when wrong). Drives the off-screen ShareCard mode prop, the
  // Share button label, the filename, and the shareText below.
  const shareMode: ShareCardMode = match?.status === "completed" ? "results" : "picks";

  // Total points actually scored across all resolved punter card answers.
  // Used in the post-match shareText so the Instagram caption reads
  // "My LSG vs KKR Punter Card · 165 pts · playjaffa.com 🏏" instead of
  // the generic pre-match copy.
  const finalScored = useMemo(() => {
    if (shareMode !== "results") return 0;
    return questions.reduce((s, q) => s + (q.userAnswer?.pointsEarned || 0), 0);
  }, [questions, shareMode]);

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
    // Captured BEFORE the refresh so we can detect the false→true edge
    // and auto-open the share modal exactly on the completing Lock In.
    const wasAllAnswered = allAnswered;
    try {
      const res = await api.submitPunterCard(matchId, venueId, pendingSelections, roomId);
      toast.success(`Locked in ${res.saved} pick${res.saved === 1 ? "" : "s"}`);
      // Refresh
      const refreshed = await api.getPunterCard(matchId, venueId, roomId);
      setQuestions(refreshed.questions);
      setAllAnswered(refreshed.allAnswered);
      if (refreshed.allAnswered && !wasAllAnswered) {
        // First time the card became complete — pop the share sheet so
        // the user gets the brand asset moment without an extra tap.
        // Yield one frame so React commits the new question states (status
        // pills, etc.) into the off-screen ShareCard before rasterizing.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await openShareModal();
      }
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

  // Rasterize the off-screen ShareCard into a JPEG and pop the share modal.
  // Single entry point for both the manual Share button (top-right) and the
  // auto-open after the completing Lock In. pixelRatio 1.5 + quality 0.92
  // keeps the file under ~700KB which is the ceiling iOS WhatsApp's "Send
  // to" share sheet enforces.
  //
  // The JAFFA wordmark is now baked into the template PNG, so the previous
  // canvas-composite pass (used to work around html-to-image's iOS-Safari
  // foreignObject bug for the data-URL logo) is no longer needed.
  const openShareModal = async () => {
    if (!shareRef.current || sharing) return;
    setSharing(true);
    try {
      // Wait for every embedded image (template + team crests) to decode
      // before snapshotting — html-to-image otherwise paints before async
      // decode finishes and ships incomplete frames.
      const imgs = Array.from(shareRef.current.querySelectorAll("img"));
      await Promise.allSettled(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return img.decode().catch(() => undefined);
        })
      );

      // One animation frame so layout settles after any decode-triggered
      // reflow before we capture pixels.
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const PIXEL_RATIO = 1.5;
      const dataUrl = await toJpeg(shareRef.current, {
        pixelRatio: PIXEL_RATIO,
        quality: 0.92,
        backgroundColor: "#0d2bb3",
      });

      const blob = await (await fetch(dataUrl)).blob();
      setShareDataUrl(dataUrl);
      setShareBlob(blob);
      setShowShareModal(true);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't generate share image");
    } finally {
      setSharing(false);
    }
  };

  const handleShare = openShareModal;

  // Per-match colour palette: each team's brand colour drives the page
  // gradient + corner glows, mimicking the saturated, gamefied look of the
  // reference NFT card. Falls back to a neutral JAFFA-orange/purple combo
  // for non-IPL fixtures.
  const t1 = match?.team1Short || match?.team1 || "T1";
  const t2 = match?.team2Short || match?.team2 || "T2";
  const c1 = getTeamColor(t1);
  const c2 = getTeamColor(t2);
  const pageBg = {
    background: `
      radial-gradient(ellipse at 100% 0%, ${c1.primary}40 0%, transparent 45%),
      radial-gradient(ellipse at 0% 100%, ${c2.primary}40 0%, transparent 45%),
      linear-gradient(135deg, ${c1.dark} 0%, #050505 50%, ${c2.dark} 100%)
    `,
  };

  if (loading) {
    return (
      <main className="min-h-screen text-white flex items-center justify-center" style={pageBg}>
        <p className="opacity-60">Loading punter card…</p>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="min-h-screen text-white flex flex-col items-center justify-center p-6" style={pageBg}>
        <p className="text-lg opacity-80 mb-2">Punter card not available yet</p>
        <p className="text-sm opacity-50 max-w-xs text-center">
          This match&apos;s card opens at midnight on match day, or as soon as we have enough player data.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-6 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm border border-white/20"
        >
          Back
        </button>
      </main>
    );
  }

  const startLabel = match?.startTime
    ? new Date(match.startTime).toLocaleDateString("en-IN", { day: "numeric", month: "short" }).toUpperCase()
    : "";
  const startTimeLabel = match?.startTime
    ? new Date(match.startTime).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()
    : "";

  return (
    <main className="min-h-screen text-white pb-32 relative overflow-hidden" style={pageBg}>
      {/* Watermark — giant faded "JAFFA" wordmark behind everything for the
          NFT-card depth. Pointer-events off so it never intercepts taps. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 flex items-center justify-center select-none"
        style={{ zIndex: 0 }}
      >
        <span
          style={{
            fontFamily: "'Bungee', 'Impact', cursive",
            fontSize: "32vw",
            color: "rgba(255,255,255,0.025)",
            letterSpacing: "-0.05em",
            transform: "rotate(-8deg)",
          }}
        >
          JAFFA
        </span>
      </div>

      {/* Sticky header — back arrow + title + share/copy buttons. */}
      <div
        className="sticky top-0 z-20 backdrop-blur-md"
        style={{ background: "rgba(8,8,8,0.65)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-white/10 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-60">Punter Card</p>
            <p
              className="text-base font-black uppercase truncate leading-tight"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              {t1} <span className="opacity-40 mx-1">VS</span> {t2}
            </p>
          </div>
          {(allAnswered || shareMode === "results") && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="p-2 sm:px-3 sm:py-2 rounded-xl border border-orange-500/60 text-orange-300 hover:bg-orange-500/15 text-xs font-bold flex items-center gap-1.5 transition"
                title="Copy link to this card"
              >
                <LinkIcon className="w-4 h-4" />
                <span className="hidden sm:inline uppercase tracking-wider">Link</span>
              </button>
              <button
                onClick={handleShare}
                disabled={sharing}
                className="p-2 sm:px-3 sm:py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-60"
                title={shareMode === "results" ? "Share final result image" : "Share card image"}
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline uppercase tracking-wider">
                  {shareMode === "results" ? "Share Results" : "Share"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hero — stacked-glass team badge pill (Chelsea/Everton reference vibe).
          Date stacked at top, then both team crests with a "VS" between, then
          start time. Sits inside the saturated page gradient so the brand
          colours of both teams feel present even before scrolling. */}
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-4 relative z-10">
        <div className="flex justify-center">
          <div
            className="flex flex-col items-center gap-3 px-7 py-5 rounded-3xl"
            style={{
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: `0 0 60px ${c1.primary}22, inset 0 1px 0 rgba(255,255,255,0.1)`,
              minWidth: 200,
            }}
          >
            <span className="text-[10px] uppercase tracking-[0.3em] opacity-70 font-bold">{startLabel}</span>
            <TeamBadge short={t1} size={64} />
            <span className="text-[10px] font-black opacity-50 tracking-[0.4em]">VS</span>
            <TeamBadge short={t2} size={64} />
            {startTimeLabel && (
              <span className="text-[10px] uppercase tracking-[0.25em] opacity-60 font-bold">{startTimeLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* Body — chunky question cards. The "Pick a venue first" banner
          that used to live here is gone now that venueId always falls
          back to GLOBAL_VENUE_ID for global users — every page render
          has a working venueId, so the lock-in CTA is never gated. */}
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4 relative z-10">
        {questions.map((q) => {
          const isOpen = !!expanded[q.id];
          const isPool = POOL_TEMPLATES.has(q.templateKey);
          const answered = !!q.userAnswer;
          const locked = answered;
          const resolved = q.status === "resolved" && q.correctOption;
          const voided = isVoidedQuestion(q);

          // Status pill computed once per card. Mirrors the four-state vibe
          // from the reference: PENDING (orange) / LOCKED (blue) / +PTS
          // (emerald) / MISSED (rose). Drives both the pill at the top of
          // the card and indirectly the user's at-a-glance progress sense.
          const pill = resolved
            ? voided
              ? { label: "VOIDED",                           bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.20)", text: "rgba(255,255,255,0.62)" }
              : q.userAnswer?.isCorrect
              ? { label: `+${q.userAnswer.pointsEarned} PTS`, bg: "rgba(16,185,129,0.18)", border: "rgba(16,185,129,0.55)", text: "#34d399" }
              : { label: "MISSED",                           bg: "rgba(244,63,94,0.18)",  border: "rgba(244,63,94,0.55)",  text: "#fb7185" }
            : answered
              ? { label: "LOCKED",                            bg: "rgba(59,130,246,0.18)", border: "rgba(59,130,246,0.55)", text: "#60a5fa" }
              : { label: "PENDING",                           bg: "rgba(251,146,60,0.18)", border: "rgba(251,146,60,0.55)", text: "#fb923c" };

          return (
            <div
              key={q.id}
              className="rounded-3xl overflow-hidden transition-shadow"
              style={{
                background: "rgba(15,15,18,0.65)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "2px solid rgba(255,255,255,0.10)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.25)",
              }}
            >
              <button
                onClick={() => toggleExpand(q.id)}
                className="w-full text-left px-5 py-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                    style={{ background: pill.bg, color: pill.text, border: `1px solid ${pill.border}` }}
                  >
                    {pill.label}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 opacity-60" />
                  ) : (
                    <ChevronDown className="w-5 h-5 opacity-60" />
                  )}
                </div>
                <p
                  className="text-base sm:text-lg font-black uppercase leading-tight"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  {q.question}
                </p>
                {answered && (
                  <p className="text-xs opacity-70 mt-2 truncate">
                    PICKED:{" "}
                    <span className="text-orange-300 font-bold">
                      {q.options.find((o) => o.key === q.userAnswer!.selectedOption)?.label || q.userAnswer!.selectedOption}
                    </span>
                  </p>
                )}
              </button>

              {isOpen && (
                <div className={`px-3 pb-4 ${isPool ? "grid grid-cols-2 gap-2" : "space-y-2"}`}>
                  {q.options.map((opt) => {
                    const selected = selections[q.id] === opt.key;
                    const isCorrect = resolved && isCorrectOptionKey(q, opt.key);
                    const isWrong =
                      resolved && !voided && q.userAnswer?.selectedOption === opt.key && !q.userAnswer.isCorrect;

                    let bg: string, border: string, glow: string;
                    if (isCorrect) {
                      bg = "rgba(16,185,129,0.18)"; border = "#10b981"; glow = "0 0 20px rgba(16,185,129,0.5)";
                    } else if (isWrong) {
                      bg = "rgba(244,63,94,0.18)"; border = "#f43f5e"; glow = "0 0 20px rgba(244,63,94,0.5)";
                    } else if (selected) {
                      bg = "rgba(255,99,65,0.22)"; border = "#ff6341"; glow = "0 0 22px rgba(255,99,65,0.55)";
                    } else {
                      bg = "rgba(255,255,255,0.04)"; border = "rgba(255,255,255,0.12)"; glow = "none";
                    }

                    return (
                      <button
                        key={opt.key}
                        disabled={locked}
                        onClick={() => handleSelect(q.id, opt.key)}
                        className={`flex items-center justify-between px-4 py-3 rounded-2xl text-left text-sm font-semibold transition ${
                          locked ? "cursor-default" : "cursor-pointer hover:scale-[1.01]"
                        }`}
                        style={{
                          background: bg,
                          border: `2px solid ${border}`,
                          boxShadow: glow,
                        }}
                      >
                        <span className="truncate">{opt.label}</span>
                        <span
                          className="text-[11px] font-black ml-3 px-2 py-1 rounded-lg whitespace-nowrap"
                          style={{
                            background: "rgba(123,228,255,0.14)",
                            color: "#7be4ff",
                            textShadow: "0 0 8px rgba(123,228,255,0.55)",
                          }}
                        >
                          {opt.points} PTS
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky bottom Lock-In bar — floating glass-morphism panel inset
          from the screen edges, mirroring the separate stats panel from the
          reference card. */}
      {!allAnswered && (
        <div className="fixed bottom-4 left-4 right-4 z-30 pointer-events-none">
          <div
            className="max-w-3xl mx-auto flex items-center gap-3 px-5 py-3 rounded-2xl pointer-events-auto"
            style={{
              background: "rgba(8,8,10,0.85)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
            }}
          >
            <p className="text-xs sm:text-sm font-bold flex-1 uppercase tracking-wider">
              {pendingSelections.length > 0
                ? `${pendingSelections.length} pick${pendingSelections.length === 1 ? "" : "s"} ready`
                : "Tap options to fill your card"}
            </p>
            <button
              onClick={handleLockIn}
              disabled={!canLock || submitting}
              className={`px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider transition ${
                canLock && !submitting
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              }`}
            >
              {submitting ? "Locking…" : "Lock In"}
            </button>
          </div>
        </div>
      )}

      {/* Hidden render-to-image share card. Positioned off-screen but in the
          layout tree so html-to-image can rasterize it. 1080×1920 is the
          Instagram Story / 9:16 portrait size — also fits Snapchat,
          WhatsApp Status, and TikTok story crops without letterboxing. */}
      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        <ShareCard ref={shareRef} match={match} questions={questions} selections={selections} mode={shareMode} debug={debug} />
      </div>

      <PunterCardShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        imageDataUrl={shareDataUrl}
        imageBlob={shareBlob}
        shareText={
          shareMode === "results"
            ? `My ${t1} vs ${t2} Punter Card · ${finalScored} pts · playjaffa.com 🏏`
            : `My ${t1} vs ${t2} Punter Card · playjaffa.com 🏏`
        }
        filename={
          t1 && t2
            ? `${t1} vs ${t2}-punter-card${shareMode === "results" ? "-results" : ""}.jpg`
            : `punter-card${shareMode === "results" ? "-results" : ""}.jpg`
        }
      />
    </main>
  );
}

// ---- Share card (rendered off-screen, rasterized to PNG on Share) ----

// Sentinels mirroring backend constants in services/pointsEngine.ts
// (ALL_CORRECT_OPTION) and services/punterCard.ts (VOID_OPTION). Kept in
// sync via grep — these literal strings should change here only if they
// change there.
const ALL_CORRECT_OPTION = "__all__";
const VOID_OPTION = "__void__";

function correctOptionKeys(q: Question): string[] {
  return (q.correctOption || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isVoidedQuestion(q: Question): boolean {
  return q.status === "voided" || q.correctOption === VOID_OPTION;
}

function isCorrectOptionKey(q: Question, key: string): boolean {
  if (isVoidedQuestion(q)) return false;
  return correctOptionKeys(q).includes(key);
}

function correctOptionLabels(q: Question): string[] {
  return correctOptionKeys(q)
    .filter((key) => key !== VOID_OPTION)
    .map((key) => q.options.find((o) => o.key === key)?.label)
    .filter(Boolean) as string[];
}

type ShareCardMode = "picks" | "results";

// Per-question render state used by the post-match results mode. Derived
// from userAnswer.isCorrect + question.correctOption + question.status.
type ResultState =
  | { kind: "correct"; points: number }
  | { kind: "wrong"; correctLabels: string[] }
  | { kind: "pending" }
  | { kind: "voided" };

const ShareCard = forwardRef<HTMLDivElement, {
  match: any;
  questions: Question[];
  selections: Record<string, string>;
  mode: ShareCardMode;
  debug?: boolean;
}>(function ShareCard({ match, questions, selections, mode, debug }, ref) {
  const t1 = match?.team1Short || match?.team1 || "T1";
  const t2 = match?.team2Short || match?.team2 || "T2";
  const t1Logo = getTeamLogoDataUrl(t1);
  const t2Logo = getTeamLogoDataUrl(t2);
  const isResults = mode === "results";

  // Date badge (top-right): "8 MAY" — uppercase day-month abbreviation.
  const startLabel = match?.startTime
    ? new Date(match.startTime)
        .toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        .toUpperCase()
    : "";

  // Stable order: every match's row N is the same template across cards.
  // Anything not in ROW_ORDER (legacy templateKey from an archived card)
  // slots in at the tail.
  const ordered = [...questions].sort((a, b) => {
    const ai = ROW_ORDER.indexOf(a.templateKey);
    const bi = ROW_ORDER.indexOf(b.templateKey);
    const ax = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bx = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return ax - bx;
  });

  // Pad / truncate to exactly 10 rows. The template draws 10 stripes; we
  // never render more, never render fewer.
  const ROW_COUNT = SLOTS.rowCount;
  const rows: Array<Question | null> = ordered.slice(0, ROW_COUNT);
  while (rows.length < ROW_COUNT) rows.push(null);

  // Per-row data: question label, user pick, points-glow text. picksMode =
  // selectedOption.points (potential); resultsMode = pointsEarned (or
  // VOID/—).
  const rowData = rows.map((q) => {
    if (!q) return { label: "", answer: "—", glow: "—", potentialPts: 0 };
    const selectedKey = q.userAnswer?.selectedOption || selections[q.id] || "";
    const opt = q.options.find((o) => o.key === selectedKey);
    const answerLabel = opt?.label || "—";
    const potentialPts = opt?.points || 0;

    let glow: string;
    if (isResults) {
      if (isVoidedQuestion(q)) glow = "VOID";
      else if (q.userAnswer?.isCorrect === true)
        glow = `${q.userAnswer.pointsEarned} PTS`;
      else if (q.userAnswer?.isCorrect === false) glow = "0 PTS";
      else glow = "—";
    } else {
      glow = potentialPts > 0 ? `${potentialPts} PTS` : "—";
    }

    return {
      label: shortLabelFor(q.templateKey, q.question),
      answer: answerLabel,
      glow,
      potentialPts,
    };
  });

  // MAX POTENTIAL = sum of selectedOption.points across all answered rows.
  // The card is "worth" this many points if every pick resolves correct.
  const maxPotential = rowData.reduce((s, r) => s + r.potentialPts, 0);

  // Row vertical layout: divide the rows-stripe band evenly into ROW_COUNT
  // stripes with ROW_GAP percentage between adjacent rows.
  const rowsTopPct = parseFloat(SLOTS.rowsTop);
  const rowsHeightPct = parseFloat(SLOTS.rowsHeight);
  const rowGapPct = SLOTS.rowGap;
  const totalGapPct = rowGapPct * (ROW_COUNT - 1);
  const rowHeightPct = (rowsHeightPct - totalGapPct) / ROW_COUNT;

  return (
    <div
      ref={ref}
      style={{
        width: TEMPLATE.width,
        height: TEMPLATE.height,
        position: "relative",
        backgroundImage: "url(/punter-card/template.png)",
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#0d2bb3",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* [1] Date badge — top-right rounded box. Single centred text,
          CSS-only overflow handling. */}
      <Slot at={SLOTS.dateBadge} center debug={debug}>
        <div
          style={{
            fontFamily: "'Bungee', 'Impact', cursive",
            fontSize: HEADER.badgeFontPx,
            letterSpacing: 2,
            color: "#ffffff",
            textShadow: "0 0 12px rgba(123,200,255,0.65)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            paddingLeft: 8,
            paddingRight: 8,
            boxSizing: "border-box",
          }}
        >
          {startLabel}
        </div>
      </Slot>

      {/* [2] Header — left circle (Team A logo). Logo sized at HEADER.logoFitPct
          (65%) of the slot, centered, contain-fit, never cropped. */}
      <Slot at={SLOTS.leftCircle} center debug={debug}>
        {t1Logo && (
          <img
            src={t1Logo}
            alt={t1}
            style={{
              width: `${HEADER.logoFitPct}%`,
              height: `${HEADER.logoFitPct}%`,
              objectFit: "contain",
            }}
          />
        )}
      </Slot>

      {/* [2] Header — right circle (Team B logo). */}
      <Slot at={SLOTS.rightCircle} center debug={debug}>
        {t2Logo && (
          <img
            src={t2Logo}
            alt={t2}
            style={{
              width: `${HEADER.logoFitPct}%`,
              height: `${HEADER.logoFitPct}%`,
              objectFit: "contain",
            }}
          />
        )}
      </Slot>

      {/* [2] Header — left pill (Team A short). CSS overflow handles
          unusually long shorts (e.g. PBKS) without escaping the pill. */}
      <Slot at={SLOTS.pillLeft} center debug={debug}>
        <div
          style={{
            fontFamily: "'Bungee', 'Impact', cursive",
            fontSize: HEADER.pillFontPx,
            letterSpacing: 2,
            color: "#ffffff",
            textShadow: "0 0 18px rgba(123,200,255,0.75)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            paddingLeft: 12,
            paddingRight: 12,
            boxSizing: "border-box",
          }}
        >
          {t1}
        </div>
      </Slot>

      {/* [2] Header — right pill (Team B short). */}
      <Slot at={SLOTS.pillRight} center debug={debug}>
        <div
          style={{
            fontFamily: "'Bungee', 'Impact', cursive",
            fontSize: HEADER.pillFontPx,
            letterSpacing: 2,
            color: "#ffffff",
            textShadow: "0 0 18px rgba(123,200,255,0.75)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            paddingLeft: 12,
            paddingRight: 12,
            boxSizing: "border-box",
          }}
        >
          {t2}
        </div>
      </Slot>

      {/* [3] 10 prediction rows. Each stripe is a bounded flex container:
          a left text column (label stacked over answer, vertically centred)
          and a right points badge (fixed width). Padding/overflow is
          enforced by CSS — no absolute positioning, no JS truncation. */}
      {rowData.map((row, i) => {
        const top = rowsTopPct + i * (rowHeightPct + rowGapPct);
        const rowRect: Rect = {
          top: `${top}%`,
          left: "0",
          right: "0",
          height: `${rowHeightPct}%`,
        };
        return (
          <Slot key={i} at={rowRect} debug={debug}>
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                paddingLeft: ROW.padX,
                paddingRight: ROW.padX,
                paddingTop: ROW.padY,
                paddingBottom: ROW.padY,
                boxSizing: "border-box",
                gap: ROW.gap,
              }}
            >
              {/* Left text column — label on top, answer below, centred
                  vertically. minWidth:0 lets the CSS ellipsis pipeline
                  kick in on long names. */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontSize: ROW.labelFontPx,
                    lineHeight: 1.15,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    color: "rgba(255,255,255,0.65)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    fontFamily: "'Bungee', 'Impact', cursive",
                    fontSize: ROW.answerFontPx,
                    lineHeight: 1.1,
                    color: "#ffffff",
                    textShadow: "0 0 10px rgba(123,200,255,0.5)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.answer}
                </div>
              </div>

              {/* Points badge — fixed width, centred text, ellipsis if
                  somehow overflowed. */}
              <div
                style={{
                  width: `${ROW.pointsWidthPct}%`,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Bungee', 'Impact', cursive",
                  fontSize: ROW.pointsFontPx,
                  color: "#bfe2ff",
                  textShadow: "0 0 12px rgba(123,200,255,0.85)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  paddingLeft: 6,
                  paddingRight: 6,
                  boxSizing: "border-box",
                }}
              >
                {row.glow}
              </div>
            </div>
          </Slot>
        );
      })}

      {/* [4] Bottom-left — MAX POTENTIAL label + total. Flex column,
          centred vertically inside the rounded box. */}
      <Slot at={SLOTS.maxPotential} debug={debug}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            paddingLeft: FOOTER.padX,
            paddingRight: FOOTER.padX,
            boxSizing: "border-box",
            gap: 4,
          }}
        >
          <div
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: FOOTER.maxPotLabelPx,
              fontWeight: 700,
              letterSpacing: 2,
              opacity: 0.75,
              color: "#ffffff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            MAX POTENTIAL
          </div>
          <div
            style={{
              fontFamily: "'Bungee', 'Impact', cursive",
              fontSize: FOOTER.maxPotValuePx,
              lineHeight: 1.05,
              color: "#ffd60a",
              textShadow: "0 0 18px rgba(255,214,10,0.6)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {maxPotential} PTS
          </div>
        </div>
      </Slot>

      {/* [5] Bottom-right — CTA stack. Flex column, right-aligned, three
          stacked lines centred vertically inside the rounded box. */}
      <Slot at={SLOTS.cta} debug={debug}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-end",
            textAlign: "right",
            paddingLeft: FOOTER.padX,
            paddingRight: FOOTER.padX,
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#ffffff",
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: FOOTER.ctaLine1Px,
              fontWeight: 700,
              opacity: 0.9,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            Predict from anywhere
          </div>
          <div
            style={{
              fontSize: FOOTER.ctaLine2Px,
              opacity: 0.65,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            Enjoy your rewards
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: FOOTER.ctaLine3Px,
              letterSpacing: 1.5,
              fontFamily: "'Bungee', 'Impact', cursive",
              color: "#bfe2ff",
              textShadow: "0 0 14px rgba(123,200,255,0.85)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            PLAYJAFFA.COM
          </div>
        </div>
      </Slot>
    </div>
  );
});

// Tiny helper: renders an absolutely-positioned overlay box at the given
// slot rectangle. `center` flips the box into a centred flex container so
// children land in the middle of the slot (used for badges/circles/pills).
// `debug` paints a red border + translucent fill so the ?debug=1 share
// JPEG visualises every slot rectangle for alignment calibration.
function Slot({
  at,
  center,
  debug,
  children,
}: {
  at: Rect;
  center?: boolean;
  debug?: boolean;
  children?: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    top: at.top,
    left: at.left,
    right: at.right,
    bottom: at.bottom,
    width: at.width,
    height: at.height,
    boxSizing: "border-box",
    ...(debug ? {
      border: "2px solid rgba(255,0,0,0.85)",
      background: "rgba(255,0,0,0.10)",
    } : {}),
  };
  if (center) {
    style.display = "flex";
    style.alignItems = "center";
    style.justifyContent = "center";
  }
  return <div style={style}>{children}</div>;
}
