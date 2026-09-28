"use client";

import { useState } from "react";

/**
 * The local "picked but not yet applied" value behind each Appearance
 * selector (2026-09-28 user request: Appearance's live-apply-on-click
 * behavior was exactly what the user meant by "changes are applied as soon
 * as I click it" — the pending pick no longer reaches `updateSettings`, and
 * therefore the document/localStorage, until `markSaved` runs). `committed`
 * is `useAppearance()`'s own `settings.<field>` — read once at mount, same
 * as `LearningQueuePicker`'s pre-existing `initialMode`/`initialThemeId`
 * convention, since the only writer of that field is this same component's
 * own Save button.
 */
export function useAppearanceDraft<T>(committed: T) {
  const [draft, setDraftValue] = useState<T>(committed);
  const [justSaved, setJustSaved] = useState(false);
  const isDirty = draft !== committed;

  function setDraft(value: T) {
    setDraftValue(value);
    setJustSaved(false);
  }

  function markSaved() {
    setJustSaved(true);
  }

  function reset() {
    setDraftValue(committed);
    setJustSaved(false);
  }

  return { draft, isDirty, justSaved, setDraft, markSaved, reset };
}
