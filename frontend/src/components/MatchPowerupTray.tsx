"use client";

// Floating bottom-right 🍌 button that opens a slide-up tray of the user's
// owned + active Bananergy powerups for THIS match. Activations roundtrip
// to /api/powerups/:id/activate. Silverback (passive permanent) shows as a
// status line, no button.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import {
  storeApi,
  powerupsApi,
  POWERUP_VIEW,
  type InventoryRow,
  type PowerupKey,
} from "@/lib/storeApi";

interface Props {
  matchId: string;
  // Optional — caller can pass currentOver so Berserk's binding hint shows
  // the right "applies to over X" preview. Tray polls /powerups/active so
  // server is always source of truth on the bound over.
  currentOver?: number | null;
}

export default function MatchPowerupTray({ matchId, currentOver }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [active, setActive] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    try {
      const [inv, act] = await Promise.all([
        storeApi.inventory(matchId),
        powerupsApi.active(matchId),
      ]);
      setInventory(inv.powerups || []);
      setActive(act.powerups || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Lock body scroll while drawer is open (mirrors HamburgerMenu pattern).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleActivate = async (powerupId: string, powerupKey: PowerupKey) => {
    setActivating(powerupId);
    try {
      const targetOver = powerupKey === "banana_berserk" && currentOver
        ? currentOver + 1
        : undefined;
      const res = await powerupsApi.activate(powerupId, matchId, targetOver);
      const m: any = res.powerup.metadata || {};
      if (powerupKey === "banana_berserk" && m.berserkMultiplier) {
        toast.success(`🐒 Berserk locked: ${m.berserkMultiplier}x for Over ${m.overNumber}`);
      } else {
        toast.success(`🍌 ${POWERUP_VIEW[powerupKey].emoji} Activated`);
      }
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Activation failed");
    } finally {
      setActivating(null);
    }
  };

  // Combine inventory + active into a unified rendered list. Active rows
  // win on conflict (server returns same ids in both lists for active
  // match-bound powerups; dedupe on id).
  const merged = (() => {
    const seen = new Set<string>();
    const out: InventoryRow[] = [];
    for (const a of active) { if (!seen.has(a.id)) { out.push(a); seen.add(a.id); } }
    for (const i of inventory) { if (!seen.has(i.id)) { out.push(i); seen.add(i.id); } }
    return out;
  })();
  const activeCount = active.length;

  if (!mounted) return null;

  const tree = (
    <>
      {/* Floating launcher — bottom-right above the BottomNav. */}
      {!open && (
        <motion.button
          type="button"
          aria-label="Open powerup tray"
          onClick={() => setOpen(true)}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
          className="fixed z-[55] flex items-center justify-center text-2xl"
          style={{
            bottom: "calc(96px + env(safe-area-inset-bottom))",
            right: "16px",
            width: "56px",
            height: "56px",
            borderRadius: "9999px",
            background: "#ffd60a",
            color: "#000",
            border: "3px solid #000",
            boxShadow: "4px 4px 0 0 #ff6341",
          }}
        >
          🍌
          {activeCount > 0 && (
            <span
              className="absolute -top-1 -right-1 text-[10px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: "#ff6341", color: "#fff", border: "2px solid #000" }}
            >
              {activeCount}
            </span>
          )}
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="bd"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              key="dr"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed left-0 right-0 bottom-0 z-[70] max-h-[80vh] overflow-y-auto bg-[#0d0d0d]"
              style={{ borderTop: "3px solid #ffd60a", boxShadow: "0 -4px 0 0 #000" }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                <h3
                  className="text-lg font-black uppercase"
                  style={{ fontFamily: "'Bungee', cursive", color: "#ffd60a" }}
                >
                  🍌 Bananergy
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1a1a1a] border-2 border-[#2a2a2a]"
                >
                  <X className="w-4 h-4 text-white/80" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {loading && merged.length === 0 && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-[#6b7280]" />
                  </div>
                )}

                {!loading && merged.length === 0 && (
                  <div className="game-card p-5 text-center text-xs text-[#9ca3af]">
                    No powerups yet. Visit the <span className="text-[#ff6341] font-bold">Store</span> to load up on bananergy.
                  </div>
                )}

                {merged.map((p) => (
                  <PowerupTrayRow
                    key={p.id}
                    p={p}
                    activating={activating === p.id}
                    onActivate={() => handleActivate(p.id, p.powerupKey)}
                  />
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );

  return createPortal(tree, document.body);
}

function PowerupTrayRow({
  p,
  activating,
  onActivate,
}: {
  p: InventoryRow;
  activating: boolean;
  onActivate: () => void;
}) {
  const view = POWERUP_VIEW[p.powerupKey];
  const isActive = p.status === "active" || (p.powerupKey === "silverback_clutch");
  const isPassive = p.powerupKey === "silverback_clutch";
  const m: any = p.metadata || {};

  return (
    <div
      className="game-card p-3 flex items-start gap-3"
      style={{ borderColor: view.color }}
    >
      <span className="text-2xl leading-none shrink-0">{view.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-black text-sm uppercase"
            style={{ fontFamily: "'Bungee', cursive", color: view.color }}
          >
            {view.tagline}
          </span>
          {isActive && (
            <span
              className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: "rgba(34,197,94,0.18)", color: "#22c55e" }}
            >
              ACTIVE
            </span>
          )}
        </div>
        <div className="text-[11px] text-[#9ca3af] mt-1">
          {p.powerupKey === "gorilla_guard" && (
            isActive ? `${p.chargesRemaining ?? 0} shield${p.chargesRemaining === 1 ? "" : "s"} left` : "Tap activate to start absorbing wrong picks."
          )}
          {p.powerupKey === "chimp_tank" && (
            isActive ? `${p.chargesRemaining ?? 3} reveal${p.chargesRemaining === 1 ? "" : "s"} left today` : "Use the 🔭 button on a question card."
          )}
          {p.powerupKey === "banana_berserk" && (
            isActive
              ? `Locked: ${m.berserkMultiplier}x for Over ${m.overNumber}`
              : "Activate just before the over you want to swing."
          )}
          {p.powerupKey === "monke_mayhem" && (
            isActive ? "Pick 2 outcomes on player Qs this match." : "Activate to enable 2-pick on player questions."
          )}
          {isPassive && "Permanent — last 2 overs always × 2."}
        </div>
      </div>
      {!isActive && !isPassive && (
        <button
          type="button"
          onClick={onActivate}
          disabled={activating}
          className="btn-sticker btn-orange px-3 py-1.5 text-[10px] disabled:opacity-50"
        >
          {activating ? "…" : "Activate"}
        </button>
      )}
    </div>
  );
}
