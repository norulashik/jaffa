"use client";

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Share2, ArrowLeft, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { toJpeg } from "html-to-image";
import { api } from "@/lib/api";
import { JAFFA_LOGO_DATA_URL } from "./jaffaLogo";
import { getTeamLogoDataUrl } from "./teamLogos";
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
    // Captured BEFORE the refresh so we can detect the false→true edge
    // and auto-open the share modal exactly on the completing Lock In.
    const wasAllAnswered = allAnswered;
    try {
      const res = await api.submitPunterCard(matchId, venueId, pendingSelections);
      toast.success(`Locked in ${res.saved} pick${res.saved === 1 ? "" : "s"}`);
      // Refresh
      const refreshed = await api.getPunterCard(matchId, venueId);
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
  // auto-open after the completing Lock In. Same JPEG settings as before:
  // pixelRatio 1.5 + quality 0.92 keeps the file under ~700KB which is the
  // ceiling iOS WhatsApp's "Send to" share sheet enforces. cacheBust stays
  // OFF so the embedded logo isn't raced by the rasterizer.
  const openShareModal = async () => {
    if (!shareRef.current || sharing) return;
    setSharing(true);
    try {
      // Wait for every embedded image (team crests etc.) to decode before
      // snapshotting — html-to-image otherwise paints before async decode
      // finishes and ships incomplete frames.
      const imgs = Array.from(shareRef.current.querySelectorAll("img"));
      await Promise.allSettled(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return img.decode().catch(() => undefined);
        })
      );
      // Pre-decode the JAFFA logo separately. We composite it onto the
      // rasterized JPEG by hand (see canvas pass below) instead of relying
      // on html-to-image's foreignObject pipeline, which silently dropped
      // the ~180KB data-URL <img> on ~half of iOS Safari renders. By
      // running drawImage ourselves on a native canvas, the logo always
      // lands.
      const jaffaImg = new Image();
      jaffaImg.src = JAFFA_LOGO_DATA_URL;
      await jaffaImg.decode().catch(() => undefined);

      // One animation frame so layout settles after any decode-triggered
      // reflow before we capture pixels.
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const PIXEL_RATIO = 1.5;
      const baseDataUrl = await toJpeg(shareRef.current, {
        pixelRatio: PIXEL_RATIO,
        quality: 0.92,
        backgroundColor: "#1a0033",
      });

      // Canvas composite: draw the rasterized card, then draw the JAFFA
      // logo on top at the placeholder slot's position. Position is read
      // from the live DOM (data-jaffa-logo-slot) so any layout change to
      // the slot's size or position is automatically reflected.
      let dataUrl = baseDataUrl;
      try {
        const baseImg = new Image();
        baseImg.src = baseDataUrl;
        await baseImg.decode();

        const slot = shareRef.current.querySelector("[data-jaffa-logo-slot]") as HTMLElement | null;
        const cardRect = shareRef.current.getBoundingClientRect();

        const canvas = document.createElement("canvas");
        canvas.width = baseImg.naturalWidth;
        canvas.height = baseImg.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 2d context unavailable");
        ctx.drawImage(baseImg, 0, 0);

        if (slot && jaffaImg.naturalWidth > 0) {
          const slotRect = slot.getBoundingClientRect();
          const x = (slotRect.left - cardRect.left) * PIXEL_RATIO;
          const y = (slotRect.top - cardRect.top) * PIXEL_RATIO;
          const w = slotRect.width * PIXEL_RATIO;
          const h = slotRect.height * PIXEL_RATIO;

          // Soft drop-shadow under the logo so the composited result
          // matches the visual treatment we used to ship via CSS filter.
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.55)";
          ctx.shadowBlur = 40 * PIXEL_RATIO;
          ctx.shadowOffsetY = 12 * PIXEL_RATIO;
          ctx.drawImage(jaffaImg, x, y, w, h);
          ctx.restore();
        }

        dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      } catch (compositeErr) {
        // If the composite pass fails for any reason fall back to the
        // (logo-less) base image so the user still gets SOMETHING. Logged
        // so we notice if this branch ever fires in practice.
        console.error("[ShareCard] logo composite failed, falling back to base:", compositeErr);
      }

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
          {allAnswered && (
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
                title="Share card image"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline uppercase tracking-wider">Share</span>
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

          // Status pill computed once per card. Mirrors the four-state vibe
          // from the reference: PENDING (orange) / LOCKED (blue) / +PTS
          // (emerald) / MISSED (rose). Drives both the pill at the top of
          // the card and indirectly the user's at-a-glance progress sense.
          const pill = resolved
            ? q.userAnswer?.isCorrect
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
                    const isCorrect = resolved && q.correctOption === opt.key;
                    const isWrong =
                      resolved && q.userAnswer?.selectedOption === opt.key && !q.userAnswer.isCorrect;

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
        <ShareCard ref={shareRef} match={match} questions={questions} selections={selections} />
      </div>

      <PunterCardShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        imageDataUrl={shareDataUrl}
        imageBlob={shareBlob}
        shareText={`My ${t1} vs ${t2} Punter Card · playjaffa.com 🏏`}
        filename={t1 && t2 ? `${t1} vs ${t2}-punter-card.jpg` : "punter-card.jpg"}
      />
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

  // Per-match palette: same teamColors map the in-app page uses, so the
  // shared image and the in-app view stay visually consistent for any
  // given fixture.
  const shareC1 = getTeamColor(t1);
  const shareC2 = getTeamColor(t2);
  const t1Logo = getTeamLogoDataUrl(t1);
  const t2Logo = getTeamLogoDataUrl(t2);

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
        height: 1920,
        padding: 56,
        // Per-match gradient driven by the playing teams' brand colours
        // (CSK vs KKR → mustard → deep purple, LSG vs KKR → steel-blue →
        // purple, etc.). Two soft "lightning" radials at opposite corners
        // in each team's primary keep the energetic, glassy look the
        // reference image had without needing extra SVG art.
        background: `
          radial-gradient(ellipse at 12% 18%, ${shareC1.primary}88 0%, transparent 42%),
          radial-gradient(ellipse at 88% 82%, ${shareC2.primary}88 0%, transparent 42%),
          linear-gradient(135deg, ${shareC1.dark} 0%, #050505 50%, ${shareC2.dark} 100%)
        `,
        color: "white",
        fontFamily: "'Bungee', 'Impact', cursive",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Date pill — anchored to the OUTER card edge (top: 56 / right: 56
          matches the card padding) so it can never clip into the header,
          regardless of how tall the logo is. nowrap forces single-line so
          "30 SEPT" can't break across rows. */}
      <div
        style={{
          position: "absolute",
          top: 56,
          right: 56,
          fontSize: 28,
          padding: "8px 22px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.28)",
          backdropFilter: "blur(8px)",
          letterSpacing: 1,
          whiteSpace: "nowrap",
          zIndex: 3,
        }}
      >
        {startLabel}
      </div>

      {/* Header — JAFFA brand mark slot. The logo image is NOT rendered
          here; it's composited onto the rasterized JPEG by openShareModal's
          canvas pass. We were previously embedding <img src={data:...}>
          and html-to-image's foreignObject path silently dropped the
          ~180KB data URL on roughly half of iOS Safari rasterizations,
          shipping logo-less share images. The placeholder div below
          reserves the same layout footprint (height 520, no width since
          the logo is centered horizontally), and a `data-jaffa-logo-slot`
          attribute lets the composite pass find this exact box at runtime
          to position the logo over the right pixels. */}
      <div style={{ position: "relative", marginBottom: 20, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 480 }}>
        <div
          data-jaffa-logo-slot
          aria-label="JAFFA"
          role="img"
          style={{
            height: 520,
            // Aspect ratio matches the source PNG (1280x720 ≈ 16:9).
            // Pinning a width keeps the layout stable in the off-screen
            // measurement pass — the composite step uses this box's
            // bounding rect as the destination rectangle for drawImage.
            width: 924,
          }}
        />
      </div>

      {/* Glassmorphism inner card */}
      <div
        style={{
          flex: 1,
          padding: "32px 36px",
          borderRadius: 28,
          background: "rgba(255,255,255,0.07)",
          border: "2px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 0 80px rgba(180,40,220,0.45), inset 0 0 40px rgba(255,255,255,0.04)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Title block — team logos flanking the short codes for the
            chunky, NFT-style banner the user asked for. Each logo sits in
            a glass-morphism circle so it reads cleanly over the gradient
            regardless of the team's brand colour. */}
        <div>
          <div style={{ fontSize: 24, opacity: 0.7, letterSpacing: 4, fontFamily: "'Bungee', 'Impact', cursive" }}>
            PUNTER CARD
          </div>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 24,
              fontFamily: "'Bungee', 'Impact', cursive",
            }}
          >
            {t1Logo && (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "2px solid rgba(255,255,255,0.22)",
                  boxShadow: `0 0 30px ${shareC1.primary}66`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <img
                  src={t1Logo}
                  alt={t1}
                  style={{ width: 92, height: 92, objectFit: "contain" }}
                />
              </div>
            )}
            <div
              style={{
                fontSize: 80,
                lineHeight: 1,
                letterSpacing: 1,
                textShadow: "0 0 30px rgba(255,255,255,0.35)",
                whiteSpace: "nowrap",
              }}
            >
              {t1} <span style={{ opacity: 0.4, fontSize: 56 }}>VS</span> {t2}
            </div>
            {t2Logo && (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "2px solid rgba(255,255,255,0.22)",
                  boxShadow: `0 0 30px ${shareC2.primary}66`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginLeft: "auto",
                }}
              >
                <img
                  src={t2Logo}
                  alt={t2}
                  style={{ width: 92, height: 92, objectFit: "contain" }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Picks list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {picks.map((p, i) => (
            <div
              key={i}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: "12px 20px",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div style={{ flex: 1, fontFamily: "system-ui, -apple-system, sans-serif" }}>
                <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 2, fontWeight: 500 }}>{p.question}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{p.pick}</div>
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
