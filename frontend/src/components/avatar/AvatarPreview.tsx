"use client";

/**
 * AvatarPreview v2 — chibi / streetwear avatar.
 *
 * 14 memo'd layers, viewBox 0 0 100 180. Each layer is a small React.memo
 * component so changing one config field re-renders only the affected layer.
 * Same viewBox/dimensions as v1 so the wrapper sizes (sm/md/lg) stay stable.
 *
 * Layer order (bottom → top):
 *   Shadow → Sneakers → Socks → Legs → Shorts → Arms →
 *   Tee body → Tee accent → Tee chest text → Bracelets →
 *   Head → Hair → Face → Sunglasses → Gold chain + Earring
 */

import { memo } from "react";
import { AvatarConfig } from "@/types/avatar";
import {
  SNEAKER_PALETTES,
  getTeeFill,
  getTeeText,
  getAccent,
} from "./avatarAssets";

// ── Color helpers ─────────────────────────────────────────────────────────

function darken(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const n = parseInt(c.length === 3 ? c.split("").map(x => x + x).join("") : c, 16);
  if (isNaN(n)) return hex;
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amount));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function lighten(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const n = parseInt(c.length === 3 ? c.split("").map(x => x + x).join("") : c, 16);
  if (isNaN(n)) return hex;
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (n & 0xff) + Math.round(255 * amount));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

// ── Layer components ─────────────────────────────────────────────────────

const Shadow = memo(function Shadow() {
  return <ellipse cx={50} cy={177} rx={26} ry={2.6} fill="#000" opacity={0.28} />;
});

const Sneakers = memo(function Sneakers({ palette }: { palette: typeof SNEAKER_PALETTES[number] }) {
  return (
    <g>
      <path d="M28 172 L72 172 L74 176 L26 176 Z" fill={palette.sole} />
      <path d="M30 162 L46 162 L46 173 L28 173 Z" fill={palette.body} stroke={darken(palette.body, 0.12)} strokeWidth={0.6} />
      <path d="M54 162 L70 162 L72 173 L54 173 Z" fill={palette.body} stroke={darken(palette.body, 0.12)} strokeWidth={0.6} />
      <path d="M34 164 L36 164 L36 172 L34 172 Z" fill={palette.accent} />
      <path d="M38 164 L40 164 L40 172 L38 172 Z" fill={palette.accent} />
      <path d="M58 164 L60 164 L60 172 L58 172 Z" fill={palette.accent} />
      <path d="M62 164 L64 164 L64 172 L62 172 Z" fill={palette.accent} />
      <ellipse cx={32} cy={171} rx={4} ry={2.5} fill={palette.body} stroke={darken(palette.body, 0.1)} strokeWidth={0.4} />
      <ellipse cx={68} cy={171} rx={4} ry={2.5} fill={palette.body} stroke={darken(palette.body, 0.1)} strokeWidth={0.4} />
      <path d="M36 162 L42 162 L41 158 L37 158 Z" fill={palette.lace} stroke={darken(palette.lace, 0.15)} strokeWidth={0.4} />
      <path d="M58 162 L64 162 L63 158 L59 158 Z" fill={palette.lace} stroke={darken(palette.lace, 0.15)} strokeWidth={0.4} />
    </g>
  );
});

const Socks = memo(function Socks() {
  return (
    <g>
      <rect x={33} y={154} width={13} height={9} fill="#ffffff" />
      <rect x={54} y={154} width={13} height={9} fill="#ffffff" />
      <rect x={33} y={154} width={13} height={1.2} fill="#e5e7eb" />
      <rect x={54} y={154} width={13} height={1.2} fill="#e5e7eb" />
    </g>
  );
});

const Legs = memo(function Legs({ skinTone }: { skinTone: string }) {
  const shade = darken(skinTone, 0.12);
  return (
    <g>
      <rect x={36} y={140} width={10} height={16} fill={skinTone} />
      <rect x={54} y={140} width={10} height={16} fill={skinTone} />
      <rect x={36} y={140} width={2}  height={16} fill={shade} opacity={0.5} />
      <rect x={54} y={140} width={2}  height={16} fill={shade} opacity={0.5} />
    </g>
  );
});

