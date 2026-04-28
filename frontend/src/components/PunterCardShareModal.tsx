"use client";

import { useEffect, useMemo } from "react";
import { Download, Share2, X } from "lucide-react";
import { toast } from "sonner";

// Punter card share sheet.
//
// Two actions only:
//   - Save     → triggers an <a download> click; image lands in the user's
//                downloads / camera roll.
//   - Share to → calls navigator.share with the JPEG attached. iOS / Android
//                pop the system share sheet which already includes WhatsApp,
//                Insta, Snap, Messages, etc. with the IMAGE attached, not
//                just the text.
//
// We previously had per-app buttons (WhatsApp / Insta / Snap) that triggered
// a download then opened the deep link. That was misleading: the deep link
// opens the app but the URL can't carry a file payload, so the image stayed
// in the user's camera roll and the app received only the share text. Users
// reported the punter card "wasn't being shared" — exactly because of this.
// Honest fix: delegate to the OS share sheet which is the only path that
// actually attaches the image cross-platform.

interface Props {
  open: boolean;
  onClose: () => void;
  imageDataUrl: string | null;
  imageBlob: Blob | null;
  shareText: string;
  // Per-match filename for the Save download + the File passed to
  // navigator.share. Lets two cards from different matches coexist in the
  // Downloads folder without browser-appended " (1)" suffixes.
  filename?: string;
}

export default function PunterCardShareModal({
  open,
  onClose,
  imageDataUrl,
  imageBlob,
  shareText,
  filename,
}: Props) {
  const downloadName = filename || "punter-card.jpg";
  // Lock body scroll while open so the dim layer feels modal-correct.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // navigator.canShare is gated on the browser supporting files-share.
  // Most desktop and older Android lack it. When unsupported, fall back
  // to a Save-only mode and tell the user how to share.
  const canNativeShare = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    if (!imageBlob) return false;
    const navAny = navigator as any;
    if (typeof navAny.canShare !== "function") return false;
    try {
      const file = new File([imageBlob], downloadName, { type: "image/jpeg" });
      return !!navAny.canShare({ files: [file] });
    } catch {
      return false;
    }
  }, [imageBlob, downloadName]);

  if (!open) return null;

  const handleSave = () => {
    if (!imageDataUrl) return;
    const a = document.createElement("a");
    a.href = imageDataUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Saved to your photos");
  };

  const handleShare = async () => {
    if (!imageBlob) return;
    try {
      const file = new File([imageBlob], downloadName, { type: "image/jpeg" });
      await (navigator as any).share({ files: [file], text: shareText });
    } catch {
      // User cancelled — silent.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md mx-2 mb-2 sm:mb-0 rounded-3xl p-5 relative"
        style={{
          background: "rgba(20,20,24,0.95)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-white/10 text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <p className="text-[10px] uppercase tracking-[0.3em] opacity-60 font-bold mb-3 text-center">
          Punter Card Ready
        </p>

        {imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageDataUrl}
            alt="Punter card preview"
            className="w-full rounded-2xl mx-auto"
            style={{
              maxHeight: 380,
              objectFit: "contain",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          />
        ) : (
          <div
            className="w-full rounded-2xl flex items-center justify-center"
            style={{ height: 380, background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-sm opacity-60">Generating preview…</p>
          </div>
        )}

        {/* Two-button row. Share is the primary CTA when the OS supports
            file-attached share sheets (every modern phone); otherwise we
            hide it and Save is the only path. */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black uppercase tracking-wider transition active:scale-95"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#fff",
            }}
          >
            <Download className="w-4 h-4" />
            Save
          </button>
          {canNativeShare && (
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black uppercase tracking-wider transition active:scale-95"
              style={{
                background: "#ff6341",
                color: "#000",
                border: "1px solid #ff6341",
                boxShadow: "0 6px 20px rgba(255,99,65,0.45)",
              }}
            >
              <Share2 className="w-4 h-4" />
              Share to…
            </button>
          )}
        </div>

        {!canNativeShare && (
          <p className="text-[11px] text-white/55 mt-3 text-center">
            Tap Save, then attach the image from your camera roll in any app.
          </p>
        )}
      </div>
    </div>
  );
}
