"use client";

import { useEffect, useMemo } from "react";
import { Download, MessageCircle, Camera, Ghost, Share2, X } from "lucide-react";
import { toast } from "sonner";

// Spotify-style share sheet for the punter card.
//
// Shows the rendered card image as a preview, then a row of platform
// shortcuts: Save (download), WhatsApp, Instagram, Snapchat, More.
//
// Reality: only "More" can attach the actual image cross-platform via
// navigator.share. The platform-specific buttons trigger a download FIRST
// then deep-link into the app, with a toast that tells the user to paste
// the saved image. It's two steps but it's honest about what the OS allows.

interface Props {
  open: boolean;
  onClose: () => void;
  imageDataUrl: string | null;
  imageBlob: Blob | null;
  shareText: string;
}

export default function PunterCardShareModal({
  open,
  onClose,
  imageDataUrl,
  imageBlob,
  shareText,
}: Props) {
  // Lock body scroll while open so the dim layer feels modal-correct.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // navigator.canShare is gated on having a File AND the browser supporting
  // it (most desktop and older Android lack files-share). Hide the More
  // button when unsupported so we don't ship a button that nukes silently.
  const canNativeShare = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    if (!imageBlob) return false;
    const navAny = navigator as any;
    if (typeof navAny.canShare !== "function") return false;
    try {
      const file = new File([imageBlob], "punter-card.jpg", { type: "image/jpeg" });
      return !!navAny.canShare({ files: [file] });
    } catch {
      return false;
    }
  }, [imageBlob]);

  if (!open) return null;

  const triggerDownload = () => {
    if (!imageDataUrl) return;
    const a = document.createElement("a");
    a.href = imageDataUrl;
    a.download = "punter-card.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSave = () => {
    triggerDownload();
    toast.success("Saved to your photos");
  };

  const handleWhatsApp = () => {
    triggerDownload();
    // wa.me only carries text — image stays in the camera roll for the
    // user to attach manually. Honest copy in the toast.
    toast.success("Image saved — paste it into the chat");
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const handleInstagram = () => {
    triggerDownload();
    toast.success("Image saved — open from your camera roll in Instagram");
    // instagram-stories:// is the documented deep link but only works when
    // the app is installed and the page lives at a verified origin. Fall
    // back to the web profile if it doesn't open.
    window.location.href = "instagram://library?LocalIdentifier=";
    setTimeout(() => {
      // If the deep link didn't intercept within 800ms the page is still
      // here; open the web app as a fallback so the user has somewhere to
      // go.
      window.open("https://www.instagram.com/", "_blank");
    }, 800);
  };

  const handleSnapchat = () => {
    triggerDownload();
    toast.success("Image saved — attach it in Snap");
    window.location.href = "snapchat://";
    setTimeout(() => {
      window.open("https://www.snapchat.com/", "_blank");
    }, 800);
  };

  const handleMore = async () => {
    if (!imageBlob) return;
    try {
      const file = new File([imageBlob], "punter-card.jpg", { type: "image/jpeg" });
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

        <p className="text-xs uppercase tracking-widest opacity-60 mt-5 mb-3 font-bold">
          Share to
        </p>
        <div className="flex justify-between gap-2">
          <ShareButton icon={<Download className="w-5 h-5" />} label="Save"      onClick={handleSave} />
          <ShareButton icon={<MessageCircle className="w-5 h-5" />} label="WhatsApp"  onClick={handleWhatsApp} accent="#25D366" />
          <ShareButton icon={<Camera className="w-5 h-5" />} label="Instagram" onClick={handleInstagram} accent="#E1306C" />
          <ShareButton icon={<Ghost className="w-5 h-5" />}  label="Snapchat"  onClick={handleSnapchat}  accent="#FFFC00" accentText="#000" />
          {canNativeShare && (
            <ShareButton icon={<Share2 className="w-5 h-5" />} label="More" onClick={handleMore} />
          )}
        </div>
      </div>
    </div>
  );
}

function ShareButton({
  icon,
  label,
  onClick,
  accent,
  accentText,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: string;
  accentText?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-1 min-w-0 py-2"
    >
      <span
        className="w-12 h-12 rounded-full flex items-center justify-center transition active:scale-95"
        style={{
          background: accent || "rgba(255,255,255,0.10)",
          color: accentText || "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {icon}
      </span>
      <span className="text-[10px] uppercase tracking-wider font-bold opacity-80 truncate w-full text-center">
        {label}
      </span>
    </button>
  );
}
