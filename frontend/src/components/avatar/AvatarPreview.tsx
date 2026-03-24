"use client";

/**
 * AvatarPreview — 2D layered gamified cricket avatar renderer.
 *
 * Architecture:
 *   Every body section is a React.memo'd component that only re-renders
 *   when its own props change.  When a jersey color changes, GradientsLayer
 *   updates the SVG <defs> and all gradient-referencing layers refresh
 *   visually without their React nodes re-rendering.
 *
 * Layer order (bottom → top):
 *   Shadow → Shoes → Legs → Shorts → Bat → Torso → Arms →
 *   Neck → Head (ears + circle) → Hair/Helmet → Face → Accessory
 */

import { memo } from "react";
import { AvatarConfig } from "@/types/avatar";
import { BODY_HALF_WIDTHS } from "./avatarAssets";

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map(v =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function lighten(hex: string, pct = 0.3): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r + (255 - r) * pct, g + (255 - g) * pct, b + (255 - b) * pct);
  } catch {
    return hex;
  }
}

function darken(hex: string, pct = 0.3): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r * (1 - pct), g * (1 - pct), b * (1 - pct));
  } catch {
    return hex;
  }
}

// ── SVG coordinate constants ───────────────────────────────────────────────
// ViewBox: 0 0 100 180

// ── Gradient definitions ──────────────────────────────────────────────────────

