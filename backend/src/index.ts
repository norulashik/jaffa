import express from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import { sequelize } from "./models";
import authRoutes from "./routes/auth";
import venueRoutes from "./routes/venue";
import matchRoutes from "./routes/match";
import predictionRoutes from "./routes/prediction";
import leaderboardRoutes from "./routes/leaderboard";
import rewardRoutes from "./routes/reward";
import adminRoutes from "./routes/admin";
import { setupSocketHandlers } from "./socket/handlers";
import { pollSportsmonkUpdates } from "./services/sportsmonkApi";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(express.json());

// Make io accessible in routes
app.set("io", io);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/venues", venueRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Socket.IO
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log("Database connected");

    await sequelize.sync();
    console.log("Database synced");

    server.listen(PORT, () => {
      console.log(`JAFFA backend running on port ${PORT}`);

      // Sportsmonk: poll every 30 seconds for ball-by-ball updates
      const POLL_INTERVAL = 30 * 1000;
      setInterval(async () => {
        try {
          await pollSportsmonkUpdates(io);
        } catch (err) {
          console.error("Sportsmonk poll error:", err);
        }
      }, POLL_INTERVAL);
      console.log(`Sportsmonk live polling enabled (every ${POLL_INTERVAL / 1000}s)`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();

export { app, io, server };
