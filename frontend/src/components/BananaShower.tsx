"use client";

// Floating banana animation overlay. Listens for `banana.awarded` socket
// events on the user's private room (`user:{id}`), queues a small "+N 🍌"
// chip per event, and lets it drift up the screen with a gentle ease.
//
// IMPORTANT: bananas are credited server-side the moment the event fires —
// the chip is purely a celebration, NOT a "tap to claim" mechanic. Tap is
// only an interactive flourish: it lights-speeds the chip away early so a
// playful user can flick chips off-screen on their own pace. Doing nothing
// (the default) is equally valid — the chip drifts up and fades on its own.
//
// Mounted once at the root layout so any page benefits. Cap at 6 active
// chips to prevent overflow on big banana grants (e.g. 5v5 settlement).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { connectSocket } from "@/lib/socket";

interface FloatItem {
  id: number;
  delta: number;
  // Pixel offset from the right edge — keeps chips within the right 2/3 of
  // the screen so they don't fight the bottom-right floating powerup tray.
  rightOffset: number;
  // 1 → tapped (fast finish); 0 → normal drift.
  fast: 0 | 1;
}

const MAX_FLOATS = 6;

export default function BananaShower() {
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idCounter = useRef(0);

  useEffect(() => { setMounted(true); }, []);

  const enqueue = useCallback((delta: number) => {
    if (typeof window === "undefined") return;
    const viewportW = window.innerWidth;
    // Right offset: 60-220px from right edge gives a natural spread without
    // bumping into the floating powerup button (anchored bottom-right at
    // 16px). On narrow phones this falls back to the full width.
    const minRight = Math.min(60, viewportW * 0.15);
    const maxRight = Math.min(240, viewportW * 0.7);
    const rightOffset = minRight + Math.random() * (maxRight - minRight);
    const id = ++idCounter.current;
    setFloats((prev) => {
      const next = [...prev, { id, delta, rightOffset, fast: 0 as const }];
      // Cap concurrent chips — drop oldest if we hit the ceiling.
      return next.length > MAX_FLOATS ? next.slice(next.length - MAX_FLOATS) : next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setFloats((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const accelerate = useCallback((id: number) => {
    setFloats((prev) => prev.map((f) => (f.id === id ? { ...f, fast: 1 as const } : f)));
  }, []);

  // Subscribe to socket; user-room delivery means the server filters by
  // userId (we don't have to gate here).
  useEffect(() => {
    const s = connectSocket();
    const onBanana = (data: { delta: number }) => {
      const d = Number(data?.delta);
      if (!Number.isFinite(d) || d === 0) return;
      // Only show POSITIVE awards — purchases (negative deltas) shouldn't
      // pop a celebratory chip. The store page has its own confirmation UI.
      if (d <= 0) return;
      enqueue(d);
    };
    s.on("banana.awarded", onBanana);
    return () => { s.off("banana.awarded", onBanana); };
  }, [enqueue]);

  if (!mounted) return null;

  const tree = (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80]"
    >
      <AnimatePresence>
        {floats.map((f) => (
          <motion.button
            key={f.id}
            type="button"
            onClick={() => accelerate(f.id)}
            initial={{ y: 0, opacity: 0, scale: 0.6 }}
            animate={{
              y: f.fast ? "-100vh" : "-75vh",
              opacity: f.fast ? 0 : [0, 1, 1, 0],
              scale: f.fast ? 1.6 : [0.6, 1, 1, 0.95],
            }}
            transition={{
              y: { duration: f.fast ? 0.25 : 3.6, ease: f.fast ? "easeIn" : "easeOut" },
              opacity: { duration: f.fast ? 0.25 : 3.6, times: f.fast ? undefined : [0, 0.1, 0.7, 1] },
              scale: { duration: f.fast ? 0.25 : 3.6, times: f.fast ? undefined : [0, 0.15, 0.7, 1] },
            }}
            onAnimationComplete={() => remove(f.id)}
            className="pointer-events-auto absolute flex items-center gap-1 px-3 py-2 rounded-full select-none cursor-pointer"
            style={{
              right: `${f.rightOffset}px`,
              bottom: "calc(96px + env(safe-area-inset-bottom))",
              background: "rgba(255, 214, 10, 0.95)",
              color: "#000",
              border: "2px solid #000",
              boxShadow: "3px 3px 0 0 #ff6341",
              fontFamily: "'Bungee', cursive",
              fontSize: "14px",
            }}
          >
            <span style={{ fontWeight: 900, letterSpacing: "0.05em" }}>+{f.delta}</span>
            <span style={{ fontSize: "18px", lineHeight: 1 }}>🍌</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );

  return createPortal(tree, document.body);
}
