"use client";

import { useState } from "react";
import { getTeamColor } from "@/lib/teamColors";

// Circular team badge. Tries to load `/team-logos/<short>.png` first; if
// that 404s (or while we don't have a logo image at that path), falls back
// to a styled text disc filled with the team's primary brand colour.
// Either way the badge is a fixed square so the surrounding layout (e.g.
// the Punter Card stacked-glass pill) stays stable.
//
// Drop a PNG into frontend/public/team-logos/<short>.png at any time and
// every badge for that team picks it up automatically — no code change.

interface Props {
  short: string;
  size?: number;          // pixel size of the square; default 56
  className?: string;
}

export default function TeamBadge({ short, size = 56, className = "" }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const code = (short || "").toUpperCase();
  const color = getTeamColor(code);
  const src = `/team-logos/${code.toLowerCase()}.png`;

  if (!imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={code}
        onError={() => setImgFailed(true)}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: "drop-shadow(0 0 12px rgba(0,0,0,0.4))",
        }}
        className={className}
      />
    );
  }

  // Fallback: styled circular text disc in the team's brand colour.
  return (
    <div
      role="img"
      aria-label={code}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color.primary,
        color: color.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Bungee', 'Impact', sans-serif",
        fontSize: Math.round(size * 0.32),
        letterSpacing: 0.5,
        boxShadow: `0 0 16px ${color.primary}66, inset 0 -3px 0 rgba(0,0,0,0.18)`,
        border: "2px solid rgba(255,255,255,0.2)",
      }}
    >
      {code}
    </div>
  );
}
