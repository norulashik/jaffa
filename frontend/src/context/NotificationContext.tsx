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
import { api } from "@/lib/api";

// Persist the entire notification history globally. Notifications are account-
// scoped, not "current match" scoped: changing rooms / opening a past battle
// should never erase the bell history or forget which win popups were already
// shown.
const STORAGE_KEY = "jaffa_win_history_v1";

function readStoredHistory(): WinNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

function writeStoredHistory(items: WinNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota / SecurityError — bell still works in-memory.
  }
}

function sortByReceivedDesc(items: WinNotification[]): WinNotification[] {
  return [...items].sort((a, b) => b.receivedAt - a.receivedAt);
}

// Persisted set of predictionIds whose popup the user has already seen +
// dismissed. Lets us safely fire popups for backfilled wins (which the user
// never saw a popup for, e.g. while they were offline) without re-popping
// stuff they've already acknowledged. Lives across reloads.
const POPPED_KEY = "jaffa_win_popped_v1";

function readPoppedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(POPPED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistPoppedIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    // Cap at 200 to keep storage small; oldest naturally evict via insertion order.
    const arr = Array.from(ids).slice(-200);
    localStorage.setItem(POPPED_KEY, JSON.stringify(arr));
  } catch {
    // ignore quota issues
  }
}

// How many backfilled missed-wins to actually pop on app open. Anything beyond
// this lands silently in the bell drawer so a user who was away for a long
// time doesn't get bombarded with 15 modals on launch.
const BACKFILL_POPUP_CAP = 5;

// Persistent "cleared at" timestamp. When the user taps Clear in the bell
// drawer, we stash Date.now() here. The backfill on the next mount then
// drops every UserPrediction whose answeredAt is <= this timestamp, so the
// cleared list doesn't resurrect on refresh / new event arrival.
const CLEARED_AT_KEY = "jaffa_win_cleared_at_v1";

function readClearedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(CLEARED_AT_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeClearedAt(at: number): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CLEARED_AT_KEY, String(at)); } catch { /* noop */ }
}

