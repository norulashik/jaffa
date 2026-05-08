"use client";

// Slide-in side drawer triggered from the header's top-left hamburger.
// Covers ~78% of the viewport width with a dimmed backdrop over the rest;
// behaves like the Spotify reference the product team supplied.
//
// Sections (top → bottom):
//   1. User chip            — avatar + display name + "View profile"
//   2. Modes (accordion)    — Season Room / Friendly Room / Commercial Room / 5v5
//                             First two link to /room/create with a preset; last
//                             two are locked ("Coming Soon") for now.
//   3. Store (locked)       — placeholder
//   4. Ape Club (locked)    — placeholder
//   5. divider
//   6. Profile / Settings / Logout

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronDown,
  ShoppingBag,
  Sparkles,
  Settings as SettingsIcon,
  LogOut,
  Trophy,
  Calendar,
  Users,
  Swords,
  Lock,
} from "lucide-react";
import { useGame } from "@/context/GameContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ModeOption {
  key: string;
  label: string;
  description: string;
  icon: ReactNode;
  href: string | null;       // null = locked
  badge?: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    key: "season",
    label: "Season Room",
    description: "Persists across the IPL season — same code, same crew. Create or join.",
    icon: <Calendar className="w-4 h-4" />,
    href: "/room/create?mode=season",
  },
  {
    key: "friendly",
    label: "Friendly Room",
    description: "Private room for one match. Invite friends with the code, or join one.",
    icon: <Users className="w-4 h-4" />,
    href: "/room/create?mode=friendly",
  },
  {
    key: "commercial",
    label: "Commercial Room",
    description: "Sponsored rooms with branded prizes.",
    icon: <Trophy className="w-4 h-4" />,
    href: null,
    badge: "Coming Soon",
  },
  {
    key: "5v5",
    label: "5v5",
    description: "10 players, 2 teams, 5 roles. Win bananas.",
    icon: <Swords className="w-4 h-4" />,
    href: "/5v5",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function HamburgerMenu({ open, onClose }: Props) {
  const { state, dispatch } = useGame();
  const router = useRouter();
  // Modes drawer defaults closed so the user lands on a clean menu (with
  // the user chip + Store + Ape Club visible) and explicitly taps to open
  // the Modes accordion.
  const [modesOpen, setModesOpen] = useState(false);
  // Defer portal mounting until after hydration so SSR markup matches the
  // client and document.body is available.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while the drawer is open. Restores on close so the
  // home page underneath doesn't stay frozen if the drawer is torn down.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc key dismisses — keeps the drawer keyboard-friendly on desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const initial = state.user?.displayName
    ? state.user.displayName.charAt(0).toUpperCase()
    : "?";

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      // Mirror what existing logout flows do — clear local auth + game state
      // and bounce to login. Future: call /auth/logout if/when added.
      localStorage.removeItem("jaffa_token");
      localStorage.removeItem("jaffa_user");
      localStorage.removeItem("jaffa_match_id");
      localStorage.removeItem("jaffa_room_id");
      localStorage.removeItem("jaffa_venue_id");
    }
    dispatch({ type: "RESET" });
    onClose();
    router.replace("/login");
  };

  // Portal target. Rendering inside <Header> traps the drawer in the
  // header's sticky-z-50 stacking context, so its z-[70] gets capped at
  // 50 from the outside and the BottomNav (also z-50) overlaps it.
  // Portaling to <body> moves the drawer to the root stacking context
  // where z-[70] really does sit above the BottomNav.
  if (!mounted) return null;

  const tree = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed left-0 top-0 z-[70] h-full w-[78%] max-w-[360px] bg-[#0d0d0d] flex flex-col"
            style={{
              borderRight: "3px solid #ff6341",
              boxShadow: "6px 0 0 0 #000",
            }}
          >
            {/* Close X — top-right of drawer */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center bg-[#1a1a1a] border-2 border-[#2a2a2a]"
            >
              <X className="w-4 h-4 text-white/80" />
            </button>

            {/* Top: user chip */}
            <button
              type="button"
              onClick={() => go("/profile")}
              className="flex items-center gap-3 px-5 pt-6 pb-5 text-left hover:bg-[#1a1a1a] transition-colors"
            >
              <Avatar className="size-12 rounded-full overflow-hidden border-2 border-[#ff6341]">
                <AvatarFallback className="bg-[#ff6341] text-black font-black text-base">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div
                  className="text-white font-black text-lg uppercase truncate"
                  style={{ fontFamily: "'Bungee', cursive" }}
                >
                  {state.user?.displayName || "Player"}
                </div>
                <div className="text-[#ff6341] text-xs font-bold uppercase tracking-wider">
                  View profile →
                </div>
              </div>
            </button>

            <div className="border-t border-[#2a2a2a]" />

            {/* Scrollable middle */}
            <div className="flex-1 overflow-y-auto py-3">
              {/* MODES — accordion */}
              <button
                type="button"
                onClick={() => setModesOpen((v) => !v)}
                className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-[#1a1a1a] transition-colors"
              >
                <span
                  className="text-white font-black text-base uppercase tracking-wide"
                  style={{ fontFamily: "'Bungee', cursive" }}
                >
                  Modes
                </span>
                <motion.div
                  animate={{ rotate: modesOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-5 h-5 text-[#ff6341]" />
                </motion.div>
              </button>

              <AnimatePresence initial={false}>
                {modesOpen && (
                  <motion.div
                    key="modes"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-2 space-y-1">
                      {MODE_OPTIONS.map((m) => {
                        const locked = !m.href;
                        const inner = (
                          <div
                            className={`flex items-center gap-3 px-3 py-2.5 rounded transition-colors ${
                              locked ? "opacity-50 cursor-not-allowed" : "hover:bg-[#1a1a1a]"
                            }`}
                          >
                            <span className={`w-8 h-8 flex items-center justify-center rounded ${
                              locked ? "bg-[#1a1a1a] text-white/50" : "bg-[#ff6341]/10 text-[#ff6341]"
                            }`}>
                              {m.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-bold text-sm">{m.label}</span>
                                {m.badge && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#ffd60a]/20 text-[#ffd60a] tracking-wider">
                                    {m.badge}
                                  </span>
                                )}
                              </div>
                              <div className="text-[#9ca3af] text-[11px] mt-0.5 leading-tight">
                                {m.description}
                              </div>
                            </div>
                            {locked && <Lock className="w-3.5 h-3.5 text-white/40" />}
                          </div>
                        );
                        return locked ? (
                          <div key={m.key}>{inner}</div>
                        ) : (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => go(m.href!)}
                            className="w-full text-left"
                          >
                            {inner}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Store — Banana Drip (cosmetics, locked) + Bananergy (powerups, live). */}
              <DrawerRow
                icon={<ShoppingBag className="w-4 h-4" />}
                label="Store"
                description="🍌 Bananergy powerups + Banana Drip outfits."
                onClick={() => go("/store")}
              />

              {/* Ape Club (locked) */}
              <DrawerRow
                icon={<Sparkles className="w-4 h-4" />}
                label="Ape Club"
                description="Members-only perks for season-room hosts."
                badge="Coming Soon"
                locked
              />
            </div>

            {/* Bottom: divider then Settings / Logout. Profile entry was
                removed — the user chip at the top of the drawer already
                links to /profile, so a second row was redundant. */}
            <div className="border-t border-[#2a2a2a]" />
            <div className="py-2">
              <DrawerRow
                icon={<SettingsIcon className="w-4 h-4" />}
                label="Settings"
                // Avatar/account settings live on /profile today.
                onClick={() => go("/profile")}
              />
              <DrawerRow
                icon={<LogOut className="w-4 h-4" />}
                label="Logout"
                onClick={handleLogout}
                tone="danger"
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(tree, document.body);
}

function DrawerRow({
  icon,
  label,
  description,
  badge,
  locked = false,
  onClick,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  badge?: string;
  locked?: boolean;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  const accent = tone === "danger" ? "text-[#ff6341]" : "text-white";
  const inner = (
    <div
      className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
        locked ? "opacity-50" : "hover:bg-[#1a1a1a]"
      }`}
    >
      <span className={`w-8 h-8 flex items-center justify-center rounded ${
        tone === "danger" ? "bg-[#ff6341]/10 text-[#ff6341]" : "bg-[#1a1a1a] text-white/80"
      }`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${accent}`}>{label}</span>
          {badge && (
            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#ffd60a]/20 text-[#ffd60a] tracking-wider">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <div className="text-[#9ca3af] text-[11px] mt-0.5 leading-tight">
            {description}
          </div>
        )}
      </div>
      {locked && <Lock className="w-3.5 h-3.5 text-white/40" />}
    </div>
  );

  if (locked || !onClick) return <div>{inner}</div>;
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      {inner}
    </button>
  );
}
