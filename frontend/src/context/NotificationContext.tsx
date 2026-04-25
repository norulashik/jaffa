"use client";

/**
 * NotificationContext — global home for "you got it right!" win events
 * pushed from the backend over the per-user socket room.
 *
 * Behaviour:
 *  - When the backend emits `myPredictionWin`, we push it onto a queue.
 *  - The WinPopup component, mounted at the root, shows the head of the
 *    queue as a centered modal. The user dismisses it; the next one shows.
 *  - Every win is also recorded in `history` (capped) so the bell drawer
 *    in the Header can list them later. `unreadCount` drives the badge.
 *  - Provider self-mounts the socket connection so the listener is alive
 *    on every page, not just the match dashboard.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { connectSocket } from "@/lib/socket";

export interface WinNotification {
  id: string;              // unique client-side id
  predictionId: string;
  matchId: string;
  question: string;
  pointsEarned: number;
  selectedLabel: string;
  streak: number;
  category: string;
  overNumber: number | null;
  receivedAt: number;      // epoch ms
  seenInBell: boolean;     // flipped when bell drawer is opened
}

interface NotificationCtxValue {
  history: WinNotification[];
  currentPopup: WinNotification | null;
  unreadCount: number;
  dismissPopup: () => void;
  markAllSeen: () => void;
  clearAll: () => void;
}

const HISTORY_LIMIT = 30;

const NotificationCtx = createContext<NotificationCtxValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<WinNotification[]>([]);
  const [currentPopup, setCurrentPopup] = useState<WinNotification | null>(null);
  const [history, setHistory] = useState<WinNotification[]>([]);
  // Refs help us avoid stale-closure issues inside the socket handler, which
  // is registered once on mount but reads queue/currentPopup state on every
  // event.
  const queueRef = useRef<WinNotification[]>([]);
  const currentRef = useRef<WinNotification | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentRef.current = currentPopup; }, [currentPopup]);

  // Promote next from queue → currentPopup whenever the slot frees up.
  useEffect(() => {
    if (currentPopup === null && queue.length > 0) {
      const [head, ...rest] = queue;
      setCurrentPopup(head);
      setQueue(rest);
    }
  }, [currentPopup, queue]);

  // Subscribe to the per-user socket room. The connection is a singleton
  // so this doesn't fight the per-page socket consumers (match page etc.).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("jaffa_token");
    if (!token) return; // not signed in — nothing to subscribe to

    const socket = connectSocket();
    if (!socket) return;

    const handleWin = (data: any) => {
      if (!data || !data.predictionId) return;

      // Drop duplicates (server retries, multiple resolver passes)
      if (seenIdsRef.current.has(data.predictionId)) return;
      seenIdsRef.current.add(data.predictionId);

      const note: WinNotification = {
        id: `${data.predictionId}-${Date.now()}`,
        predictionId: data.predictionId,
        matchId: data.matchId || "",
        question: data.question || "Prediction",
        pointsEarned: Number(data.pointsEarned) || 0,
        selectedLabel: data.selectedLabel || "",
        streak: Number(data.streak) || 0,
        category: data.category || "",
        overNumber: data.overNumber ?? null,
        receivedAt: Date.now(),
        seenInBell: false,
      };

      // Add to history (newest first, capped).
      setHistory((prev) => [note, ...prev].slice(0, HISTORY_LIMIT));

      // If nothing showing, surface immediately. Otherwise queue behind the
      // current popup; the effect above promotes it once the user dismisses.
      if (currentRef.current === null) {
        setCurrentPopup(note);
      } else {
        setQueue((prev) => [...prev, note]);
      }
    };

    socket.on("myPredictionWin", handleWin);
    return () => {
      socket.off("myPredictionWin", handleWin);
    };
  }, []);

  const dismissPopup = useCallback(() => {
    setCurrentPopup(null);
  }, []);

  const markAllSeen = useCallback(() => {
    setHistory((prev) =>
      prev.map((n) => (n.seenInBell ? n : { ...n, seenInBell: true }))
    );
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    setQueue([]);
    setCurrentPopup(null);
    seenIdsRef.current.clear();
  }, []);

  const unreadCount = useMemo(
    () => history.filter((n) => !n.seenInBell).length,
    [history]
  );

  const value = useMemo<NotificationCtxValue>(
    () => ({ history, currentPopup, unreadCount, dismissPopup, markAllSeen, clearAll }),
    [history, currentPopup, unreadCount, dismissPopup, markAllSeen, clearAll]
  );

  return <NotificationCtx.Provider value={value}>{children}</NotificationCtx.Provider>;
}

export function useNotifications(): NotificationCtxValue {
  const ctx = useContext(NotificationCtx);
  if (!ctx) {
    // Don't crash pages mounted outside the provider — return inert state.
    return {
      history: [],
      currentPopup: null,
      unreadCount: 0,
      dismissPopup: () => {},
      markAllSeen: () => {},
      clearAll: () => {},
    };
  }
  return ctx;
}
