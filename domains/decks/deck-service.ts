import { db } from "@/db/client";
import { DeckError } from "@/lib/errors/deck-errors";
import { getRateLimiter } from "@/providers/rate-limit";
import type { RateLimitPolicyName } from "@/providers/rate-limit";

import * as adminMutations from "./deck-admin-mutations";
import * as mutations from "./deck-mutations";
import * as practice from "./deck-practice-session";
import * as repository from "./deck-repository";
import { DECK_ITEM_PICKER_LIMIT } from "./deck-schemas";
import type { DeckDetail, DeckPickerItem, DeckSummary } from "./deck-types";

/**
 * Binds the real app database and rate limiter to this domain's injectable
 * orchestration functions — the same pattern as
 * `domains/srs/review-service.ts` and `domains/admin/admin-mutation-service.ts`.
 * Not guarded with `import "server-only"` directly: importing `db` and the
 * rate-limit provider already carries that guard transitively.
 *
 * Authentication and role checks belong to the caller (a Server Action
 * resolving `requireUser()` / `canManageCurriculum`); ownership and
 * eligibility belong to the mutation modules. This file adds only the one
 * thing that cannot live in a `DbClient`-injectable module: rate limiting.
 */

async function checkRateLimit(policy: RateLimitPolicyName, userId: string): Promise<void> {
  const decision = await getRateLimiter().check({ policy, subject: userId });
  if (!decision.allowed) {
    throw new DeckError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
}

/* Reads */

export async function listDecks(input: { userId: string; languageId: string }): Promise<DeckSummary[]> {
  return repository.listDecksForLearner(db, input);
}

export async function getDeck(input: { userId: string; languageId: string; deckId: string }): Promise<DeckDetail | null> {
  return repository.getDeckForLearner(db, input);
}

export async function listEligibleDeckItems(input: {
  userId: string;
  languageId: string;
  search?: string;
}): Promise<DeckPickerItem[]> {
  return repository.getEligibleDeckItems(db, { ...input, limit: DECK_ITEM_PICKER_LIMIT });
}

/* Personal deck mutations */

export async function createPersonalDeck(input: mutations.CreatePersonalDeckInput) {
  await checkRateLimit("deck-mutation", input.userId);
  return mutations.createPersonalDeck(db, input);
}

export async function updatePersonalDeckDetails(input: mutations.UpdatePersonalDeckDetailsInput) {
  await checkRateLimit("deck-mutation", input.userId);
  return mutations.updatePersonalDeckDetails(db, input);
}

export async function addPersonalDeckItems(input: mutations.AddPersonalDeckItemsInput) {
  await checkRateLimit("deck-mutation", input.userId);
  return mutations.addPersonalDeckItems(db, input);
}

export async function removePersonalDeckItem(input: mutations.RemovePersonalDeckItemInput) {
  await checkRateLimit("deck-mutation", input.userId);
  return mutations.removePersonalDeckItem(db, input);
}

export async function reorderPersonalDeckItems(input: mutations.ReorderPersonalDeckItemsInput) {
  await checkRateLimit("deck-mutation", input.userId);
  return mutations.reorderPersonalDeckItems(db, input);
}

export async function deletePersonalDeck(input: mutations.DeletePersonalDeckInput) {
  await checkRateLimit("deck-mutation", input.userId);
  return mutations.deletePersonalDeck(db, input);
}

/* Practice — reads and pure calculation only; nothing here writes. */

export async function startDeckPractice(input: practice.StartDeckPracticeInput) {
  return practice.startDeckPractice(db, input);
}

export async function gradeDeckPracticeAnswer(input: practice.GradeDeckPracticeAnswerInput) {
  await checkRateLimit("deck-practice-answer", input.userId);
  return practice.gradeDeckPracticeAnswer(db, input);
}

/* Admin — Polyglot decks */

export async function listPolyglotDecks(languageId: string) {
  return repository.listPolyglotDecksForAdmin(db, languageId);
}

export async function getPolyglotDeck(deckId: string) {
  return repository.getDeckRecord(db, deckId);
}

export async function getPolyglotDeckItems(deckId: string) {
  return repository.getDeckItemsForAdmin(db, deckId);
}

export async function listPublishedItemsForAdmin(input: { languageId: string; search?: string }) {
  return repository.getPublishedItemsForAdmin(db, { ...input, limit: DECK_ITEM_PICKER_LIMIT });
}

export async function createPolyglotDeck(input: adminMutations.CreatePolyglotDeckInput) {
  await checkRateLimit("deck-mutation", input.actorUserId);
  return adminMutations.createPolyglotDeck(db, input);
}

export async function updatePolyglotDeck(input: adminMutations.UpdatePolyglotDeckInput) {
  await checkRateLimit("deck-mutation", input.actorUserId);
  return adminMutations.updatePolyglotDeck(db, input);
}

export async function addPolyglotDeckItems(input: adminMutations.AddPolyglotDeckItemsInput) {
  await checkRateLimit("deck-mutation", input.actorUserId);
  return adminMutations.addPolyglotDeckItems(db, input);
}

export async function removePolyglotDeckItem(input: adminMutations.RemovePolyglotDeckItemInput) {
  await checkRateLimit("deck-mutation", input.actorUserId);
  return adminMutations.removePolyglotDeckItem(db, input);
}

export async function reorderPolyglotDeckItems(input: adminMutations.ReorderPolyglotDeckItemsInput) {
  await checkRateLimit("deck-mutation", input.actorUserId);
  return adminMutations.reorderPolyglotDeckItems(db, input);
}

export async function deletePolyglotDeck(input: adminMutations.DeletePolyglotDeckInput) {
  await checkRateLimit("deck-mutation", input.actorUserId);
  return adminMutations.deletePolyglotDeck(db, input);
}