const Shorts = memo(function Shorts() {
  return (
    <g>
      <path d="M28 116 L72 116 L70 142 L52 142 L51 124 L49 124 L48 142 L30 142 Z" fill="#1a1a1a" />
      <path d="M30 141 L48 141 M52 141 L70 141" stroke="#3a3a3a" strokeWidth={0.6} fill="none" />
      <rect x={28} y={116} width={44} height={2.5} fill="#0a0a0a" />
      <path d="M28 118 L30 142" stroke="#3a3a3a" strokeWidth={0.4} fill="none" opacity={0.6} />
      <path d="M72 118 L70 142" stroke="#3a3a3a" strokeWidth={0.4} fill="none" opacity={0.6} />
    </g>
  );
});

const Arms = memo(function Arms({ skinTone }: { skinTone: string }) {
  const shade = darken(skinTone, 0.12);
  return (
    <g>
      <path d="M14 96 L26 96 L24 118 L14 116 Z" fill={skinTone} />
      <path d="M86 96 L74 96 L76 118 L86 116 Z" fill={skinTone} />
      <path d="M14 96 L17 96 L16 116 L14 116 Z" fill={shade} opacity={0.5} />
      <path d="M86 96 L83 96 L84 116 L86 116 Z" fill={shade} opacity={0.5} />
    </g>
  );
});

const TeeBody = memo(function TeeBody({ team, uid }: { team: string; uid: string }) {
  const fill = getTeeFill(team);
  const shade = darken(fill, 0.1);
  const gradId = `${uid}_tee`;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={lighten(fill, 0.06)} />
          <stop offset="60%"  stopColor={fill} />
          <stop offset="100%" stopColor={shade} />
        </linearGradient>
      </defs>
      {/* Oversized tee silhouette — extends past shoulder line for streetwear cut. */}
      <path
        d="M30 80
           Q34 76 42 78
           L40 84
           Q34 86 28 88
           L14 90
           L14 96
           L26 96
           L26 118
           L74 118
           L74 96
           L86 96
           L86 90
           L72 88
           Q66 86 60 84
           L58 78
           Q66 76 70 80
           L72 86
           L72 118
           L28 118
           L28 86 Z"
        fill={`url(#${gradId})`}
      />
      <ellipse cx={50} cy={80} rx={9} ry={3} fill={darken(fill, 0.25)} />
    </g>
  );
});

const TeeAccent = memo(function TeeAccent({ team }: { team: string }) {
  const a = getAccent(team);
  return (
    <g>
      {a.collar      && <path d={a.collar}      fill={a.accentColor} />}
      {a.sleeveTrimL && <path d={a.sleeveTrimL} fill={a.accentColor} />}
      {a.sleeveTrimR && <path d={a.sleeveTrimR} fill={a.accentColor} />}
      {a.sidePanelL  && <path d={a.sidePanelL}  fill={a.accentColor} />}
      {a.sidePanelR  && <path d={a.sidePanelR}  fill={a.accentColor} />}
    </g>
  );
});

const TeeText = memo(function TeeText({ team }: { team: string }) {
  const t = getTeeText(team);
  if (!t) return null;
  return (
    <text
      x={50}
      y={104}
      textAnchor="middle"
      fontFamily="'Bungee', 'Impact', sans-serif"
      fontWeight={800}
      fontSize={t.label.length >= 4 ? 6.5 : 8}
      fill={t.color}
      letterSpacing={0.5}
    >
      {t.label}
    </text>
  );
});

