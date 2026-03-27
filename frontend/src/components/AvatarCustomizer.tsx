"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, Check, RefreshCw, Dice5, Video, Save, Palette } from "lucide-react";
import { AvatarConfig } from "@/types/avatar";
import CricketAvatar from "./CricketAvatar";

interface AvatarCustomizerProps {
  initialConfig: AvatarConfig;
  onSave: (config: AvatarConfig) => void;
  onClose: () => void;
}

const SKIN_TONES = ["#FDDCBD", "#F5C5A3", "#E8A87C", "#C68642", "#8D5524", "#4A2912"];
const JERSEY_COLORS = ["#00FFAB", "#14d1ff", "#f97316", "#ec4899", "#a855f7", "#eab308", "#ef4444", "#22c55e", "#6366f1", "#ffffff"];
// IPL team colors + 2 neutrals — mirrors the jersey palette so helmet can match any team
const HELMET_COLORS = [
  "#1e3a8a", // MI Blue
  "#ca8a04", // CSK Gold
  "#dc2626", // RCB Red
  "#7e22ce", // KKR Purple
  "#1e293b", // GT Slate
  "#06b6d4", // LSG Cyan
  "#ea580c", // SRH Orange
  "#1d4ed8", // DC Blue
  "#db2777", // RR Pink
  "#6b7280", // PBKS Silver
  "#111111", // Black
  "#f0f0f0", // White
];

const IPL_TEAMS = [
  { name: "MI",   label: "Mumbai Blue 2024",      textColor: "#ffffff", gradient: "from-blue-600 to-blue-900",    bg: "#1e3a8a" },
  { name: "CSK",  label: "Chennai Gold 2024",     textColor: "#000000", gradient: "from-yellow-400 to-yellow-600",bg: "#ca8a04" },
  { name: "RCB",  label: "Bangalore Red 2024",    textColor: "#ffffff", gradient: "from-red-600 to-black",        bg: "#dc2626" },
  { name: "KKR",  label: "Kolkata Purple 2024",   textColor: "#ffffff", gradient: "from-purple-700 to-yellow-500",bg: "#7e22ce" },
  { name: "GT",   label: "Gujarat Steel 2024",    textColor: "#ffffff", gradient: "from-slate-800 to-yellow-400", bg: "#1e293b" },
  { name: "LSG",  label: "Lucknow Cyan 2024",     textColor: "#ffffff", gradient: "from-cyan-400 to-red-500",     bg: "#06b6d4" },
  { name: "SRH",  label: "Hyderabad Orange 2024", textColor: "#ffffff", gradient: "from-orange-500 to-black",     bg: "#ea580c" },
  { name: "DC",   label: "Delhi Blue 2024",       textColor: "#ffffff", gradient: "from-blue-800 to-red-600",     bg: "#1d4ed8" },
  { name: "RR",   label: "Rajasthan Pink 2024",   textColor: "#ffffff", gradient: "from-pink-600 to-pink-900",    bg: "#db2777" },
  { name: "PBKS", label: "Punjab Red 2024",       textColor: "#ffffff", gradient: "from-gray-400 to-red-600",     bg: "#6b7280" },
];

const HELMET_STYLES = [
  { label: "Classic", emoji: "🪖" },
  { label: "Cap",     emoji: "🧢" },
  { label: "Modern",  emoji: "⚡" },
  { label: "Retro",   emoji: "🏏" },
];
const EXPRESSIONS = [
  { label: "Happy",   emoji: "😊" },
  { label: "Fierce",  emoji: "😤" },
  { label: "Cheeky",  emoji: "😜" },
  { label: "Excited", emoji: "🤩" },
  { label: "Cool",    emoji: "😎" },
];
const BODY_TYPES = [
  { label: "Slim",  emoji: "🏃" },
  { label: "Broad", emoji: "💪" },
  { label: "Lean",  emoji: "⚡" },
];
const ACCESSORIES = [
  { label: "None",      emoji: "✕" },
  { label: "Sunnies",   emoji: "🕶️" },
  { label: "Band",      emoji: "💫" },
  { label: "War Paint", emoji: "🎨" },
  { label: "Earring",   emoji: "💎" },
  { label: "Bandana",   emoji: "🔴" },
];
const JERSEY_PATTERNS = [
  { label: "Plain",    emoji: "⬜" },
  { label: "H-Stripe", emoji: "〰️" },
  { label: "V-Neck",   emoji: "▽" },
  { label: "Panels",   emoji: "🔲" },
];

