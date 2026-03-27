"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import CricketAvatar from "@/components/CricketAvatar";
import AvatarCustomizer from "@/components/AvatarCustomizer";
import { Settings, HelpCircle, LogOut, ChevronRight, User } from "lucide-react";
import { api } from "@/lib/api";
import { AvatarConfig } from "@/types/avatar";
import { cafeUrl } from "@/lib/navigation";
import { toast } from "sonner";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.replace(cafeUrl("/login"));
      return;
    }

    const userData = localStorage.getItem("jaffa_user");
    if (userData) {
      const parsed = JSON.parse(userData);
      setUser(parsed);
      if (parsed.avatarConfig) {
        setAvatarConfig(parsed.avatarConfig);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("jaffa_token");
    localStorage.removeItem("jaffa_user");
    router.push(cafeUrl("/login"));
  };

  const handleSaveAvatar = async (config: AvatarConfig) => {
    setAvatarConfig(config);
    // Update localStorage
    const userData = localStorage.getItem("jaffa_user");
    if (userData) {
      const parsed = JSON.parse(userData);
      parsed.avatarConfig = config;
      localStorage.setItem("jaffa_user", JSON.stringify(parsed));
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
            {/* Avatar */}
            <div className="relative mb-4">
              {avatarConfig ? (
                <CricketAvatar config={avatarConfig} size="lg" interactive />
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

        {/* Settings */}
        <section className="space-y-3">
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
          initialConfig={avatarConfig || {
            skinTone: "#F5C5A3",
            jerseyColor: "#00FFAB",
            helmetColor: "#1e3a5f",
            helmetStyle: 0,
            accessory: 0,
            expression: 0,
            bodyType: 0,
            jerseyPattern: 0,
            batStyle: 0,
          }}
          onSave={handleSaveAvatar}
          onClose={() => setShowCustomizer(false)}
        />
      )}
    </div>
  );
}
