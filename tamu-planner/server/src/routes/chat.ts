import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";

export const chatRouter = Router();
const isProduction = env.nodeEnv === "production";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema),
  model: z.string().optional(),
  stream: z.boolean().optional(),
});

chatRouter.post("/chat/completions", async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      issues: parsed.error.issues
    });
  }

  const { messages, model = "protected.gemini-2.0-flash-lite", stream = false } = parsed.data;

  // Accept an optional user-supplied key via X-Api-Key header; fall back to env key.
  // Never log this value.
  const clientKey = (req.headers["x-api-key"] as string | undefined)?.trim();
  const apiKey = (clientKey && clientKey.length >= 10) ? clientKey : env.tamuAiApiKey;

  if (!apiKey) {
    return res.status(500).json({
      error: "TAMU AI API key not configured"
    });
  }

  try {
    const response = await fetch(`${env.tamuAiApiEndpoint}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[chat] TAMU AI API error:", response.status, errorText);
      return res.status(response.status).json({
        error: "TAMU AI API request failed",
        ...(isProduction ? {} : { details: errorText })
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat] Error calling TAMU AI API:", message);
    return res.status(500).json({
      error: "Failed to communicate with TAMU AI API",
      ...(isProduction ? {} : { details: message })
    });
  }
});

chatRouter.get("/chat/models", async (req, res) => {
  const clientKey = (req.headers["x-api-key"] as string | undefined)?.trim();
  const apiKey = (clientKey && clientKey.length >= 10) ? clientKey : env.tamuAiApiKey;

  if (!apiKey) {
    return res.status(500).json({
      error: "TAMU AI API key not configured"
    });
  }

  try {
    const response = await fetch(`${env.tamuAiApiEndpoint}/api/v1/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[chat] TAMU AI models API error:", response.status, errorText);
      return res.status(response.status).json({
        error: "Failed to fetch models",
        ...(isProduction ? {} : { details: errorText })
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat] Error fetching models:", message);
    return res.status(500).json({
      error: "Failed to fetch models from TAMU AI API",
      ...(isProduction ? {} : { details: message })
    });
  }
});
