import type { CurriculumLearningItem } from "@/domains/curriculum";

import type { HintMode, HintOrder } from "./review-preference";

/**
 * What the client may reveal as an optional aid before answering (spec 20
 * Review Hints), gated by Hint Mode so a mode that shouldn't allow a given
 * piece of content structurally cannot carry it — there is no field to leak.
 * Never carries the item's actual required answer (`term`/`structure`) —
 * only its English meaning and its separate nuance/context note, neither of
 * which is graded.
 *
 * `translation` is the item's plain English meaning, regardless of the
 * question's own direction — for an `englishToTarget` question this is
 * already the prompt (showing it as a "hint" is a no-op there), but for
 * `targetToEnglish` it is genuinely the answer being asked for. Modes that
 * expose it (`show`/`more`) are a deliberate, learner-chosen leniency, the
 * same way choosing Flashcard for a review type is a learner opting into
 * self-graded review rather than server-checked typing.
 */
export type ReviewHintView =
  | { mode: "hide" }
  | { mode: "hint"; nuance: string | null }
  | { mode: "show"; translation: string }
  | {
      mode: "more";
      order: HintOrder;
      translation: string;
      nuance: string | null;
    }
  | { mode: "always_show_nuance"; nuance: string | null };

/**
 * The item's supplementary "nuance/context" note (spec 20 Review Hints).
 * Vocabulary has a dedicated `context` field for exactly this; grammar has
 * no equivalent, so `creatorNotes` is its only source — both are real,
 * admin-authored fields already surfaced to learners elsewhere (Lessons'
 * item detail tabs), not invented for this feature.
 */
function resolveNuance(item: CurriculumLearningItem): string | null {
  if (item.type === "vocabulary") {
    return item.vocabulary.context ?? item.vocabulary.creatorNotes;
  }
  return item.grammar.creatorNotes;
}

function resolveTranslation(item: CurriculumLearningItem): string {
  return item.type === "vocabulary"
    ? item.vocabulary.primaryMeaning
    : item.grammar.primaryMeaning;
}

/** Resolves one question's available hint content from its item and the learner's Hint Mode/Order for that content type (spec 20 Review Hints). */
export function resolveReviewHint(input: {
  hintMode: HintMode;
  hintOrder: HintOrder;
  item: CurriculumLearningItem;
}): ReviewHintView {
  const { hintMode, hintOrder, item } = input;

  switch (hintMode) {
    case "hide":
      return { mode: "hide" };
    case "hint":
      return { mode: "hint", nuance: resolveNuance(item) };
    case "show":
      return { mode: "show", translation: resolveTranslation(item) };
    case "more":
      return {
        mode: "more",
        order: hintOrder,
        translation: resolveTranslation(item),
        nuance: resolveNuance(item),
      };
    case "always_show_nuance":
      return { mode: "always_show_nuance", nuance: resolveNuance(item) };
  }
}
