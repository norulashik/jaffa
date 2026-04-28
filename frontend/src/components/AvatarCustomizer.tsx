"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, Check, Dice5, Save } from "lucide-react";
import { AvatarConfig, TEAM_KEYS } from "@/types/avatar";
import CricketAvatar from "./CricketAvatar";
import { TEAM_COLORS } from "@/lib/teamColors";
import {
  HAIR_LABELS,
  SUNGLASSES_LABELS,
  EXPRESSION_LABELS,
  SNEAKER_PALETTES,
} from "./avatar/avatarAssets";

interface AvatarCustomizerProps {
  initialConfig: AvatarConfig;
  onSave: (config: AvatarConfig) => void;
  onClose: () => void;
}

const SKIN_TONES = ["#FDDCBD", "#F5C5A3", "#E8A87C", "#C68642", "#8D5524", "#4A2912"];

type TabId = "look" | "hair" | "outfit" | "drip";
const TABS: { id: TabId; emoji: string; label: string }[] = [
  { id: "look",   emoji: "👤", label: "Look"        },
  { id: "hair",   emoji: "💇", label: "Hair"        },
  { id: "outfit", emoji: "👕", label: "Outfit"      },
  { id: "drip",   emoji: "💎", label: "Drip"        },
];

function randInt(max: number) { return Math.floor(Math.random() * max); }
function randBool() { return Math.random() < 0.5; }

function randomConfig(): AvatarConfig {
  const teamPool = TEAM_KEYS.filter(t => t !== "NONE");
  return {
    version: 2,
    skinTone: SKIN_TONES[randInt(SKIN_TONES.length)],
    expression: randInt(5),
    hairStyle: randInt(4),
    sunglasses: randInt(3),
    jerseyTeam: teamPool[randInt(teamPool.length)],
    sneakerColor: randInt(SNEAKER_PALETTES.length),
    goldChain: randBool(),
    goldBracelet: randBool(),
    goldEarring: randBool(),
  };
}

function activeKitName(cfg: AvatarConfig): string {
  if (cfg.jerseyTeam === "NONE") return "Plain Tee";
  return `${cfg.jerseyTeam} Drip`;
}

