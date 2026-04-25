"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";

/**
 * Bell icon + dropdown drawer. Lives in the Header next to the profile
 * avatar. Badge shows unseen-in-bell count; opening the drawer marks
 * everything currently in the list as seen so the badge clears.
 */
export default function NotificationBell() {
  const { history, unreadCount, markAllSeen, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllSeen();
  };

  const fmtTime = (ms: number) => {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={handleToggle}
        className="border-2 border-[#ff6341] rounded-[3px] w-9 h-9 flex items-center justify-center bg-[#1a1a1a]"
        style={{ boxShadow: "2px 2px 0 0 #ff6341" }}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-[#ff6341]" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#22c55e] text-black text-[10px] font-black border-2 border-[#1a1a1a]"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 w-[300px] max-h-[60vh] flex flex-col bg-[#0d0d0d] border-2 border-[#ff6341] rounded-[4px] z-50 overflow-hidden"
          style={{ boxShadow: "4px 4px 0 0 #ff6341" }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
            <span
              className="text-xs font-black text-white uppercase tracking-wider"
              style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
            >
              Notifications
            </span>
            <div className="flex items-center gap-1">
              {history.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-white/40 hover:text-white/70 font-bold uppercase tracking-wider px-1"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white/60"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {history.length === 0 ? (
              <p className="text-center text-white/40 text-xs font-bold uppercase tracking-wider py-8 px-4">
                No wins yet — get a prediction right and they'll land here
              </p>
            ) : (
              <ul className="divide-y divide-[#2a2a2a]">
                {history.map((n) => (
                  <li key={n.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                        {fmtTime(n.receivedAt)}
                      </span>
                      <span className="text-xs font-black text-[#22c55e] whitespace-nowrap">
                        +{n.pointsEarned} pts
                      </span>
                    </div>
                    <p className="text-xs text-white/85 font-semibold leading-snug">
                      {n.question}
                    </p>
                    {n.selectedLabel && (
                      <p className="text-[10px] text-white/45 mt-0.5">
                        Your pick: <span className="text-[#22c55e] font-bold">{n.selectedLabel}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