type TabId = "appearance" | "style" | "outfit" | "gear" | "save";
const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "appearance", icon: "face",           label: "Appearance" },
  { id: "style",      icon: "style",          label: "Style"      },
  { id: "outfit",     icon: "checkroom",      label: "Outfit"     },
  { id: "gear",       icon: "sports_cricket", label: "Gear"       },
  { id: "save",       icon: "save",           label: "Save"       },
];

const TAB_EMOJIS: Record<string, string> = {
  face: "👤",
  style: "✨",
  checkroom: "👕",
  sports_cricket: "🏏",
  save: "💾",
};

function randomInt(max: number) { return Math.floor(Math.random() * max); }
function randomColor(arr: string[]) { return arr[randomInt(arr.length)]; }

function randomConfig(): AvatarConfig {
  const teamColor = randomColor([...JERSEY_COLORS, ...IPL_TEAMS.map(t => t.bg)]);
  return {
    skinTone:      randomColor(SKIN_TONES),
    jerseyColor:   teamColor,
    helmetColor:   teamColor,   // helmet always matches jersey on randomize
    helmetStyle:   randomInt(4),
    accessory:     randomInt(6),
    expression:    randomInt(5),
    bodyType:      randomInt(3),
    jerseyPattern: randomInt(4),
    batStyle:      randomInt(3),
  };
}

function getActiveKitName(config: AvatarConfig): string {
  const team = IPL_TEAMS.find(t => t.bg === config.jerseyColor);
  return team ? team.label : "Custom Look";
}

