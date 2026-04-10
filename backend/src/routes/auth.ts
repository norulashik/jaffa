import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User, OTP, MatchParticipant } from "../models";
import { Op } from "sequelize";
import sequelize from "../config/database";
import { generateAvatarConfig } from "../utils/avatarGenerator";
import { authenticateUser, AuthRequest } from "../middleware/auth";

const router = Router();

// Direct phone login/register (no OTP)
router.post("/phone-login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, displayName } = req.body;

    if (!phone || !/^\+?[0-9]{10,15}$/.test(phone)) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }

    let user = await User.findOne({ where: { phone } });
    let isNewUser = false;

    if (!user) {
      if (!displayName || !String(displayName).trim()) {
        res.status(400).json({ error: "Nickname is required for new users" });
        return;
      }

      const trimmedName = String(displayName).trim();
      const nameTaken = await User.findOne({ where: sequelize.where(sequelize.fn("LOWER", sequelize.col("displayName")), trimmedName.toLowerCase()) });
      if (nameTaken) {
        res.status(409).json({ error: "This nickname is already taken. Choose another name." });
        return;
      }

      const avatarConfig = JSON.stringify(generateAvatarConfig(phone));
      user = await User.create({
        phone,
        displayName: trimmedName,
        avatarConfig,
      });
      isNewUser = true;
    } else if (displayName && String(displayName).trim() && user.displayName !== String(displayName).trim()) {
      const trimmedName = String(displayName).trim();
      const nameTaken = await User.findOne({ where: sequelize.where(sequelize.fn("LOWER", sequelize.col("displayName")), trimmedName.toLowerCase()) });
      if (nameTaken && nameTaken.id !== user.id) {
        res.status(409).json({ error: "This nickname is already taken. Choose another name." });
        return;
      }
      await user.update({ displayName: trimmedName });
    }

    if (!user.avatarConfig) {
      const avatarConfig = JSON.stringify(generateAvatarConfig(user.id));
      await user.update({ avatarConfig });
    }

    const token = jwt.sign(
      { userId: user.id, type: "user" },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        displayName: user.displayName,
        avatarConfig: user.avatarConfig ? JSON.parse(user.avatarConfig) : null,
      },
      isNewUser,
    });
  } catch (error) {
    console.error("Phone login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Send OTP (mock for dev, real service for prod)
router.post("/send-otp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\+?[0-9]{10,15}$/.test(phone)) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }

    // Generate 6-digit OTP
    const code = process.env.OTP_SERVICE === "mock"
      ? "123456" // Fixed OTP for development
      : Math.floor(100000 + Math.random() * 900000).toString();

    // Expire old OTPs for this phone
    await OTP.update(
      { verified: true },
      { where: { phone, verified: false } }
    );

    // Create new OTP
    await OTP.create({
      phone,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // In production, send via MSG91/Twilio here
    if (process.env.OTP_SERVICE === "mock") {
      console.log(`[DEV] OTP for ${phone}: ${code}`);
    }

    res.json({ message: "OTP sent", dev: process.env.OTP_SERVICE === "mock" ? code : undefined });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// Verify OTP and login/register
router.post("/verify-otp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, code, displayName } = req.body;

    if (!phone || !code) {
      res.status(400).json({ error: "Phone and code are required" });
      return;
    }

    const otp = await OTP.findOne({
      where: {
        phone,
        code,
        verified: false,
        expiresAt: { [Op.gt]: new Date() },
      },
      order: [["createdAt", "DESC"]],
    });

    if (!otp) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }

    // Find or create user
    let user = await User.findOne({ where: { phone } });
    let isNewUser = false;

    if (!user) {
      if (!displayName) {
        // Don't consume OTP yet — user needs to come back with displayName
        res.json({ needsDisplayName: true, message: "New user, display name required" });
        return;
      }

      const trimmedName = String(displayName).trim();
      const nameTaken = await User.findOne({ where: sequelize.where(sequelize.fn("LOWER", sequelize.col("displayName")), trimmedName.toLowerCase()) });
      if (nameTaken) {
        res.status(409).json({ error: "This nickname is already taken. Choose another name." });
        return;
      }

      const avatarConfig = JSON.stringify(generateAvatarConfig(phone));
      user = await User.create({ phone, displayName: trimmedName, avatarConfig });
      isNewUser = true;
    }

    // OTP is valid and user is resolved — now mark it as consumed
    await otp.update({ verified: true });

    // Lazy backfill: if existing user has no avatar, generate one
    if (!user.avatarConfig) {
      const avatarConfig = JSON.stringify(generateAvatarConfig(user.id));
      await user.update({ avatarConfig });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, type: "user" },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        displayName: user.displayName,
        avatarConfig: user.avatarConfig ? JSON.parse(user.avatarConfig) : null,
      },
      isNewUser,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// Get current user
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "No token" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret") as { userId: string };
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Lazy backfill avatar
    if (!user.avatarConfig) {
      const avatarConfig = JSON.stringify(generateAvatarConfig(user.id));
      await user.update({ avatarConfig });
    }

    res.json({
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      avatarConfig: user.avatarConfig ? JSON.parse(user.avatarConfig) : null,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// Update avatar
router.put("/avatar", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { avatarConfig } = req.body;

    if (!avatarConfig) {
      res.status(400).json({ error: "avatarConfig is required" });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await user.update({ avatarConfig: JSON.stringify(avatarConfig) });
    res.json({ success: true });
  } catch (error) {
    console.error("Update avatar error:", error);
    res.status(500).json({ error: "Failed to update avatar" });
  }
});

// Get user stats (accuracy, matches played)
router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "No token" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret") as { userId: string };

    const participants = await MatchParticipant.findAll({
      where: { userId: decoded.userId },
    });

    const matchesPlayed = participants.length;
    const totalCorrect = participants.reduce((sum, p) => sum + (p.correctPredictions || 0), 0);
    const totalPredictions = participants.reduce((sum, p) => sum + (p.totalPredictions || 0), 0);
    const accuracy = totalPredictions > 0
      ? Math.round((totalCorrect / totalPredictions) * 100)
      : 0;

    const user = await User.findByPk(decoded.userId);

    res.json({
      matchesPlayed,
      totalCorrect,
      totalPredictions,
      accuracy,
      lifetimePoints: user?.lifetimePoints || 0,
      city: user?.city || null,
      state: user?.state || null,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// Update user location (one-time, reverse geocode from lat/lon)
router.put("/location", authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      res.status(400).json({ error: "Latitude and longitude required" });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Only set once — don't overwrite existing location
    if (user.city) {
      res.json({ city: user.city, state: user.state, message: "Location already set" });
      return;
    }

    const geoRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );

    if (!geoRes.ok) {
      res.status(502).json({ error: "Geocoding service unavailable" });
      return;
    }

    const geo: any = await geoRes.json();
    const city = geo.city || geo.locality || null;
    const state = geo.principalSubdivision || null;

    if (city || state) {
      await user.update({ city, state });
    }

    res.json({ city, state });
  } catch (error) {
    console.error("Location update error:", error);
    res.status(500).json({ error: "Failed to update location" });
  }
});

export default router;
