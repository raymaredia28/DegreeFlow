import type { NextFunction, Request, Response } from "express";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "Not found", path: req.path });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ error: message });
}
