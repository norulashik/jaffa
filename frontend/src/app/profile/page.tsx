"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import MaterialIcon from "@/components/MaterialIcon";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem("jaffa_user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("jaffa_token");
    localStorage.removeItem("jaffa_user");
    router.push("/login");
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen">
      <Header
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
            <div className="w-24 h-24 rounded-full border-2 border-primary-container shadow-[0_0_20px_rgba(0,255,171,0.2)] bg-surface-container-highest flex items-center justify-center mb-4">
              <MaterialIcon icon="person" className="text-4xl text-primary-container" />
            </div>
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
    </div>
  );
}
