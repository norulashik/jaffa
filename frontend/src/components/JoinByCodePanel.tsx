"use client";

// Reusable "Got a code?" join field. Mirrors the styling of the panel on
// /5v5 (line 236-265 of 5v5/page.tsx) so the home page and the new
// CREATE/JOIN tab on /room/create feel like one design system.
//
// Resolves the entered code against both 5v5 and friend/season rooms via
// resolveAndJoinAnyRoom — caller doesn't need to care which type the code
// belongs to. After a successful join, GameContext + localStorage are
// hydrated for friend/season rooms (5v5 has no venue/match notion).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { resolveAndJoinAnyRoom, type ResolvedRoom } from "@/lib/joinRoom";
import { useGame } from "@/context/GameContext";

interface Props {
  // Display title above the input. Defaults to the 5v5 phrasing.
  title?: string;
  // Border + accent color for the section header stripe and Join button.
  accentColor?: string;
  // Optional override — if provided, runs after a successful resolve and
  // suppresses the default router.push. Useful for callers that want to
  // hand off to their own routing flow.
  onJoined?: (resolved: ResolvedRoom) => void;
  // Optional sub-copy under the title (e.g. on /lobby we explain that the
  // field accepts every room kind so users don't think it's 5v5-only).
  hint?: string;
}

export default function JoinByCodePanel({
  title = "Got a code?",
  accentColor = "#3b9eff",
  onJoined,
  hint,
}: Props) {
  const router = useRouter();
  const { dispatch } = useGame();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    if (code.trim().length < 6) {
      toast.error("Enter a 6-character code");
      return;
    }
    setJoining(true);
    try {
      const resolved = await resolveAndJoinAnyRoom(code);

      // Hydrate GameContext + localStorage for friend/season rooms so the
      // downstream room/match screens land with the right context. 5v5
      // rooms don't carry venueId/matchId — they have their own room page.
      if (resolved.kind === "room") {
        dispatch({ type: "SET_VENUE", venueId: resolved.venueId });
        dispatch({ type: "SET_MATCH", matchId: resolved.room.matchId });
        dispatch({ type: "SET_ROOM", roomId: resolved.room.id, roomCode: resolved.room.code });
        if (typeof window !== "undefined") {
          localStorage.setItem("jaffa_venue_id", resolved.venueId);
          if (resolved.room.matchId) {
            localStorage.setItem("jaffa_match_id", resolved.room.matchId);
          }
        }
      }

      if (resolved.alreadyJoined) {
        toast("Already in this room — opening it");
      } else {
        toast.success("Joined room!");
      }

      if (onJoined) {
        onJoined(resolved);
      } else if (resolved.kind === "5v5") {
        router.push(`/5v5/${resolved.roomId}`);
      } else {
        router.push(`/room/${resolved.roomId}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to join room");
    } finally {
      setJoining(false);
    }
  };

  return (
    <section>
      <h3
        className="text-lg font-bold text-white mb-3 pl-3 uppercase"
        style={{
          fontFamily: "'Bungee', 'Impact', cursive",
          borderLeft: `4px solid ${accentColor}`,
        }}
      >
        {title}
      </h3>
      <div className="game-card p-5 space-y-4">
        {hint && (
          <p className="text-[11px] text-[#9ca3af] leading-relaxed -mt-1">{hint}</p>
        )}
        <input
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length === 6 && !joining) handleJoin();
          }}
          placeholder="6-char code"
          className="w-full nb-input px-3 py-3 text-center text-xl tracking-[0.3em] font-mono"
          style={{ background: "#0d0d0d", border: "2px solid #555", borderRadius: 4, color: "#fff" }}
        />
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleJoin}
          disabled={joining || code.length < 6}
          className="w-full btn-sticker py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase disabled:opacity-50"
          style={{ background: "#1a1a1a", color: "#fff", border: `2px solid ${accentColor}` }}
        >
          <LogIn className="w-4 h-4" />
          {joining ? "Joining…" : "Join Room"}
        </motion.button>
      </div>
    </section>
  );
}