export interface WinNotification {
  id: string;              // unique client-side id
  notificationKey: string; // stable identity for this specific answered pick
  userPredictionId: string;
  predictionId: string;
  matchId: string;
  venueId?: string | null;
  roomId?: string | null;
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
  const seenKeysRef = useRef<Set<string>>(new Set());
  // notification keys the user already saw a popup for and dismissed. Persisted
  // so live events that arrived during a disconnect get popped on the next
  // app open via backfill, but already-acked ones stay silent.
  const poppedKeysRef = useRef<Set<string>>(new Set());
  // Session-only guard so poll/reconnect backfill doesn't enqueue the same
  // popup repeatedly before the user dismisses it.
  const popupSessionKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentRef.current = currentPopup; }, [currentPopup]);

  const noteKey = useCallback((row: any) => {
    if (row?.userPredictionId) return String(row.userPredictionId);
    if (row?.id) return String(row.id);
    const predictionId = String(row?.predictionId || row?.prediction?.id || "");
    const matchId = String(row?.matchId || "");
    const venueId = String(row?.venueId || "");
    const roomId = String(row?.roomId || "");
    return `${predictionId}:${matchId}:${venueId}:${roomId}`;
  }, []);

  const enqueuePopup = useCallback((note: WinNotification) => {
    if (!note.notificationKey) return;
    if (popupSessionKeysRef.current.has(note.notificationKey)) return;
    popupSessionKeysRef.current.add(note.notificationKey);

    if (currentRef.current === null) {
      setCurrentPopup(note);
      return;
    }
    setQueue((prev) => [...prev, note]);
  }, []);

  // Promote next from queue → currentPopup whenever the slot frees up.
  useEffect(() => {
    if (currentPopup === null && queue.length > 0) {
      const [head, ...rest] = queue;
      setCurrentPopup(head);
      setQueue(rest);
    }
  }, [currentPopup, queue]);

  // Reusable backfill: fetches the user's resolved-correct picks and reconciles
  // them with what the bell already knows. Runs on mount, on a 15 s interval,
  // and on every socket reconnect, so a missed live event still reaches the
  // user within ~15 s. Idempotent — dedup via seenKeysRef + poppedKeysRef +
  // clearedAt prevents duplicates / cleared resurrects / popup spam.
  const runBackfill = useCallback(async () => {
    if (typeof window === "undefined") return;
    const matchId = localStorage.getItem("jaffa_match_id");
    const venueId = localStorage.getItem("jaffa_venue_id");
    const roomId = localStorage.getItem("jaffa_room_id");
    if (!matchId || !venueId) return;
    const clearedAt = readClearedAt();

    let rows: any[] = [];
    try {
      rows = (await api.getMyPredictions(matchId, venueId, roomId)) || [];
    } catch {
      return; // silent — periodic poller will try again
    }

    let popsBudget = BACKFILL_POPUP_CAP;
    const wins: WinNotification[] = [];
    for (const r of rows) {
      if (r.isCorrect !== true) continue;
      if (Number(r.pointsEarned) <= 0) continue;
      if (!r.prediction?.id) continue;
      if (clearedAt && r.answeredAt) {
        const answeredMs = new Date(r.answeredAt).getTime();
        if (answeredMs <= clearedAt) continue;
      }

      const notificationKey = noteKey(r);
      const alreadyKnown = seenKeysRef.current.has(notificationKey);
      const alreadyPopped = poppedKeysRef.current.has(notificationKey);
      const opt = r.prediction.options?.find(
        (o: any) => (o.key || o.label) === r.selectedOption
      );
      const tsRaw = r.answeredAt ? new Date(r.answeredAt).getTime() : Date.now();
      const note: WinNotification = {
        id: `${r.prediction.id}-bf-${tsRaw}`,
        notificationKey,
        userPredictionId: String(r.id || ""),
        predictionId: r.prediction.id,
        matchId: r.matchId || matchId,
        venueId: r.venueId ?? venueId,
        roomId: r.roomId ?? roomId,
        question: r.prediction.question || "Prediction",
        pointsEarned: Number(r.pointsEarned) || 0,
        selectedLabel: opt?.label || r.selectedOption || "",
        streak: 0,
        category: r.prediction.category || "",
        overNumber: r.prediction.overNumber ?? null,
        receivedAt: tsRaw,
        seenInBell: false,
      };

      if (!alreadyKnown) {
        seenKeysRef.current.add(notificationKey);
        wins.push(note);
      }
      if (!alreadyPopped && popsBudget > 0) {
        enqueuePopup(note);
        popsBudget -= 1;
      }
    }

    if (wins.length === 0) return;
    setHistory((prev) =>
      sortByReceivedDesc([...prev, ...wins]).slice(0, HISTORY_LIMIT)
    );
  }, [enqueuePopup, noteKey]);

  // Mount-time setup, in this order:
  //   1. Hydrate from localStorage (instant — bell never visibly empties).
  //   2. Initial backfill via runBackfill().
  //   3. Subscribe to the per-user socket for live wins.
  //   4. Re-run backfill every 15 s as a safety net for missed socket events.
  //   5. Re-run backfill on every socket reconnect so a network blip doesn't
  //      lose the wins that resolved during the disconnect window.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("jaffa_token");
    if (!token) return; // not signed in — nothing to do

    poppedKeysRef.current = readPoppedIds();
    const clearedAt = readClearedAt();

    // (1) hydrate from localStorage
    const stored = readStoredHistory().filter(
      (n) => !clearedAt || n.receivedAt > clearedAt
    );
    if (stored.length > 0) {
      for (const n of stored) {
        const key = n.notificationKey || n.userPredictionId || n.predictionId;
        if (!key) continue;
        seenKeysRef.current.add(key);
      }
      setHistory(sortByReceivedDesc(stored));
    }

    // (2) initial backfill
    runBackfill();

    // (3) subscribe to live wins
    const socket = connectSocket();
    if (!socket) return;

    const handleWin = (data: any) => {
      if (!data || !data.predictionId) return;
      const notificationKey = noteKey(data);
      if (!notificationKey) return;

      const note: WinNotification = {
        id: `${data.predictionId}-${Date.now()}`,
        notificationKey,
        userPredictionId: String(data.userPredictionId || ""),
        predictionId: data.predictionId,
        matchId: data.matchId || "",
        venueId: data.venueId ?? null,
        roomId: data.roomId ?? null,
        question: data.question || "Prediction",
        pointsEarned: Number(data.pointsEarned) || 0,
        selectedLabel: data.selectedLabel || "",
        streak: Number(data.streak) || 0,
        category: data.category || "",
        overNumber: data.overNumber ?? null,
        receivedAt: Date.now(),
        seenInBell: false,
      };

      if (!seenKeysRef.current.has(notificationKey)) {
        seenKeysRef.current.add(notificationKey);
        setHistory((prev) =>
          sortByReceivedDesc([note, ...prev]).slice(0, HISTORY_LIMIT)
        );
      }
      if (!poppedKeysRef.current.has(notificationKey)) enqueuePopup(note);
    };

    // (5) reconnect handler — backfills missed wins from the disconnect window
    const handleReconnect = () => { runBackfill(); };

    socket.on("myPredictionWin", handleWin);
    socket.on("connect", handleReconnect);

    // (4) periodic safety net — every 15 s
    const interval = setInterval(() => { runBackfill(); }, 15_000);

    return () => {
      socket.off("myPredictionWin", handleWin);
      socket.off("connect", handleReconnect);
      clearInterval(interval);
    };
  }, [enqueuePopup, noteKey, runBackfill]);

  // Persist history to localStorage on every change so reloads / cross-page
  // navs keep the bell populated.
  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStoredHistory(history);
  }, [history]);

  const dismissPopup = useCallback(() => {
    // Persist this win as already-popped so on next app open we don't
    // re-pop it via backfill.
    const cur = currentRef.current;
    if (cur?.notificationKey) {
      poppedKeysRef.current.add(cur.notificationKey);
      persistPoppedIds(poppedKeysRef.current);
    }
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
    seenKeysRef.current.clear();
    poppedKeysRef.current.clear();
    popupSessionKeysRef.current.clear();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(POPPED_KEY);
        // Stamp "cleared at = now" so the next mount's API backfill drops
        // every UserPrediction answered before this point. Without this,
        // refresh / new live event would re-pull all the cleared wins from
        // the server.
        writeClearedAt(Date.now());
      } catch { /* noop */ }
    }
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
