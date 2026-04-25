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

// Local-storage key + namespace strategy: store the entire history under one
// key, tagged with the matchId it came from. On hydrate we drop the items if
// the user has switched matches, so the bell never carries old wins from a
// different match.
const STORAGE_KEY = "jaffa_win_history_v1";

type StoredHistory = { matchId: string; items: WinNotification[] };

function readStoredHistory(currentMatchId: string | null): WinNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: StoredHistory = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return [];
    if (currentMatchId && parsed.matchId !== currentMatchId) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

function writeStoredHistory(matchId: string | null, items: WinNotification[]): void {
  if (typeof window === "undefined" || !matchId) return;
  try {
    const payload: StoredHistory = { matchId, items };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
  // predictionIds the user already saw a popup for and dismissed. Persisted
  // so live events that arrived during a disconnect get popped on the next
  // app open via backfill, but already-acked ones stay silent.
  const poppedIdsRef = useRef<Set<string>>(new Set());

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

  // Mount-time setup, in this order:
  //   1. Hydrate from localStorage (instant — bell never visibly empties).
  //   2. Backfill from /predictions/<matchId>/my-predictions so wins missed
  //      while the user was offline / on a non-socket page still show up.
  //      Backfilled items are pre-marked seen → no popup spam, no badge bump.
  //   3. Subscribe to the per-user socket for live wins.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("jaffa_token");
    if (!token) return; // not signed in — nothing to do

    const matchId = localStorage.getItem("jaffa_match_id");
    const venueId = localStorage.getItem("jaffa_venue_id");

    // Hydrate the popped-id set from localStorage so we know which wins the
    // user has already acknowledged across reloads.
    poppedIdsRef.current = readPoppedIds();
    // Anything answered at-or-before this is treated as cleared and dropped
    // by the backfill. Live events with newer timestamps still come through.
    const clearedAt = readClearedAt();

    // (1) hydrate from localStorage — drops items if matchId differs OR if
    // they're older than the cleared-at marker (user tapped Clear earlier).
    const stored = readStoredHistory(matchId).filter(
      (n) => !clearedAt || n.receivedAt > clearedAt
    );
    if (stored.length > 0) {
      for (const n of stored) seenIdsRef.current.add(n.predictionId);
      setHistory(sortByReceivedDesc(stored));
    }

    // (2) backfill from API. Best-effort; failures are silent so the bell
    // still works on hydrated state. Wins the user has NOT yet popped
    // (i.e. not in poppedIdsRef) are queued as popups, capped per burst so
    // a long absence doesn't blast 15 modals at once.
    let cancelled = false;
    if (matchId && venueId) {
      api
        .getMyPredictions(matchId, venueId)
        .then((rows) => {
          if (cancelled) return;
          let popsBudget = BACKFILL_POPUP_CAP;
          const wins: WinNotification[] = (rows || [])
            .filter((r: any) => {
              if (r.isCorrect !== true) return false;
              if (Number(r.pointsEarned) <= 0) return false;
              if (!r.prediction?.id) return false;
              if (seenIdsRef.current.has(r.prediction.id)) return false;
              // Drop anything answered before the user tapped Clear.
              if (clearedAt && r.answeredAt) {
                const answeredMs = new Date(r.answeredAt).getTime();
                if (answeredMs <= clearedAt) return false;
              }
              return true;
            })
            .map((r: any) => {
              seenIdsRef.current.add(r.prediction.id);
              const opt = r.prediction.options?.find(
                (o: any) => (o.key || o.label) === r.selectedOption
              );
              const tsRaw = r.answeredAt ? new Date(r.answeredAt).getTime() : Date.now();
              const alreadyPopped = poppedIdsRef.current.has(r.prediction.id);
              const note: WinNotification = {
                id: `${r.prediction.id}-bf-${tsRaw}`,
                predictionId: r.prediction.id,
                matchId: r.matchId || matchId,
                question: r.prediction.question || "Prediction",
                pointsEarned: Number(r.pointsEarned) || 0,
                selectedLabel: opt?.label || r.selectedOption || "",
                streak: 0,
                category: r.prediction.category || "",
                overNumber: r.prediction.overNumber ?? null,
                receivedAt: tsRaw,
                seenInBell: alreadyPopped,
              };
              // Queue a popup if the user has never seen this win before AND
              // we still have headroom in this backfill burst.
              if (!alreadyPopped && popsBudget > 0) {
                popsBudget -= 1;
                if (currentRef.current === null) {
                  setCurrentPopup(note);
                  currentRef.current = note;
                } else {
                  setQueue((prev) => [...prev, note]);
                }
              }
              return note;
            });
          if (wins.length === 0) return;
          setHistory((prev) =>
            sortByReceivedDesc([...prev, ...wins]).slice(0, HISTORY_LIMIT)
          );
        })
        .catch(() => { /* silent */ });
    }

    // (3) subscribe to live wins.
    const socket = connectSocket();
    if (!socket) return () => { cancelled = true; };

    const handleWin = (data: any) => {
      if (!data || !data.predictionId) return;

      // Drop duplicates (server retries, multiple resolver passes, backfill).
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

      setHistory((prev) =>
        sortByReceivedDesc([note, ...prev]).slice(0, HISTORY_LIMIT)
      );

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
      cancelled = true;
      socket.off("myPredictionWin", handleWin);
    };
  }, []);

  // Persist history to localStorage on every change so reloads / cross-page
  // navs keep the bell populated.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const matchId = localStorage.getItem("jaffa_match_id");
    writeStoredHistory(matchId, history);
  }, [history]);

  const dismissPopup = useCallback(() => {
    // Persist this win as already-popped so on next app open we don't
    // re-pop it via backfill.
    const cur = currentRef.current;
    if (cur?.predictionId) {
      poppedIdsRef.current.add(cur.predictionId);
      persistPoppedIds(poppedIdsRef.current);
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
    seenIdsRef.current.clear();
    poppedIdsRef.current.clear();
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
