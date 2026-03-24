"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";
import CricketAvatar from "@/components/CricketAvatar";
import AvatarCustomizer from "@/components/AvatarCustomizer";
import { api } from "@/lib/api";
import { AvatarConfig } from "@/types/avatar";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
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
    router.push("/login");
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
    } catch {
      // Silent fail — local update is enough
    }
    setShowCustomizer(false);
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen">
      <Header
        leftContent={
          <button onClick={() => router.back()} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors">
            <MaterialIcon icon="arrow_back" />
            <span className="font-label text-sm font-bold uppercase tracking-widest">Back</span>
          </button>
        }
        rightContent={
          <div className="w-10 h-10 rounded-full bg-surface-container-highest border-2 border-primary-container/30 overflow-hidden flex items-center justify-center">
            <MaterialIcon icon="person" className="text-on-surface-variant" />
          </div>
        }
      />

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto">
        {/* Profile Card */}
        <section className="relative overflow-hidden rounded-xl bg-surface-container-low p-8 stadium-glow mb-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-container/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <div className="relative z-10 flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative mb-4">
              <div
                className="absolute inset-0 rounded-full blur-2xl opacity-30"
                style={{ background: avatarConfig?.jerseyColor || "#00FFAB" }}
              />
              {avatarConfig ? (
                <CricketAvatar config={avatarConfig} size="lg" interactive />
              ) : (
                <div className="w-24 h-24 rounded-full border-2 border-primary-container shadow-[0_0_20px_rgba(0,255,171,0.2)] bg-surface-container-highest flex items-center justify-center">
                  <MaterialIcon icon="person" className="text-4xl text-primary-container" />
                </div>
              )}
            </div>

            {/* Customize button */}
            <button
              onClick={() => setShowCustomizer(true)}
              className="mb-4 px-4 py-1.5 rounded-full bg-primary-container/20 border border-primary-container/40 text-primary-container font-label text-xs font-bold uppercase tracking-widest hover:bg-primary-container/30 transition-all"
            >
              ✏ Customize Avatar
            </button>

            <h1 className="font-headline text-2xl font-bold tracking-tight text-on-surface uppercase mb-1">
              {user?.displayName || "Player"}
            </h1>
            <p className="font-label text-xs text-on-surface-variant tracking-widest uppercase mb-6">
              {user?.phone || ""}
            </p>
          </div>
        </section>

        {/* Settings */}
        <section className="space-y-3">
          <div className="bg-surface-container-low rounded-xl p-5 border border-white/5 flex items-center justify-between hover:bg-surface-container-high transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <MaterialIcon icon="settings" className="text-on-surface-variant" />
              <span className="font-body font-medium">Settings</span>
            </div>
            <MaterialIcon icon="chevron_right" className="text-on-surface-variant" />
          </div>
          <div className="bg-surface-container-low rounded-xl p-5 border border-white/5 flex items-center justify-between hover:bg-surface-container-high transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <MaterialIcon icon="help" className="text-on-surface-variant" />
              <span className="font-body font-medium">Help & Support</span>
            </div>
            <MaterialIcon icon="chevron_right" className="text-on-surface-variant" />
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-surface-container-low rounded-xl p-5 border border-white/5 flex items-center gap-4 hover:bg-error-container/20 transition-colors text-left"
          >
            <MaterialIcon icon="logout" className="text-error" />
            <span className="font-body font-medium text-error">Logout</span>
          </button>
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
