import { Server as SocketIOServer, Socket } from "socket.io";

export function setupSocketHandlers(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join a venue's match room
    socket.on("joinVenueMatch", (data: { venueId: string; matchId: string }) => {
      const room = `venue:${data.venueId}:${data.matchId}`;
      socket.join(room);
      console.log(`${socket.id} joined room ${room}`);
    });

    // Join TV display room
    socket.on("joinTV", (data: { venueId: string; matchId: string }) => {
      const room = `venue:${data.venueId}:${data.matchId}`;
      socket.join(room);
      socket.join(`tv:${data.venueId}`);
      console.log(`TV display ${socket.id} joined room ${room}`);
    });

    // Leave rooms
    socket.on("leaveVenueMatch", (data: { venueId: string; matchId: string }) => {
      const room = `venue:${data.venueId}:${data.matchId}`;
      socket.leave(room);
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
