"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface BallChip {
  label: string;
  type: string; // "wicket" | "six" | "boundary" | "wide" | "noball" | "extra" | "dot" | "runs"
}

interface OverGroup {
  overNumber: number;
  innings: number;
  balls: BallChip[];
}

interface OverBallsPanelProps {
  matchId: string;
  // passed from socket scoreUpdate so panel refreshes when score changes
  scoreVersion?: number;
}

function chipStyle(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case "wicket":   return { bg: "#7f1d1d", text: "#ff4444", border: "#ff4444" };
    case "six":      return { bg: "#422006", text: "#ffd60a", border: "#ffd60a" };
    case "boundary": return { bg: "#052e16", text: "#22c55e", border: "#22c55e" };
    case "wide":
    case "noball":
    case "extra":    return { bg: "#1a1a1a", text: "#9ca3af", border: "#4b5563" };
    case "dot":      return { bg: "#0d0d0d", text: "#4b5563", border: "#2a2a2a" };
    default:         return { bg: "#1a1a1a", text: "#ffffff", border: "#2a2a2a" };
  }
}

export default function OverBallsPanel({ matchId, scoreVersion }: OverBallsPanelProps) {
  const [overs, setOvers] = useState<OverGroup[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasInitializedScrollRef = useRef(false);
  // Once the user has touched / scrolled the strip even once, stop ever
  // forcing it back to the live edge. Previous "follow if near right edge"
  // heuristic kept misclassifying mid-swipe positions and yanking the user
  // back to the latest ball every poll tick.
  const userTouchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getMatchBalls(matchId);
      if (data?.overs) setOvers(data.overs);
    } catch {
      // silently ignore — panel is non-critical
    }
  }, [matchId]);

  useEffect(() => { load(); }, [load, scoreVersion]);

  // Listen for the first user-driven scroll/touch on the strip and lock
  // out any further auto-scrolling.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const markTouched = () => { userTouchedRef.current = true; };

    // Both pointer + touch + wheel cover the realistic input modes; we
    // intentionally do NOT listen to "scroll" because programmatic scrolls
    // we trigger ourselves would falsely flip the flag on first load.
    element.addEventListener("pointerdown", markTouched, { passive: true });
    element.addEventListener("touchstart", markTouched, { passive: true });
    element.addEventListener("wheel", markTouched, { passive: true });
    return () => {
      element.removeEventListener("pointerdown", markTouched);
      element.removeEventListener("touchstart", markTouched);
      element.removeEventListener("wheel", markTouched);
    };
  }, []);

  // Overs render oldest-to-newest left-to-right.
  // Auto-jump to the latest ball ONLY on the very first paint. After that
  // we never override the user's scroll position — they're free to inspect
  // older overs without being snapped back every 5s.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || overs.length === 0) return;

    if (!hasInitializedScrollRef.current) {
      element.scrollLeft = element.scrollWidth;
      hasInitializedScrollRef.current = true;
    }
  }, [overs]);

  if (overs.length === 0) return null;

  return (
    <div
      className="over-strip-scroll"
      style={{
        background: "#0d0d0d",
        border: "2px solid #2a2a2a",
        borderRadius: "4px",
        padding: "10px 6px 12px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        boxShadow: "0 2px 0 0 #000, inset 0 0 0 1px rgba(255,255,255,0.03)",
      }}
      ref={scrollRef}
    >
      <div style={{ display: "flex", gap: "0", paddingLeft: "8px", paddingRight: "8px", minWidth: "max-content" }}>
        {/* Show newest overs on left — reverse the array */}
        {overs.map((over, idx) => (
          <div
            key={`${over.innings}-${over.overNumber}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              padding: "0 14px",
              // Vertical separator between overs so the eye groups balls
              // by over instead of reading one continuous line of dots.
              borderRight: idx < overs.length - 1 ? "1.5px solid #3a3a3a" : "none",
            }}
          >
            {/* Over label */}
            <span
              style={{
                fontFamily: "'Bungee', cursive",
                fontSize: "0.6rem",
                color: "#ff6341",
                letterSpacing: "0.05em",
                textAlign: "center",
              }}
            >
              {over.innings === 2 ? "Inn2 " : ""}Ov {over.overNumber}
            </span>
            {/* Ball chips row */}
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              {over.balls.map((ball, i) => {
                const style = chipStyle(ball.type);
                return (
                  <div
                    key={i}
                    style={{
                      minWidth: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      border: `1.5px solid ${style.border}`,
                      background: style.bg,
                      color: style.text,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: ball.label.length > 2 ? "0.45rem" : "0.65rem",
                      fontWeight: "900",
                      fontFamily: "'Bungee', cursive",
                      flexShrink: 0,
                      padding: ball.label.length > 2 ? "0 3px" : undefined,
                    }}
                  >
                    {ball.label}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
