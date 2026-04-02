import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../config/env.js";

const formatPrivateKey = (key: string) => key.replace(/\\n/g, "\n");

const hasFirebaseCredentials =
  Boolean(env.firebaseProjectId) &&
  Boolean(env.firebaseClientEmail) &&
  Boolean(env.firebasePrivateKey);

export function ensureFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const {
    firebaseProjectId,
    firebaseClientEmail,
    firebasePrivateKey
  } = env;

  if (hasFirebaseCredentials) {
    return initializeApp({
      credential: cert({
        projectId: firebaseProjectId,
        clientEmail: firebaseClientEmail,
        privateKey: formatPrivateKey(firebasePrivateKey)
      })
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: firebaseProjectId || undefined
  });
}

export type AuthUser = {
  uid: string;
  email: string;
  name: string;
  picture: string;
  isAdmin: boolean;
};

export function isAdminEmail(email: string): boolean {
  if (!email) return false;
  return env.adminEmails.includes(email.toLowerCase());
}

/**
 * Try to extract claims from a JWT without verification (dev mode only).
 * Returns the decoded payload or null if the token isn't a valid JWT.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * In dev mode without Firebase credentials, accepts any Bearer token as
 * a user identifier so the server can run fully offline.
 * If the token is a Firebase JWT, extracts the stable uid from its payload.
 * Otherwise falls back to "Bearer <uid>" or "dev-user".
 */
export async function verifyBearerToken(authorizationHeader?: string): Promise<AuthUser> {
  if (env.nodeEnv !== "production" && !hasFirebaseCredentials) {
    const raw = authorizationHeader?.startsWith("Bearer ")
      ? authorizationHeader.slice(7).trim()
      : "";
    const claims = decodeJwtPayload(raw);
    const uid = (claims?.user_id as string) || (claims?.sub as string) || raw || "dev-user";
    const email = (claims?.email as string) || `${uid}@dev.local`;
    const name = (claims?.name as string) || "Dev User";
    const admin = env.adminEmails.length === 0 ? true : isAdminEmail(email);
    return { uid, email, name, picture: (claims?.picture as string) || "", isAdmin: admin };
  }

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  ensureFirebaseApp();
  const token = authorizationHeader.slice("Bearer ".length).trim();
  const decoded = await getAuth().verifyIdToken(token);

  const email = decoded.email ?? "";
  return {
    uid: decoded.uid,
    email,
    name: decoded.name ?? "",
    picture: decoded.picture ?? "",
    isAdmin: isAdminEmail(email),
  };
}
