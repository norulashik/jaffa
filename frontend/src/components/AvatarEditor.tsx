"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IoClose, IoCheckmark } from "react-icons/io5";
import { GiCricketBat } from "react-icons/gi";
import { MdFace, MdStyle } from "react-icons/md";
import { AvatarConfig } from "@/types/avatar";
import { IPL_TEAMS, getTeamByCode } from "@/lib/iplTeams";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";
import CricketAvatar from "./CricketAvatar";

interface AvatarEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

const SKIN_TONES = ["#F5D0A9", "#D4A574", "#C68642", "#8D5524", "#6B3A1F", "#3B1F0B"];

const HELMET_COLORS = [
  "#1e3a5f", "#2d1b4e", "#1a1a2e", "#4a1c1c",
  "#1b4332", "#3d3d3d", "#5c2d0e", "#0f4c75",
];

const EXPRESSION_LABELS = ["Happy", "Determined", "Wink", "Excited", "Cool"];
const ACCESSORY_LABELS = ["None", "Shades", "Sweatband", "War Paint", "Earring", "Bandana"];
const BODY_LABELS = ["Slim", "Broad", "Lean"];
const BAT_LABELS = ["Natural", "Dark", "Light"];
const BAT_COLORS = ["#d4a574", "#8B4513", "#f5deb3"];
const HELMET_LABELS = ["Classic", "Cap", "Modern", "Retro"];
const HAIR_STYLE_LABELS = ["Buzz", "Short", "Spiky", "Curly", "Long"];
const HAIR_COLORS = [
  { label: "Black", color: "#1a1a2e" },
  { label: "Brown", color: "#3b2414" },
  { label: "Dark Brown", color: "#5c3d1e" },
  { label: "Blonde", color: "#d4a574" },
  { label: "Auburn", color: "#8b2500" },
  { label: "Gray", color: "#6b6b6b" },
];
const FACIAL_HAIR_LABELS = ["None", "Stubble", "Goatee", "Beard"];

type Tab = "jersey" | "face" | "gear" | "style";

const DEFAULT_CONFIG: AvatarConfig = {
  skinTone: "#D4A574",
  jerseyColor: "#f97316",
  helmetColor: "#1a1a2e",
  helmetStyle: 0,
  accessory: 0,
  expression: 0,
  bodyType: 0,
  jerseyPattern: 0,
  batStyle: 0,
  iplTeam: null,
  hairStyle: 1,
  hairColor: "#1a1a2e",
  facialHair: 0,
};

