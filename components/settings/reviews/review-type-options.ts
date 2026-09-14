import type { ReviewType } from "@/domains/srs";

/** Spec 20 Reviews — Review Types. Shared labels for both the Grammar and Vocabulary selects. */
export const REVIEW_TYPE_OPTIONS: { value: ReviewType; label: string }[] = [
  { value: "cloze_manual", label: "Cloze (Manual)" },
  { value: "cloze_flashcard", label: "Cloze (Flashcard)" },
  { value: "flashcard", label: "Flashcard" },
];
