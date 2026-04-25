"use client";

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from "react";
import { AvatarConfig } from "@/types/avatar";
import { SAFE_BOOT } from "@/lib/runtime-flags";

interface User {
  id: string;
  phone: string;
  displayName: string;
  avatarConfig?: AvatarConfig | null;
}

interface GameState {
  user: User | null;
  token: string | null;
  userId: string | null;
  venueId: string | null;
  venueSlug: string | null;
  matchId: string | null;
  venueName: string | null;
  roomId: string | null;
  roomCode: string | null;
  currentRound: number;
  boostsUsedThisRound: number;
  boostsUsedRound: number;
  allInUsed: boolean;
  // Per-innings all-in flags (innings 1 = rounds 1-3, innings 2 = rounds 4-6).
  // Product rule: one 3x all-in allowed per innings (not per match).
  allInUsedInnings1: boolean;
  allInUsedInnings2: boolean;
  currentStreak: number;
  bestStreak: number;
  totalPoints: number;
  weeklyPoints: number;
  roundPoints: Record<number, number>;
  totalPredictions: number;
  correctPredictions: number;
  isLoading: boolean;
}

type GameAction =
  | { type: "SET_USER"; user: User; token: string }
  | { type: "SET_TOKEN"; payload: string }
  | { type: "SET_VENUE"; venueId: string; venueName?: string; venueSlug?: string }
  | { type: "SET_MATCH"; matchId: string }
  | { type: "CLEAR_MATCH" }
  | { type: "UPDATE_PARTICIPANT"; data: Partial<GameState> }
  | { type: "USE_BOOST" }
  | { type: "USE_ALL_IN"; innings?: 1 | 2 }
  | { type: "UPDATE_STREAK"; streak: number }
  | { type: "ADD_POINTS"; points: number; round: number }
  | { type: "SET_ROUND"; round: number }
  | { type: "SET_ROOM"; roomId: string; roomCode?: string }
  | { type: "CLEAR_ROOM" }
  | { type: "SET_WEEKLY_POINTS"; weeklyPoints: number }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "LOGOUT" }
  | { type: "RESET" };

