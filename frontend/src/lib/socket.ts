import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ["polling", "websocket"], // Start with polling (works through proxy), upgrade to ws if possible
      extraHeaders: {
        "ngrok-skip-browser-warning": "true",
      },
    });

    socket.on("connect_error", (err) => {
      console.warn("Socket connect error (non-blocking):", err.message);
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function joinVenueMatch(venueId: string, matchId: string): void {
  const s = connectSocket();
  s.emit("joinVenueMatch", { venueId, matchId });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
