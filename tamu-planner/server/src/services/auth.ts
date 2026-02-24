import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../config/env.js";

const formatPrivateKey = (key: string) => key.replace(/\\n/g, "\n");

export function ensureFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const {
    firebaseProjectId,
    firebaseClientEmail,
    firebasePrivateKey
  } = env;

  const useServiceAccount =
    Boolean(firebaseProjectId) &&
    Boolean(firebaseClientEmail) &&
    Boolean(firebasePrivateKey);

  if (useServiceAccount) {
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

export async function verifyBearerToken(authorizationHeader?: string): Promise<AuthUser> {
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
