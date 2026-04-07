import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export function notFound(req: Request, res: Response): void {
  const isProduction = env.nodeEnv === "production";
  res.status(404).json(
    isProduction
      ? { error: "Not found" }
      : { error: "Not found", path: req.path }
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[error] ${_req.method} ${_req.path}:`, err);
  const isProduction = env.nodeEnv === "production";
  res.status(500).json({
    error: isProduction ? "Internal server error" : message
  });
}
