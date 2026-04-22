import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets";
import { MatchParticipant, RoomMember } from "../models";

// Extend the Socket type with our authenticated identity. Populated by the
// handshake middleware below; every event handler can trust it.
interface AuthedSocket extends Socket {
  data: {
    authType?: "user" | "venue";
    userId?: string;
    venueId?: string;
  };
}

type DecodedToken =
  | { type: "user"; userId: string }
  | { type: "venue"; venueId: string };

export function setupSocketHandlers(io: SocketIOServer): void {
  // Require a valid JWT at connection time. Tokens may be a user token
  // (player clients) or a venue token (the TV-display page). Owner tokens
  // are intentionally not accepted here — admin work goes via HTTP.
  io.use((socket: AuthedSocket, next) => {
    try {
      const token =
        (socket.handshake.auth && (socket.handshake.auth as { token?: string }).token) ||
        (socket.handshake.headers.authorization || "").replace("Bearer ", "");

      if (!token) return next(new Error("auth:no-token"));

      const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

      if (decoded.type === "user" && decoded.userId) {
        socket.data.authType = "user";
        socket.data.userId = decoded.userId;
        return next();
      }
      if (decoded.type === "venue" && decoded.venueId) {
        socket.data.authType = "venue";
        socket.data.venueId = decoded.venueId;
        return next();
      }

      return next(new Error("auth:bad-type"));
    } catch {
      return next(new Error("auth:invalid"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    console.log(`Client connected: ${socket.id} (${socket.data.authType})`);

    // Player joins its own venue-match room. Server verifies the user is
    // actually a participant of (matchId, venueId) before joining — stops
    // scripts from spying on rooms they don't belong to.
    socket.on("joinVenueMatch", async (data: { venueId: string; matchId: string }) => {
      if (socket.data.authType !== "user" || !socket.data.userId) {
        socket.emit("authError", { event: "joinVenueMatch", error: "user-only" });
        return;
      }
      if (!data?.venueId || !data?.matchId) return;

      try {
        const participant = await MatchParticipant.findOne({
          where: { userId: socket.data.userId, matchId: data.matchId, venueId: data.venueId },
          attributes: ["id"],
        });
        if (!participant) {
          socket.emit("authError", { event: "joinVenueMatch", error: "not-participant" });
          return;
        }

        socket.join(`venue:${data.venueId}:${data.matchId}`);
        socket.join(`match:${data.matchId}`);
      } catch (err) {
        console.error("joinVenueMatch error:", err);
        socket.emit("authError", { event: "joinVenueMatch", error: "lookup-failed" });
      }
    });

    // TV-display page uses a venue token; it may only join its own venue's rooms.
    socket.on("joinTV", (data: { venueId: string; matchId: string }) => {
      if (socket.data.authType !== "venue" || !socket.data.venueId) {
        socket.emit("authError", { event: "joinTV", error: "venue-only" });
        return;
      }
      if (data?.venueId !== socket.data.venueId) {
        socket.emit("authError", { event: "joinTV", error: "venue-mismatch" });
        return;
      }
      if (!data?.matchId) return;

      socket.join(`venue:${data.venueId}:${data.matchId}`);
      socket.join(`match:${data.matchId}`);
      socket.join(`tv:${data.venueId}`);
    });

    socket.on("leaveVenueMatch", (data: { venueId: string; matchId: string }) => {
      if (!data?.venueId || !data?.matchId) return;
      socket.leave(`venue:${data.venueId}:${data.matchId}`);
    });

    // Private rooms — membership checked against RoomMember.
    socket.on("joinRoom", async (data: { roomId: string }) => {
      if (socket.data.authType !== "user" || !socket.data.userId) {
        socket.emit("authError", { event: "joinRoom", error: "user-only" });
        return;
      }
      if (!data?.roomId) return;

      try {
        const membership = await RoomMember.findOne({
          where: { userId: socket.data.userId, roomId: data.roomId },
          attributes: ["id"],
        });
        if (!membership) {
          socket.emit("authError", { event: "joinRoom", error: "not-member" });
          return;
        }
        socket.join(`room:${data.roomId}`);
      } catch (err) {
        console.error("joinRoom error:", err);
        socket.emit("authError", { event: "joinRoom", error: "lookup-failed" });
      }
    });

    socket.on("leaveRoom", (data: { roomId: string }) => {
      if (!data?.roomId) return;
      socket.leave(`room:${data.roomId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

// Event types emitted by the server:
// - "newPrediction" — new prediction questions available
// - "predictionPulse" — a prediction was resolved, with punchy commentary
// - "leaderboardUpdate" — leaderboard changed, clients should refetch
// - "hypeEvent" — all-in used, streak milestone, lead change
// - "roundWinner" — round ended, winners announced
// - "matchEnd" — match is over
// - "inningsBreak" — innings break with target
// - "playerCount" — updated player count