export default function AvatarCustomizer({ initialConfig, onSave, onClose }: AvatarCustomizerProps) {
  const [config, setConfig]     = useState<AvatarConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<TabId>("outfit");
  const [mood, setMood]         = useState<"idle" | "celebrate">("idle");
  const [saving, setSaving]     = useState(false);

  const update = (patch: Partial<AvatarConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setMood("celebrate");
    setTimeout(() => setMood("idle"), 600);
  };

  const handleRandomize = () => {
    setConfig(randomConfig());
    setMood("celebrate");
    setTimeout(() => setMood("idle"), 800);
  };

  const handleSave = async () => {
    setSaving(true);
    setMood("celebrate");
    setTimeout(() => setMood("idle"), 800);
    await new Promise(r => setTimeout(r, 400));
    setSaving(false);
    onSave(config);
  };

  const activeKitName = getActiveKitName(config);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-hidden bg-[#0d0d0d]"
    >
      {/* ── Header ── */}
      <header
        className="fixed top-0 w-full flex justify-between items-center px-6 py-4 z-50"
        style={{
          background: "#1a1a1a",
          borderBottom: "2px solid #ff6341",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 overflow-hidden flex items-center justify-center"
            style={{
              background: "#0d0d0d",
              border: "2px solid #2a2a2a",
              borderRadius: "4px",
            }}
          >
            <div style={{ transform: "scale(1.15)", transformOrigin: "top center", marginTop: 2 }}>
              <CricketAvatar config={config} size="sm" mood="idle" interactive={false} />
            </div>
          </div>
          <h1
            className="text-xl text-[#ff6341] uppercase tracking-tight"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            The Digital Arena
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="btn-gray w-10 h-10 flex items-center justify-center !p-0"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </header>

      {/* ── Active Kit panel ── */}
      <div className="fixed top-24 left-6 z-40 max-w-[160px] pointer-events-none">
        <div
          className="p-3"
          style={{
            background: "#1a1a1a",
            border: "2px solid #2a2a2a",
            borderRadius: "4px",
            boxShadow: "4px 4px 0 0 #ff6341",
          }}
        >
          <p className="text-[10px] uppercase tracking-tighter text-white/40 font-black mb-1">Active Kit</p>
          <h3
            className="text-sm text-[#ff6341] leading-tight"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            {activeKitName}
          </h3>
          <div className="flex items-center gap-1 mt-2">
            <span
              className="w-2 h-2 bg-[#ff6341] animate-pulse"
              style={{ borderRadius: "1px" }}
            />
            <span className="text-[10px] text-[#ff6341] font-black">PREVIEW ACTIVE</span>
          </div>
        </div>
      </div>

      {/* ── Main: Avatar + right buttons ── */}
      <main className="relative h-full flex items-center justify-center pt-20 pb-[420px] overflow-hidden">
        {/* Right floating buttons */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40">
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={handleRandomize}
            className="btn-secondary w-12 h-12 flex items-center justify-center !p-0"
          >
            <RefreshCw className="w-5 h-5 text-[#ff6341]" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            className="btn-secondary w-12 h-12 flex items-center justify-center !p-0"
          >
            <Video className="w-5 h-5 text-[#ff6341]" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={handleRandomize}
            className="btn-secondary w-12 h-12 flex items-center justify-center !p-0"
          >
            <Dice5 className="w-5 h-5 text-[#ff6341]" />
          </motion.button>
        </div>

        {/* Live editable avatar — full-body, scales with config */}
        <motion.div
          key={JSON.stringify(config)}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
        >
          {/* 250x450 display area — lg avatar (100x180) scaled x2.5 */}
          <div style={{ width: 250, height: 450, position: "relative", overflow: "visible" }}>
            <div style={{ transform: "scale(2.5)", transformOrigin: "top center", display: "inline-block" }}>
              <CricketAvatar config={config} size="lg" mood={mood} interactive={false} />
            </div>
          </div>
        </motion.div>
      </main>

      {/* ── Floating Randomize bar ── */}
      <div className="fixed left-1/2 -translate-x-1/2 z-40" style={{ bottom: "416px" }}>
        <motion.button
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={handleRandomize}
          className="btn-secondary px-8 py-3 flex items-center gap-3 text-white"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          <Dice5 className="w-5 h-5 text-[#ff6341]" />
          RANDOMIZE
        </motion.button>
      </div>

      {/* ── Bottom Sheet ── */}
      <section className="fixed bottom-0 left-0 w-full z-50 flex flex-col items-center">
        {/* Pull handle */}
        <div
          className="w-12 h-1.5 mb-3"
          style={{ background: "#ff6341", borderRadius: "2px" }}
        />
        <div
          className="w-full pt-4 pb-8"
          style={{
            background: "#1a1a1a",
            borderTop: "3px solid #ff6341",
            borderRadius: "4px 4px 0 0",
          }}
        >

          {/* Tabs */}
          <nav className="flex justify-around items-center px-4 mb-6">
            {TABS.map(tab => (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileTap={{ scale: 0.9 }}
                className={`flex flex-col items-center justify-center transition-all duration-100 px-3 py-2 ${
                  activeTab === tab.id
                    ? ""
                    : "text-white/40 hover:text-[#ff6341]"
                }`}
                style={activeTab === tab.id ? {
                  background: "#ff6341",
                  color: "#000000",
                  borderRadius: "3px",
                  border: "2px solid #000000",
                  boxShadow: "3px 3px 0 0 #000000",
                } : undefined}
              >
                <span className="mb-0.5 text-xl leading-none">{TAB_EMOJIS[tab.icon] || "?"}</span>
                <span className="font-black text-[10px] tracking-widest uppercase whitespace-nowrap">
                  {tab.label}
                </span>
              </motion.button>
            ))}
          </nav>

          {/* Options grid */}
          <div className="px-6 max-h-48 overflow-y-auto">

            {/* Appearance: skin tones + body type */}
            {activeTab === "appearance" && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black">Skin Tone</p>
                <div className="grid grid-cols-6 gap-3">
                  {SKIN_TONES.map(color => (
                    <SwatchCard
                      key={color}
                      color={color}
                      selected={config.skinTone === color}
                      onSelect={() => update({ skinTone: color })}
                    />
                  ))}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black pt-1">Body Type</p>
                <div className="grid grid-cols-3 gap-3">
                  {BODY_TYPES.map((b, i) => (
                    <OptionCard key={i} emoji={b.emoji} label={b.label} selected={config.bodyType === i} onSelect={() => update({ bodyType: i })} />
                  ))}
                </div>
              </div>
            )}

            {/* Style: expression + pattern */}
            {activeTab === "style" && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black">Expression</p>
                <div className="grid grid-cols-4 gap-3">
                  {EXPRESSIONS.map((e, i) => (
                    <OptionCard key={i} emoji={e.emoji} label={e.label} selected={config.expression === i} onSelect={() => update({ expression: i })} />
                  ))}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black pt-1">Jersey Pattern</p>
                <div className="grid grid-cols-4 gap-3">
                  {JERSEY_PATTERNS.map((p, i) => (
                    <OptionCard key={i} emoji={p.emoji} label={p.label} selected={config.jerseyPattern === i} onSelect={() => update({ jerseyPattern: i })} />
                  ))}
                </div>
              </div>
            )}

            {/* Outfit: IPL teams + solid colors */}
            {activeTab === "outfit" && (
              <div className="grid grid-cols-4 gap-4">
                {IPL_TEAMS.map(team => (
                  <TeamCard
                    key={team.name}
                    team={team}
                    selected={config.jerseyColor === team.bg}
                    onSelect={() => update({ jerseyColor: team.bg, helmetColor: team.bg })}
                  />
                ))}
                {JERSEY_COLORS.map(color => (
                  <SwatchCard
                    key={color}
                    color={color}
                    selected={config.jerseyColor === color}
                    onSelect={() => update({ jerseyColor: color })}
                  />
                ))}
              </div>
            )}

            {/* Gear: helmet color + style + accessory */}
            {activeTab === "gear" && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black">Helmet Color</p>
                <div className="grid grid-cols-4 gap-3">
                  {HELMET_COLORS.map(color => (
                    <SwatchCard
                      key={color}
                      color={color}
                      selected={config.helmetColor === color}
                      onSelect={() => update({ helmetColor: color })}
                    />
                  ))}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black pt-1">Helmet Style</p>
                <div className="grid grid-cols-4 gap-3">
                  {HELMET_STYLES.map((h, i) => (
                    <OptionCard key={i} emoji={h.emoji} label={h.label} selected={config.helmetStyle === i} onSelect={() => update({ helmetStyle: i })} />
                  ))}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black pt-1">Accessory</p>
                <div className="grid grid-cols-4 gap-3">
                  {ACCESSORIES.map((a, i) => (
                    <OptionCard key={i} emoji={a.emoji} label={a.label} selected={config.accessory === i} onSelect={() => update({ accessory: i })} />
                  ))}
                </div>
              </div>
            )}

            {/* Save tab */}
            {activeTab === "save" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <p className="text-sm text-white/50 text-center">Lock in your look and hit the arena</p>
                <div className="info-pill flex items-center gap-2">
                  <span
                    className="w-2 h-2 bg-[#ff6341] animate-pulse"
                    style={{ borderRadius: "1px" }}
                  />
                  <span className="text-xs text-[#ff6341] font-black">{activeKitName}</span>
                </div>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="mt-8 px-6">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={saving}
              className="btn-sticker btn-orange w-full py-4 text-lg tracking-widest flex items-center justify-center gap-3 disabled:opacity-60"
            >
              <Save className="w-5 h-5" />
              {saving ? "SAVING..." : "CONFIRM LOOK"}
            </motion.button>
          </div>

        </div>
      </section>
    </motion.div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TeamCard({
  team, selected, onSelect,
}: { team: typeof IPL_TEAMS[0]; selected: boolean; onSelect: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onSelect}>
      <motion.div
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        className="aspect-square p-2 flex items-center justify-center transition-all"
        style={{
          background: "#0d0d0d",
          borderRadius: "4px",
          border: selected ? "3px solid #ff6341" : "2px solid #2a2a2a",
          boxShadow: selected ? "4px 4px 0 0 #ff6341" : "none",
        }}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            background: team.bg,
            borderRadius: "2px",
          }}
        >
          <span
            className="text-xs"
            style={{ color: team.textColor, fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            {team.name}
          </span>
        </div>
      </motion.div>
      {selected && (
        <div
          className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center"
          style={{
            background: "#ff6341",
            borderRadius: "2px",
            border: "2px solid #000000",
          }}
        >
          <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

function SwatchCard({ color, selected, onSelect }: { color: string; selected: boolean; onSelect: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onSelect}>
      <motion.div
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
        className="aspect-square transition-all"
        style={{
          background: color,
          borderRadius: "4px",
          border: selected ? "3px solid #ff6341" : "2px solid #2a2a2a",
          boxShadow: selected ? "4px 4px 0 0 #ff6341" : "none",
        }}
      />
      {selected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center"
          style={{
            background: "#ff6341",
            borderRadius: "2px",
            border: "2px solid #000000",
          }}
        >
          <Check className="w-3 h-3 text-black" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

function OptionCard({ emoji, label, selected, onSelect }: { emoji: string; label: string; selected: boolean; onSelect: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onSelect}>
      <motion.div
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
        className="aspect-square flex flex-col items-center justify-center gap-1 transition-all"
        style={{
          background: "#0d0d0d",
          borderRadius: "4px",
          border: selected ? "3px solid #ff6341" : "2px solid #2a2a2a",
          boxShadow: selected ? "4px 4px 0 0 #ff6341" : "none",
        }}
      >
        <span className="text-xl leading-none">{emoji}</span>
        <span className="font-black text-[9px] text-center uppercase tracking-wider text-white/60 px-1 leading-tight">{label}</span>
      </motion.div>
      {selected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center"
          style={{
            background: "#ff6341",
            borderRadius: "2px",
            border: "2px solid #000000",
          }}
        >
          <Check className="w-3 h-3 text-black" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}