const Bracelets = memo(function Bracelets({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <g>
      <ellipse cx={20} cy={114} rx={5}   ry={1.4} fill="#facc15" stroke="#854d0e" strokeWidth={0.3} />
      <ellipse cx={20} cy={116} rx={4.6} ry={1.3} fill="#fbbf24" stroke="#854d0e" strokeWidth={0.3} />
      <ellipse cx={80} cy={114} rx={5}   ry={1.4} fill="#facc15" stroke="#854d0e" strokeWidth={0.3} />
      <ellipse cx={80} cy={116} rx={4.6} ry={1.3} fill="#fbbf24" stroke="#854d0e" strokeWidth={0.3} />
    </g>
  );
});

const Head = memo(function Head({ skinTone, uid }: { skinTone: string; uid: string }) {
  const shade = darken(skinTone, 0.15);
  const gradId = `${uid}_head`;
  return (
    <g>
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="65%">
          <stop offset="0%"   stopColor={lighten(skinTone, 0.07)} />
          <stop offset="65%"  stopColor={skinTone} />
          <stop offset="100%" stopColor={shade} />
        </radialGradient>
      </defs>
      <rect x={45} y={72} width={10} height={6} fill={shade} />
      <rect x={45} y={72} width={10} height={2} fill={skinTone} opacity={0.6} />
      <ellipse cx={50} cy={48} rx={24} ry={26} fill={`url(#${gradId})`} />
      <ellipse cx={26} cy={50} rx={3}   ry={4.5} fill={skinTone} />
      <ellipse cx={74} cy={50} rx={3}   ry={4.5} fill={skinTone} />
      <ellipse cx={26} cy={50} rx={1.5} ry={2.5} fill={shade} opacity={0.6} />
      <ellipse cx={74} cy={50} rx={1.5} ry={2.5} fill={shade} opacity={0.6} />
    </g>
  );
});

const Hair = memo(function Hair({ style }: { style: number }) {
  const HAIR = "#1a1a1a";
  const HIGHLIGHT = "#3a3a3a";

  if (style === 0) {
    // Braids — long strands framing the face down past shoulders.
    return (
      <g>
        <path d="M26 30 Q50 14 74 30 Q76 40 74 48 Q66 38 50 36 Q34 38 26 48 Q24 40 26 30 Z" fill={HAIR} />
        <path d="M32 24 Q34 22 36 24 Q34 26 32 24 Z M40 20 Q42 18 44 20 Q42 22 40 20 Z M50 18 Q52 16 54 18 Q52 20 50 18 Z M60 20 Q62 18 64 20 Q62 22 60 20 Z M68 24 Q70 22 72 24 Q70 26 68 24 Z" fill={HIGHLIGHT} />
        <path d="M22 46 Q18 70 16 96 Q18 110 22 122 Q24 110 24 95 Q26 70 28 50 Z" fill={HAIR} />
        <path d="M28 52 Q24 80 22 112 Q24 124 28 130 Q32 122 32 100 Q34 80 34 56 Z" fill={HAIR} />
        <path d="M78 46 Q82 70 84 96 Q82 110 78 122 Q76 110 76 95 Q74 70 72 50 Z" fill={HAIR} />
        <path d="M72 52 Q76 80 78 112 Q76 124 72 130 Q68 122 68 100 Q66 80 66 56 Z" fill={HAIR} />
        <path d="M20 60 Q22 60 22 62 M19 75 Q21 75 21 77 M18 92 Q20 92 20 94 M19 108 Q21 108 21 110" stroke={HIGHLIGHT} strokeWidth={0.6} fill="none" />
        <path d="M80 60 Q78 60 78 62 M81 75 Q79 75 79 77 M82 92 Q80 92 80 94 M81 108 Q79 108 79 110" stroke={HIGHLIGHT} strokeWidth={0.6} fill="none" />
      </g>
    );
  }
  if (style === 1) {
    // Buzz — tight skull cap, just a dark dome above the head.
    return (
      <g>
        <path d="M28 32 Q50 18 72 32 Q74 38 73 44 Q60 32 50 32 Q40 32 27 44 Q26 38 28 32 Z" fill={HAIR} />
        <path d="M28 42 Q50 36 72 42" stroke={HIGHLIGHT} strokeWidth={1} fill="none" opacity={0.6} />
      </g>
    );
  }
  if (style === 2) {
    // Curls — puffy outline expanding above + sides of head.
    return (
      <g>
        <ellipse cx={50} cy={28} rx={28} ry={14} fill={HAIR} />
        <ellipse cx={32} cy={36} rx={9}  ry={11} fill={HAIR} />
        <ellipse cx={68} cy={36} rx={9}  ry={11} fill={HAIR} />
        <ellipse cx={28} cy={50} rx={6}  ry={8}  fill={HAIR} />
        <ellipse cx={72} cy={50} rx={6}  ry={8}  fill={HAIR} />
        <ellipse cx={42} cy={22} rx={4}  ry={3}  fill={HIGHLIGHT} opacity={0.5} />
        <ellipse cx={58} cy={22} rx={4}  ry={3}  fill={HIGHLIGHT} opacity={0.5} />
      </g>
    );
  }
  // Locs — medium-length textured strands ending around shoulder level.
  return (
    <g>
      <path d="M26 30 Q50 14 74 30 Q76 44 74 56 Q60 44 50 44 Q40 44 26 56 Q24 44 26 30 Z" fill={HAIR} />
      <rect x={22} y={48} width={4} height={32} rx={2}   fill={HAIR} />
      <rect x={28} y={50} width={4} height={36} rx={2}   fill={HAIR} />
      <rect x={68} y={50} width={4} height={36} rx={2}   fill={HAIR} />
      <rect x={74} y={48} width={4} height={32} rx={2}   fill={HAIR} />
      <rect x={34} y={52} width={3} height={32} rx={1.5} fill={HAIR} />
      <rect x={63} y={52} width={3} height={32} rx={1.5} fill={HAIR} />
    </g>
  );
});

