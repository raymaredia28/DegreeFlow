import { env } from "../config/env.js";
import * as firestoreStorage from "./firestoreDb.js";
import * as localStorage from "./localDb.js";

const useLocal = env.nodeEnv !== "production";

console.log(
  `[storage] Using ${useLocal ? "local JSON file" : "Firestore"} storage (${env.nodeEnv})`
);

const provider = useLocal ? localStorage : firestoreStorage;

export const getOrCreateStudent = provider.getOrCreateStudent;
export const saveTranscriptTerms = provider.saveTranscriptTerms;
export const getTranscriptForStudent = provider.getTranscriptForStudent;
export const savePlannerState = provider.savePlannerState;
export const getPlannerState = provider.getPlannerState;

export type {
  Student,
  PlannerState,
  TranscriptCourse,
  TranscriptTerm,
  StorageProvider,
} from "./types.js";
