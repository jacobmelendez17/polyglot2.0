import { db } from "@/db/client";

import * as repository from "./repository";
import type { SynonymSide } from "./types";

/**
 * Binds the real app database to the injectable repository (spec 08 §72).
 * Not guarded with `import "server-only"` directly — importing `db` from
 * `db/client.ts` already carries that guard transitively.
 */
export async function getNote(userId: string, learningItemId: string) {
  return repository.getNote(db, userId, learningItemId);
}

export async function createNote(input: { userId: string; learningItemId: string; body: string }) {
  return repository.createNote(db, input);
}

export async function getSynonyms(userId: string, learningItemId: string) {
  return repository.getSynonyms(db, userId, learningItemId);
}

export async function createSynonym(input: {
  userId: string;
  learningItemId: string;
  side: SynonymSide;
  value: string;
}) {
  return repository.createSynonym(db, input);
}
