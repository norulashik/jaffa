import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Venue } from "../models";
import { JWT_SECRET } from "../config/secrets";

const router = Router();

// Generate URL-friendly slug from venue name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80);
}

// Register venue
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, ownerPhone, ownerName, password, latitude, longitude, radiusMeters, rewardConfig } = req.body;

    if (!name || !ownerPhone || !ownerName || !password || !latitude || !longitude) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const existing = await Venue.findOne({ where: { ownerPhone } });
    if (existing) {
      res.status(400).json({ error: "Venue already registered with this phone" });
      return;
    }

    // Generate unique slug
    let slug = generateSlug(name);
    const slugExists = await Venue.findOne({ where: { slug } });
    if (slugExists) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const venue = await Venue.create({
      name,
      slug,
      ownerPhone,
      ownerName,
      password: hashedPassword,
      latitude,
      longitude,
      radiusMeters: radiusMeters || 200,
      rewardConfig: rewardConfig || undefined,
    });

    res.status(201).json({
      message: "Registration submitted. Your venue will be reviewed and approved shortly.",
      venue: {
        id: venue.id,
        name: venue.name,
        slug: venue.slug,
        approvalStatus: "pending",
      },
    });
  } catch (error) {
    console.error("Venue register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login venue
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { ownerPhone, password } = req.body;

    const venue = await Venue.findOne({ where: { ownerPhone } });
    if (!venue) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, venue.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (venue.approvalStatus !== "approved") {
      res.status(403).json({
        error: venue.approvalStatus === "pending"
          ? "Your venue registration is pending approval"
          : "Your venue registration was rejected",
      });
      return;
    }

    if (!venue.isActive) {
      res.status(403).json({ error: "Your venue has been deactivated" });
      return;
    }

    const token = jwt.sign(
      { venueId: venue.id, type: "venue" },
      JWT_SECRET,
      { expiresIn: "90d" }
    );

    res.json({
      token,
      venue: {
        id: venue.id,
        name: venue.name,
        slug: venue.slug,
        ownerName: venue.ownerName,
        rewardConfig: venue.rewardConfig,
      },
    });
  } catch (error) {
    console.error("Venue login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Update reward config
router.put("/rewards", async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "No token" }); return; }

    const decoded = jwt.verify(token, JWT_SECRET) as { venueId: string; type: string };
    if (decoded.type !== "venue") { res.status(401).json({ error: "Not a venue" }); return; }

    const venue = await Venue.findByPk(decoded.venueId);
    if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

    const { rewardConfig } = req.body;
    await venue.update({ rewardConfig });

    res.json({ message: "Rewards updated", rewardConfig: venue.rewardConfig });
  } catch (error) {
    console.error("Update rewards error:", error);
    res.status(500).json({ error: "Failed to update rewards" });
  }
});

// Get venue by slug (public)
router.get("/by-slug/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = req.params.slug as string;
    const venue = await Venue.findOne({ where: { slug } });
    if (!venue || !venue.isActive || venue.approvalStatus !== "approved") {
      res.status(404).json({ error: "Venue not found" });
      return;
    }

    res.json({
      id: venue.id,
      name: venue.name,
      slug: venue.slug,
      logoUrl: venue.logoUrl,
      rewardConfig: venue.rewardConfig,
    });
  } catch (error) {
    console.error("Get venue by slug error:", error);
    res.status(500).json({ error: "Failed to get venue" });
  }
});

// Get venue info (public)
router.get("/:venueId", async (req: Request, res: Response): Promise<void> => {
  try {
    const venueId = req.params.venueId as string;
    const venue = await Venue.findByPk(venueId);
    if (!venue || !venue.isActive) {
      res.status(404).json({ error: "Venue not found" });
      return;
    }

    res.json({
      id: venue.id,
      name: venue.name,
      rewardConfig: venue.rewardConfig,
      latitude: venue.latitude,
      longitude: venue.longitude,
      radiusMeters: venue.radiusMeters,
    });
  } catch (error) {
    console.error("Get venue error:", error);
    res.status(500).json({ error: "Failed to get venue" });
  }
});

export default router;
