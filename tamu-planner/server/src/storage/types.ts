export type Student = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type PlannerState = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  payload: unknown;
};

export type TranscriptCourse = {
  code: string;
  title: string;
  credits: number;
  grade: string;
  transfer?: boolean;
  categories?: string[];
};

export type TranscriptTerm = {
  label: string;
  status: string;
  courses: TranscriptCourse[];
};

export interface StorageProvider {
  getOrCreateStudent(input: {
    uid: string;
    email?: string;
    name?: string;
  }): Promise<Student>;
  saveTranscriptTerms(studentId: string, terms: TranscriptTerm[]): Promise<void>;
  getTranscriptForStudent(studentId: string): Promise<TranscriptTerm[]>;
  savePlannerState(studentId: string, payload: unknown): Promise<PlannerState>;
  getPlannerState(studentId: string): Promise<PlannerState | null>;
}
