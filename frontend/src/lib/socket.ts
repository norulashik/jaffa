import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");

let socket: Socket | null = null;
let socketToken: string | null = null;

function readToken(): string {
  if (typeof window === "undefined") return "";
  // Player pages use jaffa_token; TV/venue pages prefer jaffa_venue_token.
  // Fall back to user token so a logged-in user can still open the TV URL if needed.
  return (
    localStorage.getItem("jaffa_venue_token") ||
    localStorage.getItem("jaffa_token") ||
    ""
  );
}

export function getSocket(): Socket {
  const currentToken = readToken();

  // If the stored token changed (login/logout), tear down the old socket so we
  // reconnect with the new credentials instead of staying auth'd as a stale user.
  if (socket && socketToken !== currentToken) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socketToken = currentToken;
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ["polling", "websocket"], // Start with polling (works through proxy), upgrade to ws if possible
      // Server middleware reads this on connection to authenticate. Without it,
      // the server rejects the handshake with an auth error.
      auth: { token: currentToken },
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

export function joinSocketRoom(roomId: string): void {
  const s = connectSocket();
  s.emit("joinRoom", { roomId });
}

export function leaveSocketRoom(roomId: string): void {
  const s = connectSocket();
  s.emit("leaveRoom", { roomId });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
