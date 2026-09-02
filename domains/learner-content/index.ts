/**
 * Client-safe public surface for `domains/learner-content`: types only.
 * Every actual function reads/writes the database and lives in
 * `./server.ts` instead — see that file for why. No editing UI exists yet
 * (spec 08 §72's explicit scope boundary).
 */
export type { LearnerNote, LearnerSynonym, SynonymSide } from "./types";
