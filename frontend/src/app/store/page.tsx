"use client";

// JAFFA Store. Two tabs:
//   - Banana Drip 🍌 (locked) — outfit cosmetics, hero placeholder only.
//   - Bananergy ⚡ (live)     — 5 powerup cards + buy buttons + weekly cap chips.
//
// Banana balance pinned top-right. Animates on every successful purchase
// using framer-motion's key-flip trick (no library beyond what we already
// ship).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { storeApi, POWERUP_VIEW, type CatalogItem, type PowerupKey } from "@/lib/storeApi";

type TabKey = "bananergy" | "drip";

export default function StorePage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("bananergy");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [bananas, setBananas] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<PowerupKey | null>(null);

  const refresh = async () => {
    try {
      const r = await storeApi.catalog();
      setItems(r.items);
      setBananas(r.bananas);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("jaffa_token")) {
      router.replace("/login");
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (key: PowerupKey) => {
    setBuying(key);
    try {
      const r = await storeApi.purchase(key);
      setBananas(r.bananas);
      toast.success("Powerup unlocked 🍌");
      // Refresh catalog so weekly cap chips tick down + Silverback's
      // ownedLifetime flag flips after purchase.
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Purchase failed");
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 max-w-2xl mx-auto space-y-5">
        {/* Title + balance */}
        <section className="flex items-center justify-between">
          <div>
            <h2
              className="text-3xl font-bold tracking-tight uppercase"
              style={{ fontFamily: "'Bungee', cursive" }}
            >
              Store
            </h2>
            <p className="text-xs text-[#9ca3af] mt-1">
              Spend bananas on powerups + outfits.
            </p>
          </div>
          <div
            className="game-card px-4 py-2 text-right"
            style={{ borderColor: "#ffd60a", boxShadow: "3px 3px 0 0 #ffd60a" }}
          >
            <div className="text-[10px] uppercase tracking-widest font-bold text-[#ffd60a]">
              Balance
            </div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={bananas}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="text-2xl font-extrabold text-[#ffd60a]"
                style={{ fontFamily: "'Bungee', cursive" }}
              >
                {bananas} 🍌
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* Tabs */}
        <section className="flex gap-1 p-1 rounded" style={{ background: "#1a1a1a" }}>
          <TabButton active={tab === "bananergy"} onClick={() => setTab("bananergy")} label="⚡ BANANERGY" />
          <TabButton active={tab === "drip"} onClick={() => setTab("drip")} label="🍌 BANANA DRIP" />
        </section>

        {tab === "drip" && <DripTab />}

        {tab === "bananergy" && (
          <section className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-[#6b7280] w-7 h-7" />
              </div>
            ) : (
              items.map((item) => (
                <PowerupCard
                  key={item.key}
                  item={item}
                  buying={buying === item.key}
                  affordable={bananas >= item.price}
                  onBuy={() => buy(item.key)}
                />
              ))
            )}
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded transition-colors"
      style={{
        background: active ? "#ff6341" : "transparent",
        color: active ? "#fff" : "#6b7280",
      }}
    >
      {label}
    </button>
  );
}

function PowerupCard({
  item,
  buying,
  affordable,
  onBuy,
}: {
  item: CatalogItem;
  buying: boolean;
  affordable: boolean;
  onBuy: () => void;
}) {
  const view = POWERUP_VIEW[item.key];
  const capExhausted = item.weeklyRemaining !== null && item.weeklyRemaining <= 0;
  const owned = item.ownedLifetime;
  const disabled = buying || !affordable || capExhausted || owned;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="game-card p-4"
      style={{ borderColor: view.color, boxShadow: `4px 4px 0 0 ${view.color}` }}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none shrink-0">{view.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-black uppercase text-sm" style={{ fontFamily: "'Bungee', cursive", color: view.color }}>
              {item.name}
            </h3>
            <span
              className="text-xs font-black uppercase tracking-wider px-2 py-1 rounded"
              style={{ background: "rgba(255,214,10,0.18)", color: "#ffd60a" }}
            >
              {item.price} 🍌
            </span>
          </div>
          <p className="text-[11px] text-[#9ca3af] mt-1 leading-relaxed">{item.description}</p>
          <div className="flex items-center gap-2 mt-2 text-[10px] uppercase tracking-wider font-bold">
            {item.weeklyCap !== null && (
              <span className="text-[#9ca3af]">
                Week: <span className="text-white">{item.weeklyRemaining}</span>/{item.weeklyCap}
              </span>
            )}
            {item.oneLifetime && (
              <span className="text-[#9ca3af]">
                {owned ? <span className="text-[#22c55e]">✓ Owned</span> : "One-time buy"}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={onBuy}
        disabled={disabled}
        className="w-full mt-3 btn-sticker btn-orange py-2.5 text-xs font-bold uppercase disabled:opacity-40"
      >
        {owned
          ? "Already owned"
          : capExhausted
          ? "Weekly cap reached"
          : !affordable
          ? `Need ${item.price - 0} 🍌`
          : buying
          ? "Buying…"
          : `Buy for ${item.price} 🍌`}
      </button>
    </motion.div>
  );
}

function DripTab() {
  return (
    <section className="game-card p-8 text-center" style={{ borderColor: "#ffd60a" }}>
      <div className="text-5xl mb-3">🍌👕</div>
      <h3
        className="text-xl font-black uppercase mb-1"
        style={{ fontFamily: "'Bungee', cursive", color: "#ffd60a" }}
      >
        Drip incoming…
      </h3>
      <p className="text-xs text-[#9ca3af] max-w-[260px] mx-auto">
        Outfits, masks, banana-yellow profile flairs. Coming to a Drip Drop near you.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[#9ca3af]">
        <Lock className="w-3 h-3" /> Locked
      </div>
    </section>
  );
}