export default function AvatarCustomizer({ initialConfig, onSave, onClose }: AvatarCustomizerProps) {
  const [config, setConfig]       = useState<AvatarConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<TabId>("outfit");
  const [mood, setMood]           = useState<"idle" | "celebrate">("idle");
  const [saving, setSaving]       = useState(false);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-hidden bg-[#0d0d0d]"
    >
      {/* Header */}
      <header
        className="fixed top-0 w-full flex justify-between items-center px-6 py-4 z-50"
        style={{ background: "#1a1a1a", borderBottom: "2px solid #ff6341" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 overflow-hidden flex items-center justify-center"
            style={{ background: "#0d0d0d", border: "2px solid #2a2a2a", borderRadius: "4px" }}
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
        <button onClick={onClose} className="btn-gray w-10 h-10 flex items-center justify-center !p-0">
          <X className="w-5 h-5 text-white/60" />
        </button>
      </header>

      {/* Active kit pill */}
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
            {activeKitName(config)}
          </h3>
        </div>
      </div>

      {/* Main avatar preview */}
      <main className="relative h-full flex items-center justify-center pt-20 pb-[420px] overflow-hidden">
        <motion.div
          key={JSON.stringify(config)}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
        >
          <div style={{ width: 250, height: 450, position: "relative", overflow: "visible" }}>
            <div style={{ transform: "scale(2.5)", transformOrigin: "top center", display: "inline-block" }}>
              <CricketAvatar config={config} size="lg" mood={mood} interactive={false} />
            </div>
          </div>
        </motion.div>
      </main>

      {/* Floating randomize */}
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

      {/* Bottom sheet */}
      <section className="fixed bottom-0 left-0 w-full z-50 flex flex-col items-center">
        <div className="w-12 h-1.5 mb-3" style={{ background: "#ff6341", borderRadius: "2px" }} />
        <div
          className="w-full pt-4 pb-8"
          style={{ background: "#1a1a1a", borderTop: "3px solid #ff6341", borderRadius: "4px 4px 0 0" }}
        >
          {/* Tabs */}
          <nav className="flex justify-around items-center px-4 mb-6">
            {TABS.map(tab => (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileTap={{ scale: 0.9 }}
                className={`flex flex-col items-center justify-center transition-all duration-100 px-3 py-2 ${
                  activeTab === tab.id ? "" : "text-white/40 hover:text-[#ff6341]"
                }`}
                style={activeTab === tab.id ? {
                  background: "#ff6341",
                  color: "#000000",
                  borderRadius: "3px",
                  border: "2px solid #000000",
                  boxShadow: "3px 3px 0 0 #000000",
                } : undefined}
              >
                <span className="mb-0.5 text-xl leading-none">{tab.emoji}</span>
                <span className="font-black text-[10px] tracking-widest uppercase whitespace-nowrap">
                  {tab.label}
                </span>
              </motion.button>
            ))}
          </nav>

          {/* Content */}
          <div className="px-6 max-h-56 overflow-y-auto">
            {/* Look — skin tone + expression */}
            {activeTab === "look" && (
              <div className="space-y-3">
                <Section label="Skin Tone">
                  <div className="grid grid-cols-6 gap-3">
                    {SKIN_TONES.map(c => (
                      <SwatchCard key={c} color={c} selected={config.skinTone === c} onSelect={() => update({ skinTone: c })} />
                    ))}
                  </div>
                </Section>
                <Section label="Expression">
                  <div className="grid grid-cols-5 gap-3">
                    {EXPRESSION_LABELS.map((e, i) => (
                      <OptionCard key={i} emoji={e.emoji} label={e.label} selected={config.expression === i} onSelect={() => update({ expression: i })} />
                    ))}
                  </div>
                </Section>
              </div>
            )}

            {/* Hair — style */}
            {activeTab === "hair" && (
              <Section label="Hair Style">
                <div className="grid grid-cols-4 gap-3">
                  {HAIR_LABELS.map((h, i) => (
                    <OptionCard key={i} emoji={h.emoji} label={h.label} selected={config.hairStyle === i} onSelect={() => update({ hairStyle: i })} />
                  ))}
                </div>
              </Section>
            )}

            {/* Outfit — jersey team picker */}
            {activeTab === "outfit" && (
              <Section label="Jersey">
                <div className="grid grid-cols-4 gap-3">
                  {TEAM_KEYS.map(team => (
                    <TeamCard
                      key={team}
                      team={team}
                      selected={config.jerseyTeam === team}
                      onSelect={() => update({ jerseyTeam: team })}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* Drip — sunglasses + sneakers + gold */}
            {activeTab === "drip" && (
              <div className="space-y-3">
                <Section label="Sunglasses">
                  <div className="grid grid-cols-3 gap-3">
                    {SUNGLASSES_LABELS.map((s, i) => (
                      <OptionCard key={i} emoji={s.emoji} label={s.label} selected={config.sunglasses === i} onSelect={() => update({ sunglasses: i })} />
                    ))}
                  </div>
                </Section>
                <Section label="Sneakers">
                  <div className="grid grid-cols-5 gap-3">
                    {SNEAKER_PALETTES.map((p, i) => (
                      <SneakerCard key={i} palette={p} selected={config.sneakerColor === i} onSelect={() => update({ sneakerColor: i })} />
                    ))}
                  </div>
                </Section>
                <Section label="Gold">
                  <div className="grid grid-cols-3 gap-3">
                    <ToggleCard emoji="📿" label="Chain"    selected={config.goldChain}    onToggle={() => update({ goldChain:    !config.goldChain    })} />
                    <ToggleCard emoji="⛓️" label="Bracelet" selected={config.goldBracelet} onToggle={() => update({ goldBracelet: !config.goldBracelet })} />
                    <ToggleCard emoji="💎" label="Earring"  selected={config.goldEarring}  onToggle={() => update({ goldEarring:  !config.goldEarring  })} />
                  </div>
                </Section>
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-white/40 font-black">{label}</p>
      {children}
    </div>
  );
}

function TeamCard({ team, selected, onSelect }: { team: string; selected: boolean; onSelect: () => void }) {
  const isNone = team === "NONE";
  const t = TEAM_COLORS[team];
  const bg = isNone ? "#f5f5f5" : (t?.primary || "#1a1a1a");
  const fg = isNone ? "#1a1a1a" : (t?.text    || "#fff");
  const label = isNone ? "—" : team;
  return (
    <div className="relative cursor-pointer" onClick={onSelect}>
      <motion.div
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        className="aspect-square p-1.5 flex items-center justify-center transition-all"
        style={{
          background: "#0d0d0d",
          borderRadius: "4px",
          border: selected ? "3px solid #ff6341" : "2px solid #2a2a2a",
          boxShadow: selected ? "4px 4px 0 0 #ff6341" : "none",
        }}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: bg, borderRadius: "2px" }}
        >
          <span className="text-xs" style={{ color: fg, fontFamily: "'Bungee', 'Impact', cursive" }}>
            {label}
          </span>
        </div>
      </motion.div>
      {selected && (
        <div
          className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center"
          style={{ background: "#ff6341", borderRadius: "2px", border: "2px solid #000000" }}
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
          style={{ background: "#ff6341", borderRadius: "2px", border: "2px solid #000000" }}
        >
          <Check className="w-3 h-3 text-black" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

function SneakerCard({ palette, selected, onSelect }: { palette: typeof SNEAKER_PALETTES[number]; selected: boolean; onSelect: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onSelect}>
      <motion.div
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
        className="aspect-square flex items-center justify-center transition-all p-1"
        style={{
          background: "#0d0d0d",
          borderRadius: "4px",
          border: selected ? "3px solid #ff6341" : "2px solid #2a2a2a",
          boxShadow: selected ? "4px 4px 0 0 #ff6341" : "none",
        }}
      >
        <div className="w-full h-full flex flex-col items-center justify-center gap-0.5">
          <div className="w-8 h-3" style={{ background: palette.body, border: `1px solid ${palette.accent}`, borderRadius: 1 }} />
          <span className="font-black text-[8px] uppercase tracking-wide text-white/60 text-center leading-tight">{palette.label}</span>
        </div>
      </motion.div>
      {selected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center"
          style={{ background: "#ff6341", borderRadius: "2px", border: "2px solid #000000" }}
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
          style={{ background: "#ff6341", borderRadius: "2px", border: "2px solid #000000" }}
        >
          <Check className="w-3 h-3 text-black" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

function ToggleCard({ emoji, label, selected, onToggle }: { emoji: string; label: string; selected: boolean; onToggle: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onToggle}>
      <motion.div
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
        className="aspect-square flex flex-col items-center justify-center gap-1 transition-all"
        style={{
          background: selected ? "#facc15" : "#0d0d0d",
          borderRadius: "4px",
          border: selected ? "3px solid #ff6341" : "2px solid #2a2a2a",
          boxShadow: selected ? "4px 4px 0 0 #ff6341" : "none",
        }}
      >
        <span className="text-xl leading-none">{emoji}</span>
        <span
          className="font-black text-[9px] text-center uppercase tracking-wider px-1 leading-tight"
          style={{ color: selected ? "#000" : "rgba(255,255,255,0.6)" }}
        >
          {label}
        </span>
      </motion.div>
      {selected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center"
          style={{ background: "#ff6341", borderRadius: "2px", border: "2px solid #000000" }}
        >
          <Check className="w-3 h-3 text-black" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}
