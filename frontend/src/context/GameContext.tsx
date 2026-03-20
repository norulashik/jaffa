"use client";

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from "react";

interface User {
  id: string;
  phone: string;
  displayName: string;
}

interface GameState {
  user: User | null;
  token: string | null;
  venueId: string | null;
  matchId: string | null;
  venueName: string | null;
  currentRound: number;
  boostsUsedThisRound: number;
  allInUsed: boolean;
  currentStreak: number;
  totalPoints: number;
  roundPoints: Record<number, number>;
  isLoading: boolean;
}

type GameAction =
  | { type: "SET_USER"; user: User; token: string }
  | { type: "SET_VENUE"; venueId: string; venueName: string }
  | { type: "SET_MATCH"; matchId: string }
  | { type: "UPDATE_PARTICIPANT"; data: Partial<GameState> }
  | { type: "USE_BOOST" }
  | { type: "USE_ALL_IN" }
  | { type: "UPDATE_STREAK"; streak: number }
  | { type: "ADD_POINTS"; points: number; round: number }
  | { type: "SET_ROUND"; round: number }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "LOGOUT" };

const initialState: GameState = {
  user: null,
  token: null,
  venueId: null,
  matchId: null,
  venueName: null,
  currentRound: 0,
  boostsUsedThisRound: 0,
  allInUsed: false,
  currentStreak: 0,
  totalPoints: 0,
  roundPoints: {},
  isLoading: true,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.user, token: action.token, isLoading: false };
    case "SET_VENUE":
      return { ...state, venueId: action.venueId, venueName: action.venueName };
    case "SET_MATCH":
      return { ...state, matchId: action.matchId };
    case "UPDATE_PARTICIPANT":
      return { ...state, ...action.data };
    case "USE_BOOST":
      return { ...state, boostsUsedThisRound: state.boostsUsedThisRound + 1 };
    case "USE_ALL_IN":
      return { ...state, allInUsed: true };
    case "UPDATE_STREAK":
      return { ...state, currentStreak: action.streak };
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
      return { ...state, currentRound: action.round, boostsUsedThisRound: 0 };
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };
    case "LOGOUT":
      if (typeof window !== "undefined") {
        localStorage.removeItem("jaffa_token");
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
    const token = localStorage.getItem("jaffa_token");
    if (token) {
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
        .then((user) => dispatch({ type: "SET_USER", user, token }))
        .catch(() => {
          clearTimeout(timeout);
          localStorage.removeItem("jaffa_token");
          dispatch({ type: "SET_LOADING", isLoading: false });
        });
    } else {
      dispatch({ type: "SET_LOADING", isLoading: false });
    }
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
