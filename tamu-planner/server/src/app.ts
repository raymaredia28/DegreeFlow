import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(env.clientOrigins);

  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "12mb" }));

  app.use(apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