const initialState: GameState = {
  user: null,
  token: null,
  userId: null,
  venueId: null,
  venueSlug: null,
  matchId: null,
  venueName: null,
  roomId: null,
  roomCode: null,
  currentRound: 0,
  boostsUsedThisRound: 0,
  boostsUsedRound: 0,
  allInUsed: false,
  allInUsedInnings1: false,
  allInUsedInnings2: false,
  currentStreak: 0,
  bestStreak: 0,
  totalPoints: 0,
  weeklyPoints: 0,
  roundPoints: {},
  totalPredictions: 0,
  correctPredictions: 0,
  isLoading: true,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_USER":
      if (typeof window !== "undefined") {
        localStorage.setItem("jaffa_user", JSON.stringify(action.user));
      }
      return { ...state, user: action.user, userId: action.user.id, token: action.token, isLoading: false };
    case "SET_TOKEN":
      if (typeof window !== "undefined") {
        localStorage.setItem("jaffa_token", action.payload);
      }
      return { ...state, token: action.payload };
    case "SET_VENUE":
      return { ...state, venueId: action.venueId, venueName: action.venueName || state.venueName, venueSlug: action.venueSlug || state.venueSlug };
    case "SET_MATCH":
      return { ...state, matchId: action.matchId };
    case "CLEAR_MATCH":
      if (typeof window !== "undefined") {
        localStorage.removeItem("jaffa_match_id");
      }
      return { ...state, matchId: null, currentRound: 0, totalPoints: 0, currentStreak: 0, roundPoints: {}, totalPredictions: 0, correctPredictions: 0 };
    case "UPDATE_PARTICIPANT":
      return { ...state, ...action.data };
    case "USE_BOOST":
      return { ...state, boostsUsedThisRound: state.boostsUsedThisRound + 1, boostsUsedRound: state.boostsUsedRound + 1 };
    case "USE_ALL_IN": {
      // Optimistic update: set the innings-specific flag. Backend confirms
      // via the next /state fetch. If innings isn't passed, we mark BOTH
      // innings true to be safe — backend is authoritative regardless.
      const patch: Partial<GameState> = { allInUsed: true };
      if (action.innings === 1) patch.allInUsedInnings1 = true;
      else if (action.innings === 2) patch.allInUsedInnings2 = true;
      else { patch.allInUsedInnings1 = true; patch.allInUsedInnings2 = true; }
      return { ...state, ...patch };
    }
    case "UPDATE_STREAK":
      return { ...state, currentStreak: action.streak, bestStreak: Math.max(state.bestStreak, action.streak) };
    case "ADD_POINTS":
      return {
        ...state,
        totalPoints: state.totalPoints + action.points,
        roundPoints: {
          ...state.roundPoints,
          [action.round]: (state.roundPoints[action.round] || 0) + action.points,
        },
      };
    case "SET_ROUND":
      return { ...state, currentRound: action.round, boostsUsedThisRound: 0, boostsUsedRound: 0 };
    case "SET_ROOM":
      if (typeof window !== "undefined") {
        localStorage.setItem("jaffa_room_id", action.roomId);
        if (action.roomCode) localStorage.setItem("jaffa_room_code", action.roomCode);
      }
      return { ...state, roomId: action.roomId, roomCode: action.roomCode || state.roomCode };
    case "CLEAR_ROOM":
      if (typeof window !== "undefined") {
        localStorage.removeItem("jaffa_room_id");
        localStorage.removeItem("jaffa_room_code");
      }
      return { ...state, roomId: null, roomCode: null };
    case "SET_WEEKLY_POINTS":
      return { ...state, weeklyPoints: action.weeklyPoints };
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };
    case "LOGOUT":
    case "RESET":
      if (typeof window !== "undefined") {
        localStorage.removeItem("jaffa_token");
        localStorage.removeItem("jaffa_user");
        localStorage.removeItem("jaffa_venue_id");
        localStorage.removeItem("jaffa_match_id");
        localStorage.removeItem("jaffa_venue_name");
        localStorage.removeItem("jaffa_room_id");
        localStorage.removeItem("jaffa_room_code");
      }
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}>({ state: initialState, dispatch: () => {} });

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Restore session on mount
  useEffect(() => {
    if (SAFE_BOOT) {
      dispatch({ type: "SET_LOADING", isLoading: false });
      return;
    }

    // Purge any "null"/"undefined" string poison that older builds wrote
     // into localStorage from the past-battle nav path, so the rest of the
     // hydration treats the slot as genuinely empty.
    for (const k of ["jaffa_venue_id", "jaffa_match_id", "jaffa_room_id"]) {
      const v = localStorage.getItem(k);
      if (v === "null" || v === "undefined") localStorage.removeItem(k);
    }

    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      dispatch({ type: "SET_LOADING", isLoading: false });
      const savedVenueId = localStorage.getItem("jaffa_venue_id");
      const savedMatchId = localStorage.getItem("jaffa_match_id");
      const savedRoomId = localStorage.getItem("jaffa_room_id");
      if (savedVenueId) dispatch({ type: "SET_VENUE", venueId: savedVenueId, venueName: localStorage.getItem("jaffa_venue_name") || "" });
      if (savedMatchId) dispatch({ type: "SET_MATCH", matchId: savedMatchId });
      if (savedRoomId) dispatch({ type: "SET_ROOM", roomId: savedRoomId, roomCode: localStorage.getItem("jaffa_room_code") || undefined });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeout);
        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          return res.json();
        }
        return Promise.reject();
      })
      .then((user) => {
        dispatch({ type: "SET_USER", user, token });
        const savedVenueId = localStorage.getItem("jaffa_venue_id");
        const savedMatchId = localStorage.getItem("jaffa_match_id");
        const savedRoomId = localStorage.getItem("jaffa_room_id");
        if (savedVenueId) dispatch({ type: "SET_VENUE", venueId: savedVenueId, venueName: localStorage.getItem("jaffa_venue_name") || "" });
        if (savedMatchId) dispatch({ type: "SET_MATCH", matchId: savedMatchId });
        if (savedRoomId) dispatch({ type: "SET_ROOM", roomId: savedRoomId, roomCode: localStorage.getItem("jaffa_room_code") || undefined });

        // Fetch weekly points
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/weekly-rewards/points`, {
          headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
        })
          .then((r) => r.ok ? r.json() : Promise.reject())
          .then((data) => dispatch({ type: "SET_WEEKLY_POINTS", weeklyPoints: data.weeklyPoints }))
          .catch(() => {});

        // Location capture moved to global leaderboard page — only prompt when user visits it
      })
      .catch(() => {
        clearTimeout(timeout);
        localStorage.removeItem("jaffa_token");
        dispatch({ type: "SET_LOADING", isLoading: false });
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