export default function AvatarEditor({ isOpen, onClose }: AvatarEditorProps) {
  const { state, dispatch } = useGame();
  const [draftConfig, setDraftConfig] = useState<AvatarConfig>(
    state.user?.avatarConfig || DEFAULT_CONFIG
  );
  const [activeTab, setActiveTab] = useState<Tab>("jersey");
  const [saving, setSaving] = useState(false);
  const [previewMood, setPreviewMood] = useState<"idle" | "celebrate">("idle");

  const triggerCelebrate = useCallback(() => {
    setPreviewMood("celebrate");
    setTimeout(() => setPreviewMood("idle"), 600);
  }, []);

  const updateDraft = useCallback((updates: Partial<AvatarConfig>) => {
    setDraftConfig((prev) => ({ ...prev, ...updates }));
    triggerCelebrate();
  }, [triggerCelebrate]);

  const selectTeam = useCallback((code: string) => {
    const team = getTeamByCode(code);
    if (!team) return;
    updateDraft({
      iplTeam: code,
      jerseyColor: team.primaryColor,
      helmetColor: team.helmetColor,
      jerseyPattern: team.jerseyPattern,
    });
  }, [updateDraft]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.updateAvatar(draftConfig);
      dispatch({ type: "UPDATE_AVATAR", avatarConfig: result.avatarConfig });
      onClose();
    } catch (err) {
      console.error("Failed to save avatar:", err);
    }
    setSaving(false);
  };

  // Reset draft when opening
  const handleOpen = () => {
    setDraftConfig(state.user?.avatarConfig || DEFAULT_CONFIG);
    setActiveTab("jersey");
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "jersey", label: "Jersey", icon: <span className="text-base">👕</span> },
    { key: "face", label: "Face", icon: <MdFace className="text-base" /> },
    { key: "gear", label: "Gear", icon: <span className="text-base">⛑️</span> },
    { key: "style", label: "Style", icon: <MdStyle className="text-base" /> },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          onAnimationComplete={(def: { opacity?: number }) => {
            if (def.opacity === 1) handleOpen();
          }}
          className="fixed inset-0 z-[60] bg-slate-900 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <IoClose className="text-2xl" />
            </button>
            <h2 className="text-white font-semibold text-sm">Customize Avatar</h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <IoCheckmark className="text-lg" />
              {saving ? "..." : "Save"}
            </button>
          </div>

          {/* Live Preview */}
          <div className="flex justify-center py-6 bg-slate-950/50">
            <div className="relative">
              <CricketAvatar config={draftConfig} size="lg" mood={previewMood} />
              {draftConfig.iplTeam && (
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: getTeamByCode(draftConfig.iplTeam)?.primaryColor, color: "#fff" }}
                >
                  {draftConfig.iplTeam}
                </div>
              )}
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-slate-800 bg-slate-900">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "text-orange-400 border-b-2 border-orange-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === "jersey" && (
                  <JerseyTab config={draftConfig} onSelectTeam={selectTeam} onUpdate={updateDraft} />
                )}
                {activeTab === "face" && (
                  <FaceTab config={draftConfig} onUpdate={updateDraft} />
                )}
                {activeTab === "gear" && (
                  <GearTab config={draftConfig} onUpdate={updateDraft} />
                )}
                {activeTab === "style" && (
                  <StyleTab config={draftConfig} onUpdate={updateDraft} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Tab Components ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">{children}</p>;
}

function JerseyTab({
  config,
  onSelectTeam,
  onUpdate,
}: {
  config: AvatarConfig;
  onSelectTeam: (code: string) => void;
  onUpdate: (u: Partial<AvatarConfig>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Pick Your Team</SectionLabel>
        <div className="grid grid-cols-5 gap-2">
          {IPL_TEAMS.map((team) => (
            <button
              key={team.code}
              onClick={() => onSelectTeam(team.code)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                config.iplTeam === team.code
                  ? "border-orange-400 bg-slate-800 scale-105"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center relative">
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${team.primaryColor} 50%, ${team.secondaryColor} 50%)`,
                  }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-300">{team.shortName}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Custom Colors</SectionLabel>
        <p className="text-[11px] text-slate-500 mb-2">Or pick a custom jersey color</p>
        <div className="flex gap-2 flex-wrap">
          {[
            "#f97316", "#3b82f6", "#ef4444", "#22c55e", "#a855f7",
            "#eab308", "#ec4899", "#14b8a6", "#f43f5e", "#6366f1",
          ].map((color) => (
            <button
              key={color}
              onClick={() => onUpdate({ jerseyColor: color, iplTeam: null })}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                !config.iplTeam && config.jerseyColor === color
                  ? "border-white scale-110"
                  : "border-slate-600 hover:border-slate-400"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FaceTab({
  config,
  onUpdate,
}: {
  config: AvatarConfig;
  onUpdate: (u: Partial<AvatarConfig>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Skin Tone</SectionLabel>
        <div className="flex gap-3">
          {SKIN_TONES.map((tone) => (
            <button
              key={tone}
              onClick={() => onUpdate({ skinTone: tone })}
              className={`w-10 h-10 rounded-full border-2 transition-all ${
                config.skinTone === tone ? "border-white scale-110 ring-2 ring-orange-400/50" : "border-slate-600 hover:border-slate-400"
              }`}
              style={{ backgroundColor: tone }}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Hair Style</SectionLabel>
        <div className="grid grid-cols-5 gap-2">
          {HAIR_STYLE_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ hairStyle: i })}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                (config.hairStyle ?? 0) === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <span className="text-lg">{["💈", "✂️", "⚡", "🌀", "💇"][i]}</span>
              <span className="text-[10px] text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Hair Color</SectionLabel>
        <div className="flex gap-2 flex-wrap">
          {HAIR_COLORS.map(({ label, color }) => (
            <button
              key={color}
              onClick={() => onUpdate({ hairColor: color })}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                (config.hairColor ?? "#1a1a2e") === color
                  ? "border-white scale-110"
                  : "border-slate-600 hover:border-slate-400"
              }`}
              style={{ backgroundColor: color }}
              title={label}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Facial Hair</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {FACIAL_HAIR_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ facialHair: i })}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                (config.facialHair ?? 0) === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <span className="text-lg">{["🚫", "🔘", "🔻", "🧔"][i]}</span>
              <span className="text-[10px] text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Expression</SectionLabel>
        <div className="grid grid-cols-5 gap-2">
          {EXPRESSION_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ expression: i })}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                config.expression === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <span className="text-lg">{["😊", "😤", "😜", "🤩", "😎"][i]}</span>
              <span className="text-[10px] text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GearTab({
  config,
  onUpdate,
}: {
  config: AvatarConfig;
  onUpdate: (u: Partial<AvatarConfig>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Helmet Style</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {HELMET_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ helmetStyle: i })}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                config.helmetStyle === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <svg viewBox="0 0 40 30" width="32" height="24">
                  {i === 0 && (
                    <g>
                      <ellipse cx="20" cy="12" rx="18" ry="12" fill={config.helmetColor} />
                      <rect x="10" y="19" width="20" height="3" rx="1" fill={config.helmetColor} opacity="0.7" />
                    </g>
                  )}
                  {i === 1 && (
                    <g>
                      <ellipse cx="20" cy="10" rx="16" ry="8" fill={config.helmetColor} />
                      <rect x="4" y="8" width="18" height="3" rx="1.5" fill={config.helmetColor} />
                    </g>
                  )}
                  {i === 2 && (
                    <g>
                      <ellipse cx="20" cy="11" rx="19" ry="11" fill={config.helmetColor} />
                      <rect x="8" y="18" width="24" height="4" rx="2" fill="#1a1a2e" opacity="0.6" />
                    </g>
                  )}
                  {i === 3 && (
                    <g>
                      <ellipse cx="20" cy="10" rx="17" ry="10" fill={config.helmetColor} />
                      <rect x="18" y="2" width="4" height="16" rx="2" fill="white" opacity="0.15" />
                    </g>
                  )}
                </svg>
              </div>
              <span className="text-[10px] text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Helmet Color</SectionLabel>
        <div className="flex gap-2 flex-wrap">
          {HELMET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onUpdate({ helmetColor: color })}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                config.helmetColor === color
                  ? "border-white scale-110"
                  : "border-slate-600 hover:border-slate-400"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Accessory</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {ACCESSORY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ accessory: i })}
              className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all ${
                config.accessory === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <span className="text-base">{["❌", "🕶️", "💪", "🎨", "💎", "🎀"][i]}</span>
              <span className="text-xs text-slate-300">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StyleTab({
  config,
  onUpdate,
}: {
  config: AvatarConfig;
  onUpdate: (u: Partial<AvatarConfig>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Body Type</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {BODY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ bodyType: i })}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                config.bodyType === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <div className="w-6 h-10 flex items-center justify-center">
                <svg viewBox="0 0 20 30" width="20" height="30">
                  <rect
                    x={10 - [7, 9, 6][i]}
                    y="0"
                    width={[14, 18, 12][i]}
                    height="28"
                    rx="4"
                    fill={config.jerseyColor}
                    opacity="0.7"
                  />
                </svg>
              </div>
              <span className="text-xs text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Bat Style</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {BAT_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ batStyle: i })}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                config.batStyle === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-center">
                <GiCricketBat className="text-2xl" style={{ color: BAT_COLORS[i] }} />
              </div>
              <span className="text-xs text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Jersey Pattern</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {["Plain", "Stripe", "V-Neck", "Panels"].map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdate({ jerseyPattern: i })}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                config.jerseyPattern === i
                  ? "border-orange-400 bg-slate-800"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <div className="w-8 h-10 flex items-center justify-center">
                <svg viewBox="0 0 24 30" width="24" height="30">
                  <rect x="2" y="0" width="20" height="28" rx="4" fill={config.jerseyColor} />
                  {i === 1 && (
                    <rect x="2" y="12" width="20" height="5" fill="white" opacity="0.3" />
                  )}
                  {i === 2 && (
                    <polygon points="4,0 12,12 20,0" fill="white" opacity="0.25" />
                  )}
                  {i === 3 && (
                    <>
                      <rect x="2" y="0" width="5" height="28" rx="2" fill="white" opacity="0.2" />
                      <rect x="17" y="0" width="5" height="28" rx="2" fill="white" opacity="0.2" />
                    </>
                  )}
                </svg>
              </div>
              <span className="text-[10px] text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
