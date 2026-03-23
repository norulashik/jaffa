import { Server as SocketIOServer, Socket } from "socket.io";

export function setupSocketHandlers(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join a venue's match room + match-level room
    socket.on("joinVenueMatch", (data: { venueId: string; matchId: string }) => {
      const venueRoom = `venue:${data.venueId}:${data.matchId}`;
      const matchRoom = `match:${data.matchId}`;
      socket.join(venueRoom);
      socket.join(matchRoom);
      console.log(`${socket.id} joined rooms ${venueRoom}, ${matchRoom}`);
    });

    // Join TV display room + match-level room
    socket.on("joinTV", (data: { venueId: string; matchId: string }) => {
      const venueRoom = `venue:${data.venueId}:${data.matchId}`;
      const matchRoom = `match:${data.matchId}`;
      socket.join(venueRoom);
      socket.join(matchRoom);
      socket.join(`tv:${data.venueId}`);
      console.log(`TV display ${socket.id} joined rooms ${venueRoom}, ${matchRoom}`);
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
