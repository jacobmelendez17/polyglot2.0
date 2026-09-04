/**
 * Server-only entry point for the real, database-backed half of
 * `domains/curriculum` (spec 08 §30). `./curriculum-db-service.ts`
 * transitively imports `db/client.ts`. Import from here only in
 * server-only files — never from a `"use client"` component. See
 * `index.ts`'s docstring and `domains/lessons/server.ts` for why this split
 * exists; `components/lessons/lesson-session-view.tsx` already
 * value-imports `FIXTURE_LANGUAGE_ID` from `index.ts`, so that barrel must
 * stay free of anything that reaches the database client.
 */
export {
  getLanguageByCode,
  getLanguageById,
  getLearningItem,
  getLearningItemsByIds,
  getLevelById,
  getLevelByLanguageAndNumber,
  getLevelItems,
  getLevelsByLanguage,
  getVocabularyGroup,
} from "./curriculum-db-service";
