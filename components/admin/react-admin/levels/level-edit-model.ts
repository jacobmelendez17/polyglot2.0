import {
  ADMIN_CEFR_LEVELS,
  CURRICULUM_STATUSES,
  type AdminLevelUpdateRequest,
} from "@/domains/admin";

/**
 * The level edit form's logic, apart from React so each rule can be stated and
 * tested on its own (spec 26 Unit 4).
 */

export type CefrBand = (typeof ADMIN_CEFR_LEVELS)[number];
export type LevelStatus = (typeof CURRICULUM_STATUSES)[number];

/** A level's editable metadata, as the server holds it. `null` is "none". */
export type LevelFields = {
  name: string | null;
  cefrLevel: CefrBand | null;
  status: LevelStatus;
};

/** What the form's inputs hold: strings (a blank one is "none") and whatever the select last chose. */
export type LevelFormValues = {
  name?: string | null;
  cefrLevel?: string | null;
  status?: string | null;
};

/** What each select offers, with the labels people read. */
export const STATUS_CHOICES = CURRICULUM_STATUSES.map((status) => ({
  id: status,
  name: status.charAt(0).toUpperCase() + status.slice(1),
}));
/**
 * "No band": a level need not have one, and item pages then simply omit it.
 *
 * The select's *empty option*, not one of its choices, so React Admin renders it
 * (and its built-in "Clear value" semantics) once. Its value is a word and not
 * `""` on purpose: Material UI shows nothing at all in a closed select whose
 * value is the empty string, which would leave a level with no band looking
 * like a broken field instead of reading "Not set".
 */
export const CEFR_NONE = "none";
export const CEFR_NONE_TEXT = "Not set";
export const CEFR_CHOICES = ADMIN_CEFR_LEVELS.map((band) => ({
  id: band,
  name: band,
}));

/**
 * Reads the form's values as level fields. A name that is blank or only
 * spaces is "no name" (as the form this replaces treated it); a band or status
 * that is not one of the known values keeps what the level had, rather than
 * guessing.
 */
export function readLevelFields(
  values: LevelFormValues,
  current: LevelFields,
): LevelFields {
  const name = values.name?.trim() ?? "";
  const cefrLevel = values.cefrLevel ?? CEFR_NONE;
  return {
    name: name === "" ? null : name,
    cefrLevel:
      cefrLevel === CEFR_NONE || cefrLevel === ""
        ? null
        : (ADMIN_CEFR_LEVELS.find((band) => band === cefrLevel) ??
          current.cefrLevel),
    status:
      CURRICULUM_STATUSES.find((status) => status === values.status) ??
      current.status,
  };
}

/**
 * Only the fields that differ from what the server holds. Sending just these
 * is how the screen narrows last-write-wins: a level has no version to check,
 * so an edit to the name must not also re-send (and so overwrite) a status
 * another Admin changed in the meantime.
 *
 * Key order is fixed, so equal changes are equal strings (see `useIntentKey`).
 */
export function changedFields(
  baseline: LevelFields,
  next: LevelFields,
): Omit<AdminLevelUpdateRequest, "idempotencyKey"> {
  const changes: Omit<AdminLevelUpdateRequest, "idempotencyKey"> = {};
  if (next.name !== baseline.name) changes.name = next.name;
  if (next.cefrLevel !== baseline.cefrLevel) changes.cefrLevel = next.cefrLevel;
  if (next.status !== baseline.status) changes.status = next.status;
  return changes;
}

export type StatusImpact = {
  title: string;
  /** What happens to learners — stated only as far as the code guarantees it. */
  body: string;
  confirmLabel: string;
};

/**
 * Whether a change of status needs an explicit confirmation, and what to tell
 * the person. A level's `published` status gates what learners can reach — the
 * level page, lessons, official decks, and an item's own page all require it —
 * so *going live* and *going dark* both change what learners see. Every other
 * move (draft ↔ pending ↔ archived) is invisible to them.
 *
 * Spec 26 §5: "A UI save must **not** implicitly publish." A save that carries
 * this change is therefore a decision, not a side effect of pressing Save.
 */
export function statusImpact(
  levelNumber: number,
  from: LevelStatus,
  to: LevelStatus,
): StatusImpact | null {
  if (from === to) return null;
  if (to === "published") {
    return {
      title: `Publish Level ${levelNumber}?`,
      body: "Learners will be able to use this level and the published items in it — in lessons, on the level page, in decks, and on item pages. Items still waiting for review stay hidden until they are published.",
      confirmLabel: "Publish level",
    };
  }
  if (from === "published") {
    return {
      title: `Hide Level ${levelNumber} from learners?`,
      body: "Learners will no longer be offered anything in this level — not in lessons, on the level page, in decks, or on item pages. Their progress is kept.",
      confirmLabel: "Hide level",
    };
  }
  return null;
}

/** What a level holds, in the sentence the edit form has always shown. Information, never a gate. */
export function describeLevelContents(counts: {
  vocabularyItems: number;
  grammarItems: number;
  vocabularyGroups: number;
}): string {
  const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;
  return (
    `Contains ${plural(counts.vocabularyItems, "vocabulary item")} across ` +
    `${plural(counts.vocabularyGroups, "group")}, and ` +
    `${plural(counts.grammarItems, "grammar item")}. A level can hold any ` +
    `number of either — publishing it is your call.`
  );
}
