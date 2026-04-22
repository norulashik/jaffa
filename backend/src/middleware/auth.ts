import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets";

export interface AuthRequest extends Request {
  userId?: string;
  venueId?: string;
  ownerId?: string;
}

export function authenticateUser(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      type: string;
    };

    if (decoded.type !== "user") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function authenticateVenue(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      venueId: string;
      type: string;
    };

    if (decoded.type !== "venue") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    req.venueId = decoded.venueId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function authenticateOwner(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      ownerId: string;
      type: string;
    };

    if (decoded.type !== "owner") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    req.ownerId = decoded.ownerId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
