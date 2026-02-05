import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { healthRouter } from "./routes/health.js";
import { studentsRouter } from "./routes/students.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.use(healthRouter);
  app.use(studentsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