const Face = memo(function Face({ expression, hidden }: { expression: number; hidden: boolean }) {
  return (
    <g>
      {/* Brows */}
      {expression === 1 && (
        <>
          <path d="M36 44 L46 46" stroke="#1a1a1a" strokeWidth={1.5} strokeLinecap="round" />
          <path d="M64 44 L54 46" stroke="#1a1a1a" strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
      {expression === 3 && (
        <>
          <path d="M36 42 Q40 39 46 42" stroke="#1a1a1a" strokeWidth={1.5} strokeLinecap="round" fill="none" />
          <path d="M54 42 Q60 39 64 42" stroke="#1a1a1a" strokeWidth={1.5} strokeLinecap="round" fill="none" />
        </>
      )}
      {(expression === 0 || expression === 2 || expression === 4) && (
        <>
          <path d="M36 44 L46 44" stroke="#1a1a1a" strokeWidth={1.5} strokeLinecap="round" />
          <path d="M54 44 L64 44" stroke="#1a1a1a" strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}

      {/* Eyes — only when not behind sunglasses */}
      {!hidden && (
        <>
          {expression === 2 ? (
            <>
              <ellipse cx={41} cy={51} rx={2.2} ry={2.6} fill="#1a1a1a" />
              <path d="M53 51 Q57 49 61 51" stroke="#1a1a1a" strokeWidth={1.2} fill="none" />
            </>
          ) : (
            <>
              <ellipse cx={41} cy={51} rx={2.2} ry={2.6} fill="#1a1a1a" />
              <ellipse cx={59} cy={51} rx={2.2} ry={2.6} fill="#1a1a1a" />
              <circle cx={42} cy={50} r={0.7} fill="#fff" />
              <circle cx={60} cy={50} r={0.7} fill="#fff" />
            </>
          )}
        </>
      )}

      {/* Nose hint */}
      <path d="M50 55 L48 60 L52 60 Z" fill="#000" opacity={0.18} />

      {/* Mouth */}
      {expression === 0 && <path d="M44 65 Q50 69 56 65" stroke="#1a1a1a" strokeWidth={1.4} fill="none" strokeLinecap="round" />}
      {expression === 1 && <path d="M44 65 L56 65" stroke="#1a1a1a" strokeWidth={1.6} strokeLinecap="round" />}
      {expression === 2 && <path d="M43 65 Q50 70 57 64" stroke="#1a1a1a" strokeWidth={1.4} fill="none" strokeLinecap="round" />}
      {expression === 3 && (
        <>
          <ellipse cx={50} cy={66}   rx={3.5} ry={2.2} fill="#1a1a1a" />
          <ellipse cx={50} cy={66.5} rx={2.5} ry={1}   fill="#dc2626" />
        </>
      )}
      {expression === 4 && <path d="M44 66 Q50 64 56 66" stroke="#1a1a1a" strokeWidth={1.4} fill="none" strokeLinecap="round" />}
    </g>
  );
});

const Sunglasses = memo(function Sunglasses({ style }: { style: number }) {
  if (style === 2) return null;

  const FRAME = "#1a1a1a";
  const LENS  = "#0a0a0a";

  if (style === 0) {
    return (
      <g>
        <circle cx={41} cy={51} r={6.5} fill={LENS} stroke={FRAME} strokeWidth={1} />
        <circle cx={59} cy={51} r={6.5} fill={LENS} stroke={FRAME} strokeWidth={1} />
        <path   d="M47.5 51 L52.5 51" stroke={FRAME} strokeWidth={1.4} />
        <ellipse cx={39} cy={48} rx={1.6} ry={1.2} fill="#fff" opacity={0.45} />
        <ellipse cx={57} cy={48} rx={1.6} ry={1.2} fill="#fff" opacity={0.45} />
      </g>
    );
  }
  return (
    <g>
      <path d="M32 48 Q50 44 68 48 L68 54 Q50 56 32 54 Z" fill={LENS} stroke={FRAME} strokeWidth={1} />
      <path d="M34 49 Q50 46 66 49" stroke="#fff" strokeWidth={0.8} opacity={0.4} fill="none" />
    </g>
  );
});

const GoldChain = memo(function GoldChain({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <g>
      <path d="M40 80 Q50 90 60 80" stroke="#facc15" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <circle cx={50} cy={88} r={1.4} fill="#facc15" stroke="#854d0e" strokeWidth={0.3} />
    </g>
  );
});

const GoldEarring = memo(function GoldEarring({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <g>
      <ellipse cx={26} cy={56} rx={1.6} ry={1.6} fill="#facc15" stroke="#854d0e" strokeWidth={0.3} />
      <ellipse cx={74} cy={56} rx={1.6} ry={1.6} fill="#facc15" stroke="#854d0e" strokeWidth={0.3} />
    </g>
  );
});

// ── Main component ──────────────────────────────────────────────────────────

interface AvatarPreviewProps {
  config: AvatarConfig;
  uid: string;
  width: number;
  height: number;
}

function AvatarPreview({ config, uid, width, height }: AvatarPreviewProps) {
  const palette = SNEAKER_PALETTES[config.sneakerColor] || SNEAKER_PALETTES[0];

  return (
    <svg
      viewBox="0 0 100 180"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <Shadow />
      <Sneakers palette={palette} />
      <Socks />
      <Legs skinTone={config.skinTone} />
      <Shorts />
      <Arms skinTone={config.skinTone} />
      <TeeBody team={config.jerseyTeam} uid={uid} />
      <TeeAccent team={config.jerseyTeam} />
      <TeeText team={config.jerseyTeam} />
      <Bracelets show={config.goldBracelet} />
      <Head skinTone={config.skinTone} uid={uid} />
      <Hair style={config.hairStyle} />
      <Face expression={config.expression} hidden={config.sunglasses !== 2} />
      <Sunglasses style={config.sunglasses} />
      <GoldChain show={config.goldChain} />
      <GoldEarring show={config.goldEarring} />
    </svg>
  );
}

export default memo(AvatarPreview);
