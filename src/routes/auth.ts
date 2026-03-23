import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User, OTP } from "../models";
import { Op } from "sequelize";
import { generateAvatarConfig } from "../utils/avatarGenerator";

const router = Router();

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
        // Don't consume the OTP yet — user needs to come back with displayName
        res.json({ needsDisplayName: true, message: "New user, display name required" });
        return;
      }

      const avatarConfig = JSON.stringify(generateAvatarConfig(phone));
      user = await User.create({ phone, displayName, avatarConfig });
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

export default router;
