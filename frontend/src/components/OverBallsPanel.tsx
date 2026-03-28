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

  const load = useCallback(async () => {
    try {
      const data = await api.getMatchBalls(matchId);
      if (data?.overs) setOvers(data.overs);
    } catch {
      // silently ignore — panel is non-critical
    }
  }, [matchId]);

  useEffect(() => { load(); }, [load, scoreVersion]);

  // Auto-scroll to the rightmost (newest) over on data update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [overs]);

  if (overs.length === 0) return null;

  return (
    <div
      style={{
        background: "#0d0d0d",
        border: "2px solid #2a2a2a",
        borderRadius: "4px",
        padding: "8px 4px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        boxShadow: "0 2px 0 0 #000",
      }}
      ref={scrollRef}
    >
      <div style={{ display: "flex", gap: "12px", paddingLeft: "8px", paddingRight: "8px", minWidth: "max-content" }}>
        {/* Show newest overs on left — reverse the array */}
        {[...overs].reverse().map((over) => (
          <div key={`${over.innings}-${over.overNumber}`} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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
