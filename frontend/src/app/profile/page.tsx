"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import CricketAvatar from "@/components/CricketAvatar";
import AvatarCustomizer from "@/components/AvatarCustomizer";
import Avatar3D from "@/components/avatar/Avatar3D";
import { get3DModelForTeamOrDefault } from "@/components/avatar/team3DModels";
import { Settings, HelpCircle, LogOut, ChevronRight, User, MapPin, Trophy, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { AvatarConfig } from "@/types/avatar";
import { ensureV2, isV2 } from "@/lib/avatarMigrate";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";
import { GiCrownCoin } from "react-icons/gi";
import { toast } from "sonner";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [stats, setStats] = useState<{
    matchesPlayed: number;
    accuracy: number;
    lifetimePoints: number;
    city: string | null;
    state: string | null;
    bananas: number;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(isCafeRoute() ? cafeUrl("/login") : "/login");
      return;
    }

    const userData = localStorage.getItem("jaffa_user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUser(parsed);
        // Lazy v1 → v2 migration. If the stored config is already v2, ensureV2
        // returns the same reference (so we skip the network round-trip).
        // Otherwise it builds a fresh v2 config preserving skinTone +
        // expression and persists it back so subsequent reads are clean.
        if (parsed.avatarConfig && parsed.id) {
          const migrated = ensureV2(parsed.avatarConfig, parsed.id);
          setAvatarConfig(migrated);
          if (!isV2(parsed.avatarConfig)) {
            parsed.avatarConfig = migrated;
            localStorage.setItem("jaffa_user", JSON.stringify(parsed));
            api.updateAvatar(migrated).catch(() => {
              // Non-fatal: next /profile visit will retry. UI already shows v2.
            });
          }
        }
      } catch {}
    }

    api.getUserStats().then((data) => setStats(data)).catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("jaffa_token");
    localStorage.removeItem("jaffa_user");
    router.push(isCafeRoute() ? cafeUrl("/login") : "/login");
  };

  const handleSaveAvatar = async (config: AvatarConfig) => {
    setAvatarConfig(config);
    // Update localStorage
    const userData = localStorage.getItem("jaffa_user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        parsed.avatarConfig = config;
        localStorage.setItem("jaffa_user", JSON.stringify(parsed));
      } catch {}
    }
    // Persist to backend
    try {
      await api.updateAvatar(config);
      toast.success("Avatar updated");
    } catch {
      toast.error("Avatar saved locally, but sync failed");
    }
    setShowCustomizer(false);
  };

  const handleHelp = async () => {
    const venueName = localStorage.getItem("jaffa_venue_name") || "your cafe";
    const message = `Need help with JAFFA? Ask the staff at ${venueName} for support with match codes, rewards, or login issues.`;

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Support message copied");
    } catch {
      toast(message);
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen">
      <Header />

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto">
        {/* Profile Card */}
        <section className="game-card mb-8" style={{ boxShadow: "6px 6px 0 0 #ff6341" }}>
          <div className="flex flex-col items-center text-center py-4">
            {/* Avatar — Phase 2: every user gets a 3D model. KKR users
                see the Knight Rider ape; everyone else sees the default
                red-hoodie ape. Bust frame crops to head + chest only
                (reference image 3). SVG renders as the Suspense fallback
                during GLB decode so the avatar never flashes blank. */}
            <div className="relative mb-4">
              {avatarConfig ? (
                <Suspense
                  fallback={<CricketAvatar config={avatarConfig} size="lg" interactive />}
                >
                  <Avatar3D
                    url={get3DModelForTeamOrDefault(avatarConfig.jerseyTeam)}
                    size={280}
                    frame="bust"
                    interactive
                  />
                </Suspense>
              ) : (
                <div
                  className="w-24 h-24 flex items-center justify-center"
                  style={{
                    border: "3px solid #ff6341",
                    borderRadius: "4px",
                    background: "#1a1a1a",
                  }}
                >
                  <User size={40} className="text-[#ff6341]" />
                </div>
              )}
            </div>

            {/* Customize button */}
            <button
              onClick={() => setShowCustomizer(true)}
              className="btn-secondary mb-4 text-xs px-4 py-1.5"
            >
              CUSTOMIZE AVATAR
            </button>

            <h1
              className="text-2xl font-bold tracking-tight text-white uppercase mb-1"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              {user?.displayName || "Player"}
            </h1>
            <span className="info-pill">
              {user?.phone || ""}
            </span>
          </div>
        </section>

        {/* Stats */}
        {stats && (
          <section className="grid grid-cols-2 gap-3 mb-8">
            <div className="game-card text-center py-4">
              <div
                className="text-3xl font-extrabold text-[#ff6341]"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                {stats.accuracy}%
              </div>
              <div className="text-xs text-[#6b7280] uppercase tracking-widest font-bold mt-1">
                Accuracy
              </div>
            </div>
            <div className="game-card text-center py-4">
              <div
                className="text-3xl font-extrabold text-[#ff6341]"
                style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
              >
                {stats.matchesPlayed}
              </div>
              <div className="text-xs text-[#6b7280] uppercase tracking-widest font-bold mt-1">
                Matches Played
              </div>
            </div>
          </section>
        )}

        {/* Lifetime Points · Bananas · Location */}
        {stats && (
          <section className="space-y-3 mb-8">
            <div className="grid grid-cols-3 gap-2">
              <div className="game-card text-center py-4 px-2">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <GiCrownCoin className="text-xl text-[#ff6341]" />
                </div>
                <div
                  className="text-2xl font-extrabold text-[#ff6341]"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  {stats.lifetimePoints}
                </div>
                <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold mt-1">
                  Lifetime
                </div>
              </div>
              {/* Bananas — soft-currency from 5v5 wins, prediction-correct
                  banana awards, streak bonuses, etc. Wrapped in a key-flip
                  motion so the number snaps when it changes (e.g. after a
                  Store purchase / banana-earning event). */}
              <div className="game-card text-center py-4 px-2" style={{ borderColor: "#ffd60a", boxShadow: "4px 4px 0 0 #ffd60a" }}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className="text-xl leading-none">🍌</span>
                </div>
                <motion.div
                  key={stats.bananas ?? 0}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
                  className="text-2xl font-extrabold text-[#ffd60a]"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  {stats.bananas ?? 0}
                </motion.div>
                <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold mt-1">
                  Bananas
                </div>
              </div>
              <div className="game-card text-center py-4 px-2 flex flex-col items-center justify-center">
                <MapPin size={16} className="text-[#3b9eff] mb-1" />
                <div
                  className="text-xs font-bold text-white truncate w-full"
                  style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
                >
                  {stats.city || "—"}
                </div>
                <div className="text-[9px] text-[#6b7280] uppercase tracking-widest font-bold mt-0.5 truncate w-full">
                  {stats.state || "Set location"}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Settings */}
        <section className="space-y-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/global-leaderboard")}
            className="w-full game-card flex items-center justify-between cursor-pointer text-left"
            style={{ border: "2px solid #ff6341", boxShadow: "4px 4px 0 0 #ff6341" }}
          >
            <div className="flex items-center gap-4">
              <Trophy size={20} className="text-[#ff6341]" />
              <div>
                <span className="font-bold text-[#ff6341] uppercase text-sm" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                  Global Leaderboard
                </span>
                <p className="text-[10px] text-[#6b7280]">Lifetime rankings by city, state & all India</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-[#ff6341]" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/profile/punter-cards")}
            className="w-full game-card flex items-center justify-between cursor-pointer text-left"
          >
            <div className="flex items-center gap-4">
              <Ticket size={20} className="text-[#3b9eff]" />
              <div>
                <span className="font-bold uppercase text-sm" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                  My Punter Cards
                </span>
                <p className="text-[10px] text-[#6b7280]">Pre-match picks you've locked in</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-[#6b7280]" />
          </motion.button>

          {/* Weekly Points moved off the bottom nav (where it lived as
              "Week Pts") into this profile row, mirroring the My Punter Cards
              treatment above. Keeps the nav focused on navigation and
              surfaces the weekly count as a glanceable badge here. */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/redeem")}
            className="w-full game-card flex items-center justify-between cursor-pointer text-left"
          >
            <div className="flex items-center gap-4">
              <GiCrownCoin className="text-[#ffd60a] text-2xl" />
              <div>
                <span className="font-bold uppercase text-sm" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
                  Weekly Points
                </span>
                <p className="text-[10px] text-[#6b7280]">This week&apos;s tally + redeemable rewards</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-[#6b7280]" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCustomizer(true)}
            className="w-full game-card flex items-center justify-between cursor-pointer text-left"
          >
            <div className="flex items-center gap-4">
              <Settings size={20} className="text-[#6b7280]" />
              <span className="font-medium">Settings</span>
            </div>
            <ChevronRight size={20} className="text-[#6b7280]" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleHelp}
            className="w-full game-card flex items-center justify-between cursor-pointer text-left"
          >
            <div className="flex items-center gap-4">
              <HelpCircle size={20} className="text-[#6b7280]" />
              <span className="font-medium">Help & Support</span>
            </div>
            <ChevronRight size={20} className="text-[#6b7280]" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="w-full game-card flex items-center gap-4 text-left hover:border-[#ff6341] transition-colors"
          >
            <LogOut size={20} className="text-red-500" />
            <span className="font-medium text-red-500">Logout</span>
          </motion.button>
        </section>
      </main>

      <BottomNav />

      {/* Avatar Customizer */}
      {showCustomizer && (
        <AvatarCustomizer
          initialConfig={avatarConfig || ensureV2(null, user?.id || "anon")}
          onSave={handleSaveAvatar}
          onClose={() => setShowCustomizer(false)}
        />
      )}
    </div>
  );
}