const GradientsLayer = memo(function GradientsLayer({
  skinTone,
  jerseyColor,
  helmetColor,
  uid,
}: {
  skinTone: string;
  jerseyColor: string;
  helmetColor: string;
  uid: string;
}) {
  const shortsColor = darken(jerseyColor, 0.38);
  return (
    <defs>
      {/* Skin – sphere (radial) */}
      <radialGradient id={`sk-${uid}`} cx="35%" cy="28%" r="65%">
        <stop offset="0%"   stopColor={lighten(skinTone, 0.28)} />
        <stop offset="100%" stopColor={darken(skinTone, 0.22)} />
      </radialGradient>
      {/* Skin – cylindrical (arms/legs/neck) */}
      <linearGradient id={`sc-${uid}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor={lighten(skinTone, 0.2)} />
        <stop offset="48%"  stopColor={skinTone} />
        <stop offset="100%" stopColor={darken(skinTone, 0.26)} />
      </linearGradient>
      {/* Jersey / torso */}
      <linearGradient id={`jy-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={lighten(jerseyColor, 0.26)} />
        <stop offset="100%" stopColor={darken(jerseyColor, 0.32)} />
      </linearGradient>
      {/* Helmet / hair dome */}
      <radialGradient id={`hm-${uid}`} cx="35%" cy="28%" r="65%">
        <stop offset="0%"   stopColor={lighten(helmetColor, 0.36)} />
        <stop offset="100%" stopColor={darken(helmetColor, 0.36)} />
      </radialGradient>
      {/* Shorts */}
      <linearGradient id={`sh-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={lighten(shortsColor, 0.1)} />
        <stop offset="100%" stopColor={darken(shortsColor, 0.15)} />
      </linearGradient>
      {/* Shoes */}
      <linearGradient id={`sw-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#3a3a4e" />
        <stop offset="100%" stopColor="#1c1c2e" />
      </linearGradient>
      {/* Cricket bat blade */}
      <linearGradient id={`bt-${uid}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="#f0d99a" />
        <stop offset="100%" stopColor="#c8a060" />
      </linearGradient>
    </defs>
  );
});

// ── Shadow ────────────────────────────────────────────────────────────────────

const ShadowLayer = memo(function ShadowLayer() {
  return <ellipse cx="50" cy="168" rx="26" ry="5" fill="black" opacity="0.12" />;
});

// ── Shoes ─────────────────────────────────────────────────────────────────────

const ShoesLayer = memo(function ShoesLayer({ uid }: { uid: string }) {
  return (
    <g>
      {/* Left shoe */}
      <ellipse cx="35"  cy="161" rx="14" ry="6.5" fill={`url(#sw-${uid})`} />
      {/* Shoe tongue (white strip at top) */}
      <ellipse cx="35"  cy="155" rx="6"  ry="2.2" fill="white" opacity="0.28" />
      <ellipse cx="32"  cy="158" rx="8"  ry="2.2" fill="white" opacity="0.1" />
      {/* Right shoe */}
      <ellipse cx="65"  cy="161" rx="14" ry="6.5" fill={`url(#sw-${uid})`} />
      <ellipse cx="65"  cy="155" rx="6"  ry="2.2" fill="white" opacity="0.28" />
      <ellipse cx="62"  cy="158" rx="8"  ry="2.2" fill="white" opacity="0.1" />
    </g>
  );
});

// ── Legs ──────────────────────────────────────────────────────────────────────

const LegsLayer = memo(function LegsLayer({ uid }: { uid: string }) {
  return (
    <g>
      {/* Left leg */}
      <rect x="27" y="117" width="17" height="45" rx="8.5" fill={`url(#sc-${uid})`} />
      {/* Right leg */}
      <rect x="56" y="117" width="17" height="45" rx="8.5" fill={`url(#sc-${uid})`} />
    </g>
  );
});

// ── Shorts ────────────────────────────────────────────────────────────────────

const ShortsLayer = memo(function ShortsLayer({ hw, uid }: { hw: number; uid: string }) {
  const x = 50 - hw - 3;
  const w = (hw + 3) * 2;
  return (
    <g>
      <rect x={x} y="100" width={w} height="21" rx="6" fill={`url(#sh-${uid})`} />
      {/* Inner seam */}
      <line x1="50" y1="102" x2="50" y2="120" stroke="black" strokeWidth="0.7" opacity="0.14" />
    </g>
  );
});

// ── Cricket Bat ───────────────────────────────────────────────────────────────

const BatLayer = memo(function BatLayer({ hw, uid }: { hw: number; uid: string }) {
  const bx = 50 + hw + 14;
  return (
    <g>
      {/* Blade */}
      <rect x={bx}     y="38"  width="13" height="29" rx="3.5"  fill={`url(#bt-${uid})`} />
      {/* Blade edge highlight */}
      <rect x={bx}     y="38"  width="3.5" height="29" rx="1.75" fill="white" opacity="0.24" />
      {/* Sweet-spot oval */}
      <ellipse cx={bx + 6.5} cy="53" rx="3.5" ry="6" fill="white" opacity="0.1" />
      {/* Handle */}
      <rect x={bx + 2} y="67"  width="8"  height="24" rx="4"    fill="#3d2010" />
      {/* Grip tape */}
      <rect x={bx + 3} y="70"  width="6"  height="15" rx="2"    fill="#c8a060" opacity="0.32" />
    </g>
  );
});

// ── Torso / Jersey ────────────────────────────────────────────────────────────

const TorsoLayer = memo(function TorsoLayer({
  hw,
  jerseyColor,
  jerseyPattern,
  uid,
}: {
  hw: number;
  jerseyColor: string;
  jerseyPattern: number;
  uid: string;
}) {
  const x = 50 - hw;
  const w = hw * 2;
  return (
    <g>
      {/* Main body */}
      <rect x={x} y="56" width={w} height="47" rx="9" fill={`url(#jy-${uid})`} />

      {/* Pattern overlays */}
      {jerseyPattern === 1 && (
        <rect x={x} y="70" width={w} height="8" rx="2" fill="white" opacity="0.18" />
      )}
      {jerseyPattern === 2 && (
        <polygon
          points={`50,58 ${x + 7},56 ${x + w - 7},56`}
          fill="white"
          opacity="0.16"
        />
      )}
      {jerseyPattern === 3 && (
        <>
          <rect x={x}         y="56" width="8" height="47" rx="4" fill="white" opacity="0.1" />
          <rect x={x + w - 8} y="56" width="8" height="47" rx="4" fill="white" opacity="0.1" />
        </>
      )}

      {/* Number badge */}
      <circle cx="50" cy="76" r="10" fill="white" opacity="0.12" />
      <text
        x="50" y="79.5"
        textAnchor="middle"
        fill="white"
        fontSize="9"
        fontWeight="bold"
        opacity="0.6"
        fontFamily="monospace"
      >
        10
      </text>

      {/* Collar */}
      <ellipse cx="50" cy="56" rx="9" ry="4" fill={lighten(jerseyColor, 0.18)} />
    </g>
  );
});

// ── Arms ──────────────────────────────────────────────────────────────────────

const ArmsLayer = memo(function ArmsLayer({ hw, uid }: { hw: number; uid: string }) {
  const lx = 50 - hw - 13; // left upper arm x
  const rx2 = 50 + hw;      // right upper arm x

  return (
    <g>
      {/* Left upper arm (jersey sleeve) */}
      <rect x={lx}     y="58"  width="13" height="32" rx="6.5" fill={`url(#jy-${uid})`} />
      {/* Left forearm (skin) */}
      <rect x={lx - 1} y="85"  width="13" height="20" rx="6.5" fill={`url(#sc-${uid})`} />
      {/* Left hand — rounder fist */}
      <ellipse cx={lx + 5}  cy="106" rx="9" ry="8" fill={`url(#sk-${uid})`} />

      {/* Right upper arm (jersey sleeve) */}
      <rect x={rx2}    y="58"  width="13" height="32" rx="6.5" fill={`url(#jy-${uid})`} />
      {/* Right forearm (skin) */}
      <rect x={rx2 + 1} y="85" width="13" height="20" rx="6.5" fill={`url(#sc-${uid})`} />
      {/* Right hand — rounder fist */}
      <ellipse cx={rx2 + 8}  cy="106" rx="9" ry="8" fill={`url(#sk-${uid})`} />
    </g>
  );
});

// ── Neck ──────────────────────────────────────────────────────────────────────

const NeckLayer = memo(function NeckLayer({ uid }: { uid: string }) {
  return <rect x="43" y="48" width="14" height="12" rx="6" fill={`url(#sc-${uid})`} />;
});

// ── Head (ears + circle) ──────────────────────────────────────────────────────

const HeadLayer = memo(function HeadLayer({
  skinTone,
  uid,
}: {
  skinTone: string;
  uid: string;
}) {
  return (
    <g>
      {/* Ears */}
      <ellipse cx="27" cy="29" rx="5.5" ry="6.5" fill={`url(#sk-${uid})`} />
      <ellipse cx="73" cy="29" rx="5.5" ry="6.5" fill={`url(#sk-${uid})`} />
      {/* Ear inner detail */}
      <ellipse cx="28" cy="29" rx="3"   ry="4"   fill={darken(skinTone, 0.14)} opacity="0.32" />
      <ellipse cx="72" cy="29" rx="3"   ry="4"   fill={darken(skinTone, 0.14)} opacity="0.32" />
      {/* Main head circle — r=23 for bigger cartoon head */}
      <circle cx="50" cy="28" r="23" fill={`url(#sk-${uid})`} />
      {/* Chin shadow */}
      <ellipse cx="50" cy="49" rx="12" ry="3" fill="black" opacity="0.07" />
    </g>
  );
});

// ── Hair / Helmet ─────────────────────────────────────────────────────────────

const HairHelmetLayer = memo(function HairHelmetLayer({
  helmetStyle,
  helmetColor,
  jerseyColor,
  uid,
}: {
  helmetStyle: number;
  helmetColor: string;
  jerseyColor: string;
  uid: string;
}) {
  switch (helmetStyle) {
    // ── 0: Classic batting helmet (dome + proper D-cage) ──────────────────
    case 0:
      return (
        <g>
          {/* Dome */}
          <ellipse cx="50" cy="13" rx="23" ry="17" fill={`url(#hm-${uid})`} />
          {/* Ear guard — left side */}
          <ellipse cx="28" cy="27" rx="6.5" ry="9.5" fill={`url(#hm-${uid})`} opacity="0.95" />
          {/* Brim band */}
          <rect x="27" y="22" width="46" height="5.5" rx="2.75"
                fill={darken(helmetColor, 0.28)} />
          {/* Face-cage outer frame (D-shape) */}
          <path d="M 36 27 Q 27 34 36 42 L 64 42 Q 73 34 64 27 Z"
                fill="none" stroke={darken(helmetColor, 0.45)}
                strokeWidth="2.2" opacity="0.85" />
          {/* Cage horizontal bars */}
          <line x1="35" y1="31" x2="65" y2="31"
                stroke={darken(helmetColor, 0.45)} strokeWidth="1.3" opacity="0.7" />
          <line x1="34" y1="36" x2="66" y2="36"
                stroke={darken(helmetColor, 0.45)} strokeWidth="1.3" opacity="0.7" />
          <line x1="35" y1="41" x2="65" y2="41"
                stroke={darken(helmetColor, 0.45)} strokeWidth="1.3" opacity="0.7" />
          {/* Cage vertical dividers */}
          <line x1="44" y1="27" x2="42" y2="42"
                stroke={darken(helmetColor, 0.45)} strokeWidth="1" opacity="0.5" />
          <line x1="50" y1="27" x2="50" y2="42"
                stroke={darken(helmetColor, 0.45)} strokeWidth="1" opacity="0.5" />
          <line x1="56" y1="27" x2="58" y2="42"
                stroke={darken(helmetColor, 0.45)} strokeWidth="1" opacity="0.5" />
          {/* Dome shine */}
          <ellipse cx="40" cy="8" rx="8" ry="5" fill="white" opacity="0.18" />
        </g>
      );

    // ── 1: Cricket cap (dome + wide brim) ─────────────────────────────────
    case 1:
      return (
        <g>
          {/* Main dome */}
          <ellipse cx="50" cy="12" rx="23" ry="16" fill={`url(#hm-${uid})`} />
          {/* Wide curved brim to the left */}
          <path d="M 28 21 Q 14 24 11 28 Q 20 28 27 25 Z"
                fill={`url(#hm-${uid})`} />
          {/* Cap band */}
          <rect x="27" y="21" width="46" height="6" rx="3"
                fill={darken(helmetColor, 0.22)} />
          {/* Front badge panel */}
          <ellipse cx="50" cy="14" rx="5" ry="4" fill="white" opacity="0.14" />
          <circle  cx="50" cy="14" r="1.8" fill={lighten(helmetColor, 0.3)} opacity="0.5" />
          {/* Crown button */}
          <circle cx="50" cy="3" r="2.2" fill={darken(helmetColor, 0.18)} />
          {/* Dome shine */}
          <ellipse cx="40" cy="7" rx="7.5" ry="4.5" fill="white" opacity="0.2" />
        </g>
      );

    // ── 2: Short spiky hair (no headgear) ─────────────────────────────────
    case 2:
      return (
        <g>
          {/* Hair base cap */}
          <ellipse cx="50" cy="12" rx="22" ry="16" fill={darken(helmetColor, 0.1)} />
          {/* Spikes */}
          <polygon points="38,10  41,1  44,10" fill={helmetColor} />
          <polygon points="46,8   50,0  54,8"  fill={helmetColor} />
          <polygon points="56,10  59,1  62,10" fill={helmetColor} />
          {/* Forehead cover */}
          <rect x="28" y="12" width="44" height="10" rx="2" fill={darken(helmetColor, 0.1)} />
          {/* Shine */}
          <ellipse cx="40" cy="8" rx="7" ry="3.5" fill="white" opacity="0.15" />
        </g>
      );

    // ── 3: Long flowing hair ──────────────────────────────────────────────
    case 3:
    default:
      return (
        <g>
          {/* Back hair (behind head — rendered first so it's beneath) */}
          <ellipse cx="50" cy="42" rx="25" ry="18" fill={darken(helmetColor, 0.18)} />
          {/* Main hair dome */}
          <ellipse cx="50" cy="11" rx="22" ry="17" fill={helmetColor} />
          {/* Side flow strands */}
          <path d="M 28 27 Q 20 46 23 62"
                stroke={helmetColor} strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M 72 27 Q 80 46 77 62"
                stroke={helmetColor} strokeWidth="9" fill="none" strokeLinecap="round" />
          {/* Center part line */}
          <path d="M 50 4 L 50 22"
                stroke={lighten(helmetColor, 0.22)} strokeWidth="1.5" fill="none" opacity="0.5" />
          {/* Dome shine */}
          <ellipse cx="40" cy="7" rx="7" ry="4" fill="white" opacity="0.15" />
          {/* Unused jerseyColor ref needed for memo check — invisible */}
          <g opacity="0" aria-hidden="true">
            <rect width="0" height="0" fill={jerseyColor} />
          </g>
        </g>
      );
  }
});

// ── Face ──────────────────────────────────────────────────────────────────────
// Each expression has: eye shape variant, eyebrow variant, mouth variant.
// Iris color changes per expression for a fun, gamified feel.

const IRIS_COLORS = ["#4a90d9", "#e85d04", "#7b2d8b", "#2d9e5a", "#c9a227"];

const FaceLayer = memo(function FaceLayer({ expression }: { expression: number }) {
  const lx = 38;
  const rx2 = 62;
  const ey = 27;
  const iris = IRIS_COLORS[expression] ?? "#4a90d9";

  return (
    <g>
      {/* Eyebrows */}
      <EyebrowShape expression={expression} lx={lx} rx={rx2} ey={ey} />

      {/* Eye whites — big Bitmoji-style ellipses */}
      <ellipse cx={lx}  cy={ey} rx="6.5" ry="7" fill="white" />
      <ellipse cx={rx2} cy={ey} rx="6.5" ry="7" fill="white" />

      {/* Irises + pupils */}
      <IrisShape expression={expression} lx={lx} rx={rx2} ey={ey} iris={iris} />

      {/* Eyelash arcs */}
      <path d={`M ${lx  - 6} ${ey - 5.5} Q ${lx}  ${ey - 10} ${lx  + 6} ${ey - 5.5}`}
            stroke="#1a0a0a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d={`M ${rx2 - 6} ${ey - 5.5} Q ${rx2} ${ey - 10} ${rx2 + 6} ${ey - 5.5}`}
            stroke="#1a0a0a" strokeWidth="1.6" fill="none" strokeLinecap="round" />

      {/* Button nose */}
      <circle cx="47" cy="36" r="1.5" fill="#2a1a0a" opacity="0.28" />
      <circle cx="53" cy="36" r="1.5" fill="#2a1a0a" opacity="0.28" />

      {/* Cheek blush */}
      <ellipse cx="28" cy="35" rx="5.5" ry="3" fill="#ff8888" opacity="0.22" />
      <ellipse cx="72" cy="35" rx="5.5" ry="3" fill="#ff8888" opacity="0.22" />

      {/* Mouth */}
      <MouthShape expression={expression} />
    </g>
  );
});

function EyebrowShape({
  expression,
  lx,
  rx,
  ey,
}: {
  expression: number;
  lx: number;
  rx: number;
  ey: number;
}) {
  const by = ey - 10;
  const c = "#2a1a0a";

  if (expression === 1) {
    // Fierce — angry V inward
    return (
      <g>
        <path d={`M ${lx - 5} ${by - 1} L ${lx + 5} ${by + 3}`}
              stroke={c} strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${rx + 5} ${by - 1} L ${rx - 5} ${by + 3}`}
              stroke={c} strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }
  if (expression === 3) {
    // Excited — high arched
    return (
      <g>
        <path d={`M ${lx - 6} ${by - 2} Q ${lx} ${by - 8} ${lx + 6} ${by - 2}`}
              stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d={`M ${rx - 6} ${by - 2} Q ${rx} ${by - 8} ${rx + 6} ${by - 2}`}
              stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  // Default — gentle arch
  return (
    <g>
      <path d={`M ${lx - 6} ${by + 1} Q ${lx} ${by - 5} ${lx + 6} ${by + 1}`}
            stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={`M ${rx - 6} ${by + 1} Q ${rx} ${by - 5} ${rx + 6} ${by + 1}`}
            stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  );
}

function IrisShape({
  expression,
  lx,
  rx,
  ey,
  iris,
}: {
  expression: number;
  lx: number;
  rx: number;
  ey: number;
  iris: string;
}) {
  const dot = (cx: number, cy: number) => (
    <>
      <circle cx={cx} cy={cy + 0.5} r="4.8" fill={iris} />
      <circle cx={cx} cy={cy + 0.5} r="2.7" fill="#0d0d0d" />
      <circle cx={cx + 1.8} cy={cy - 2.5} r="1.6" fill="white" />
    </>
  );

  if (expression === 2) {
    // Cheeky wink — right eye closed
    return (
      <>
        {dot(lx, ey)}
        <line x1={rx - 5} y1={ey} x2={rx + 5} y2={ey}
              stroke="#2a1a0a" strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  if (expression === 4) {
    // Cool squint — half-lid overlay
    return (
      <>
        {dot(lx, ey + 1)}
        {dot(rx, ey + 1)}
        <path d={`M ${lx - 6.5} ${ey - 1} Q ${lx} ${ey - 7} ${lx + 6.5} ${ey - 1}`}
              fill="white" opacity="0.65" />
        <path d={`M ${rx - 6.5} ${ey - 1} Q ${rx} ${ey - 7} ${rx + 6.5} ${ey - 1}`}
              fill="white" opacity="0.65" />
      </>
    );
  }

  if (expression === 3) {
    // Excited — slightly larger iris
    return (
      <>
        <circle cx={lx}  cy={ey + 0.5} r="5.4" fill={iris} />
        <circle cx={rx}  cy={ey + 0.5} r="5.4" fill={iris} />
        <circle cx={lx}  cy={ey + 0.5} r="3"   fill="#0d0d0d" />
        <circle cx={rx}  cy={ey + 0.5} r="3"   fill="#0d0d0d" />
        <circle cx={lx  + 1.8} cy={ey - 2.5} r="1.6" fill="white" />
        <circle cx={rx  + 1.8} cy={ey - 2.5} r="1.6" fill="white" />
      </>
    );
  }

  return (
    <>
      {dot(lx, ey)}
      {dot(rx, ey)}
    </>
  );
}

function MouthShape({ expression }: { expression: number }) {
  const my = 41;
  const c  = "#1a0a0a";

  switch (expression) {
    case 0: // Happy — wide smile with teeth
      return (
        <g>
          <path d={`M 39 ${my} Q 50 ${my + 9} 61 ${my}`}
                stroke={c} strokeWidth="2.5" fill="#cc4444" strokeLinecap="round" />
          <path d={`M 39 ${my} Q 50 ${my + 9} 61 ${my}`} fill="#cc4444" opacity="0.55" />
          <rect x="43" y={my} width="14" height="5.5" rx="1" fill="white" opacity="0.72" />
        </g>
      );
    case 1: // Fierce — straight tight line
      return (
        <line x1="42" y1={my + 2} x2="58" y2={my + 2}
              stroke={c} strokeWidth="2.5" strokeLinecap="round" />
      );
    case 2: // Cheeky — one-sided smirk
      return (
        <path d={`M 43 ${my + 1} Q 52 ${my + 7} 59 ${my - 1}`}
              stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      );
    case 3: // Excited — open O
      return (
        <g>
          <ellipse cx="50" cy={my + 5} rx="9.5"  ry="7.5"  fill="#1a0a0a" />
          <ellipse cx="50" cy={my + 6} rx="7.5"  ry="5.8"  fill="#cc4444" />
          <ellipse cx="50" cy={my + 8} rx="5.5"  ry="2.8"  fill="#ff9999" opacity="0.5" />
        </g>
      );
    case 4: // Cool — slight smirk
      return (
        <path d={`M 42 ${my + 2} Q 51 ${my + 6} 58 ${my}`}
              stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      );
    default:
      return (
        <path d={`M 41 ${my} Q 50 ${my + 7} 59 ${my}`}
              stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      );
  }
}

// ── Accessory ─────────────────────────────────────────────────────────────────

const AccessoryLayer = memo(function AccessoryLayer({
  type,
  jerseyColor,
}: {
  type: number;
  jerseyColor: string;
  skinTone: string; // kept for future use / memo key
}) {
  switch (type) {
    case 0:
      return null;

    case 1: // Sunglasses
      return (
        <g>
          <rect x="30" y="23" width="14" height="10" rx="4"   fill="#0d0d1a" opacity="0.9" />
          <rect x="46" y="23" width="14" height="10" rx="4"   fill="#0d0d1a" opacity="0.9" />
          <line x1="44" y1="27.5" x2="46" y2="27.5"
                stroke="#0d0d1a" strokeWidth="2" />
          <line x1="30" y1="27" x2="24" y2="25.5"
                stroke="#0d0d1a" strokeWidth="1.6" />
          <line x1="60" y1="27" x2="66" y2="25.5"
                stroke="#0d0d1a" strokeWidth="1.6" />
          <rect x="31" y="24" width="5"  height="3.5" rx="1.5" fill="white" opacity="0.15" />
          <rect x="47" y="24" width="5"  height="3.5" rx="1.5" fill="white" opacity="0.15" />
        </g>
      );

    case 2: // Sweatband
      return (
        <g>
          <rect x="26" y="20" width="48" height="8.5" rx="4.25" fill={jerseyColor} opacity="0.92" />
          <rect x="32" y="21.5" width="12" height="3.5" rx="1.75" fill="white" opacity="0.24" />
        </g>
      );

    case 3: // War paint — eye-black strips under each eye
      return (
        <g>
          {/* Under left eye (eye at cx=38 cy=27, so cheekbone is ~y=34) */}
          <rect x="27" y="33" width="10" height="3.5" rx="1.75"
                fill="#111111" opacity="0.6"
                transform="rotate(-5 32 34.75)" />
          {/* Under right eye (eye at cx=62) */}
          <rect x="63" y="33" width="10" height="3.5" rx="1.75"
                fill="#111111" opacity="0.6"
                transform="rotate(5 68 34.75)" />
        </g>
      );

    case 4: // Gold earring (right ear)
      return (
        <g>
          <circle cx="79" cy="31" r="3.8" fill="#ffd700" />
          <circle cx="79" cy="31" r="1.9" fill="#ffee55" opacity="0.7" />
        </g>
      );

    case 5: // Bandana
      return (
        <g>
          <path d="M 26 19 Q 50 10 74 19 L 74 27 Q 50 33 26 27 Z"
                fill={jerseyColor} opacity="0.9" />
          <path d="M 56 27 L 65 39 L 60 27 Z"
                fill={jerseyColor} opacity="0.85" />
          <path d="M 27 19 Q 50 12 73 19"
                stroke="white" strokeWidth="1" fill="none" opacity="0.3" />
        </g>
      );

    default:
      return null;
  }
});

// ── AvatarPreview (main export) ───────────────────────────────────────────────

export default function AvatarPreview({
  config,
  uid,
  width,
  height,
}: {
  config: AvatarConfig;
  uid: string;
  width: number;
  height: number;
}) {
  const {
    skinTone,
    jerseyColor,
    helmetColor,
    helmetStyle,
    jerseyPattern,
    bodyType,
    expression,
    accessory,
  } = config;

  const hw: number = BODY_HALF_WIDTHS[bodyType] ?? 18;

  return (
    <svg
      viewBox="0 0 100 180"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      overflow="visible"
    >
      {/* 1. Gradient defs — re-renders when any color changes */}
      <GradientsLayer
        skinTone={skinTone}
        jerseyColor={jerseyColor}
        helmetColor={helmetColor}
        uid={uid}
      />

      {/* 2. Ground shadow */}
      <ShadowLayer />

      {/* 3. Shoes */}
      <ShoesLayer uid={uid} />

      {/* 4. Legs */}
      <LegsLayer uid={uid} />

      {/* 5. Shorts */}
      <ShortsLayer hw={hw} uid={uid} />

      {/* 6. Bat (behind torso on right side) */}
      <BatLayer hw={hw} uid={uid} />

      {/* 7. Torso / Jersey */}
      <TorsoLayer
        hw={hw}
        jerseyColor={jerseyColor}
        jerseyPattern={jerseyPattern}
        uid={uid}
      />

      {/* 8. Arms */}
      <ArmsLayer hw={hw} uid={uid} />

      {/* 9. Neck */}
      <NeckLayer uid={uid} />

      {/* 10. Head (ears + circle) */}
      <HeadLayer skinTone={skinTone} uid={uid} />

      {/* 11. Hair / Helmet */}
      <HairHelmetLayer
        helmetStyle={helmetStyle}
        helmetColor={helmetColor}
        jerseyColor={jerseyColor}
        uid={uid}
      />

      {/* 12. Face features */}
      <FaceLayer expression={expression} />

      {/* 13. Accessories */}
      <AccessoryLayer
        type={accessory}
        jerseyColor={jerseyColor}
        skinTone={skinTone}
      />
    </svg>
  );
}
