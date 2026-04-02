import type { NextFunction, Request, Response } from "express";
import { verifyBearerToken, type AuthUser } from "../services/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    req.user = await verifyBearerToken(req.headers.authorization);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }
  next();
}
