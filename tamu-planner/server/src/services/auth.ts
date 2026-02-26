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
};

/**
 * In dev mode without Firebase credentials, accepts any Bearer token as
 * a user identifier so the server can run fully offline.
 * Format: "Bearer <uid>" or "Bearer dev" (defaults to "dev-user").
 */
export async function verifyBearerToken(authorizationHeader?: string): Promise<AuthUser> {
  if (env.nodeEnv !== "production" && !hasFirebaseCredentials) {
    const raw = authorizationHeader?.startsWith("Bearer ")
      ? authorizationHeader.slice(7).trim()
      : "";
    const uid = raw || "dev-user";
    return { uid, email: `${uid}@dev.local`, name: "Dev User", picture: "" };
  }

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  ensureFirebaseApp();
  const token = authorizationHeader.slice("Bearer ".length).trim();
  const decoded = await getAuth().verifyIdToken(token);

  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    name: decoded.name ?? "",
    picture: decoded.picture ?? ""
  };
}
