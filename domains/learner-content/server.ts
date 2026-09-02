/**
 * Server-only entry point for `domains/learner-content`. `./service.ts`
 * transitively imports `db/client.ts` — import from here only in
 * server-only files, never a `"use client"` component.
 */
export { createNote, createSynonym, getNote, getSynonyms } from "./service";
