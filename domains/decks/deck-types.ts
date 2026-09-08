import type { ReviewQuestionDirection } from "@/domains/srs";
import type { SrsStage } from "@/domains/srs";

/**
 * Deck domain types (spec 14). Deck study is entirely separate from
 * official curriculum progression: nothing in this file carries an SRS
 * mutation, a next-review time, or an unlock. `srsStage` appears on a deck
 * row only because spec 14 asks the detail list to *display* it — it is
 * owned by `domains/progress` and read, never written, from here.
 */

export type DeckKind = "polyglot" | "personal";

export type DeckAvailability = "level" | "theme";

/** What a deck contains, derived from its configured items — never stored. */
export type DeckContentType = "vocabulary" | "grammar" | "both";

/** The `/decks` type filter (spec 14). "all" is the unfiltered default. */
export type DeckContentFilter = DeckContentType | "all";

export type DeckItemType = "vocabulary" | "grammar";

/** One deck as shown on the `/decks` card grid. */
export type DeckSummary = {
  id: string;
  kind: DeckKind;
  name: string;
  description: string | null;
  /**
   * Derived from every configured item, so it stays stable as a theme deck
   * gradually reveals more of itself. `null` only for the degenerate case of
   * a deck whose items have all been archived out of the curriculum.
   */
  contentType: DeckContentType | null;
  /** Items this learner can actually practice right now — not the configured total. */
  itemCount: number;
};

/** One row of the deck detail item list. */
export type DeckItemRow = {
  learningItemId: string;
  itemType: DeckItemType;
  /** Target-language term (with article where applicable) or the grammar structure. */
  primary: string;
  /** English meaning / short description. */
  secondary: string;
  /** `null` when the learner has no SRS progress for this item — a real state, not an error. */
  srsStage: SrsStage | null;
};

export type DeckDetail = {
  id: string;
  kind: DeckKind;
  name: string;
  description: string | null;
  contentType: DeckContentType | null;
  /** True only for a personal deck owned by the requesting learner (spec 14: Polyglot decks are read-only to learners). */
  canManage: boolean;
  /** Already filtered to what this learner may see, in explicit deck order. */
  items: DeckItemRow[];
};

/**
 * One row of an "add items" picker. Serves both pickers so a single
 * component can render either: for a learner it lists what they have already
 * learned and `srsStage` is always present; for an admin authoring an
 * official deck it lists published curriculum and `srsStage` is `null`,
 * because an official deck is not authored against anyone's progress.
 */
export type DeckPickerItem = {
  learningItemId: string;
  itemType: DeckItemType;
  primary: string;
  secondary: string;
  levelNumber: number;
  srsStage: SrsStage | null;
};

/**
 * One practice prompt handed to the browser. Deliberately carries no
 * accepted answers — grading happens server-side, exactly as it does for
 * reviews.
 */
export type DeckPracticeQuestion = {
  questionId: string;
  learningItemId: string;
  itemType: DeckItemType;
  direction: ReviewQuestionDirection;
  prompt: string;
  directionLabel: string;
  /** Shown in the Know / Don't Know summary, where the prompt alone is not enough to identify the item. */
  itemLabel: string;
};

/** The server's verdict on one submitted practice answer. Mirrors the review flow's feedback shape. */
export type DeckPracticeFeedback =
  | { kind: "correct" }
  | {
      kind: "incorrect";
      reason: "missing_article" | "no_match";
      article?: string;
      userAnswer: string;
      expectedAnswer: string;
    };

/** Session-only self-classification (spec 14). Never persisted. */
export type DeckPracticeVerdict = "know" | "dont_know";
