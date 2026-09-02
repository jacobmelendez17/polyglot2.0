/**
 * Client-safe public surface for `domains/progress`: types only. Every
 * actual function reads the database and lives in `./server.ts` instead —
 * see that file for why. No component consumes this domain yet.
 */
export type { ItemProgress, LevelProgress } from "./types";
