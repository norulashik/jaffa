import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

// Demo mode: no backend URL configured — use a silent no-op mock socket
// so the app works without a backend and without console errors.
const IS_DEMO = !SOCKET_URL;

// Minimal EventEmitter-compatible mock that silently swallows all calls
class MockSocket {
  private listeners: Record<string, ((...args: any[]) => void)[]> = {};

  get id() { return 'demo-socket'; }
  get connected() { return false; }

  on(_event: string, _cb: (...args: any[]) => void) { return this; }
  off(_event: string, _cb?: (...args: any[]) => void) { return this; }
  emit(_event: string, ..._args: any[]) { return this; }
  connect() { return this; }
  disconnect() { return this; }
}

let socket: Socket | MockSocket | null = null;

export function getSocket(): Socket | MockSocket {
  if (socket) return socket;

  if (IS_DEMO) {
    socket = new MockSocket();
    return socket;
  }

  const realSocket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionAttempts: 3,
    timeout: 5000,
  });

  realSocket.on('connect', () => {
    console.log('[Socket] Connected:', realSocket.id);
  });

  realSocket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  realSocket.on('connect_error', (error) => {
    // Only log once, not on every retry
    console.warn('[Socket] Connection unavailable — running in demo mode.', error.message);
  });

  socket = realSocket;
  return socket;
}

export function disconnectSocket() {
  if (socket && !IS_DEMO) {
    (socket as Socket).disconnect();
  }
  socket = null;
}

// Socket event types
export interface SocketEvents {
  // Client to Server
  joinVenueMatch: (data: { venueId: string; matchId: string }) => void;
  leaveVenueMatch: (data: { venueId: string; matchId: string }) => void;
  joinTV: (data: { venueId: string }) => void;

  // Server to Client
  newPrediction: (data: any) => void;
  predictionsLocked: (data: any) => void;
  predictionResolved: (data: any) => void;
  predictionPulse: (data: any) => void;
  leaderboardUpdate: (data: any) => void;
  hypeEvent: (data: any) => void;
  roundWinner: (data: any) => void;
  scoreUpdate: (data: any) => void;
  matchStarted: (data: any) => void;
  inningsBreak: (data: any) => void;
  matchEnd: (data: any) => void;
  playerCount: (data: { count: number }) => void;
}
