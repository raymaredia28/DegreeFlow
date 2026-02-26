import dotenv from "dotenv";

dotenv.config();

const normalizeBaseUrl = (input: string, fallback: string) => {
  const value = input.trim() || fallback;
  return value.replace(/\/+$/, "");
};

const parseOrigins = (input: string, fallback: string) => {
  const raw = input.trim() || fallback;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const required = ["PORT", "CLIENT_ORIGIN"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  clientOrigins: parseOrigins(
    process.env.CLIENT_ORIGIN ?? "",
    "http://localhost:5173"
  ),
  databaseUrl: process.env.DATABASE_URL ?? "",
  localDbPath: process.env.LOCAL_DB_PATH ?? "./data/local-db.json",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  tamuAiApiKey: process.env.TAMU_AI_CHAT_API_KEY ?? "",
  tamuAiApiEndpoint: normalizeBaseUrl(
    process.env.TAMU_AI_CHAT_API_ENDPOINT ?? "",
    "https://chat-api.tamu.ai"
  ),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY ?? ""
};
