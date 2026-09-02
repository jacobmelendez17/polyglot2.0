/** Learner-owned content types (spec 08 §72) — private by default, never returned for any user other than the owner. */
export type SynonymSide = "term" | "meaning";

export interface LearnerNote {
  id: string;
  userId: string;
  learningItemId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LearnerSynonym {
  id: string;
  userId: string;
  learningItemId: string;
  side: SynonymSide;
  value: string;
  normalizedValue: string;
}
