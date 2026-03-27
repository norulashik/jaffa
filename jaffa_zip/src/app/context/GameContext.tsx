'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';

interface User {
  id: string;
  phone: string;
  displayName: string;
  avatarConfig?: string;
}

interface GameState {
  token: string | null;
  userId: string | null;
  user: User | null;
  matchId: string | null;
  venueId: string | null;
  venueSlug: string | null;
  currentRound: number;
  totalPoints: number;
  roundPoints: number;
  currentStreak: number;
  bestStreak: number;
  boostsUsedRound: number;
  allInUsed: boolean;
  totalPredictions: number;
  correctPredictions: number;
}

type GameAction =
  | { type: 'SET_TOKEN'; payload: string }
  | { type: 'SET_USER'; payload: User }
  | { type: 'SET_MATCH'; payload: string }
  | { type: 'SET_VENUE'; payload: { venueId: string; venueSlug?: string } }
  | { type: 'UPDATE_PARTICIPANT'; payload: Partial<GameState> }
  | { type: 'RESET' };

const initialState: GameState = {
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  userId: null,
  user: null,
  matchId: null,
  venueId: null,
  venueSlug: null,
  currentRound: 0,
  totalPoints: 0,
  roundPoints: 0,
  currentStreak: 0,
  bestStreak: 0,
  boostsUsedRound: 0,
  allInUsed: false,
  totalPredictions: 0,
  correctPredictions: 0,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_TOKEN':
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', action.payload);
      }
      return { ...state, token: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload, userId: action.payload.id };
    case 'SET_MATCH':
      return { ...state, matchId: action.payload };
    case 'SET_VENUE':
      return {
        ...state,
        venueId: action.payload.venueId,
        venueSlug: action.payload.venueSlug || state.venueSlug,
      };
    case 'UPDATE_PARTICIPANT':
      return { ...state, ...action.payload };
    case 'RESET':
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
      return initialState;
    default:
      return state;
  }
}

interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within GameProvider');
  }
  return context;
}
