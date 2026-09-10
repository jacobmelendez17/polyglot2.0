import type { GrammaticalGender } from "@/domains/lexicon";
import type { CefrLevel, Register } from "@/db/schema";

/**
 * The one presentation model behind spec 18's item layout.
 *
 * Spec 18 requires `/items/[itemId]` and the information view shown while
 * learning an item in a lesson to be the *same* presentation, differing only
 * in configuration. Those two surfaces read completely different data —
 * the item page composes `domains/lexicon`'s `getVocabularyDetail` plus the
 * curriculum read model, while a lesson receives `domains/lessons`'
 * `LearningItem` — so without a shared view model in between, "the same
 * layout" would mean two component trees that drift apart on the first
 * change.
 *
 * Everything here is pure and database-free: this module must stay safe for
 * a `"use client"` component to value-import, the same rule
 * `level-view.ts` follows. Each caller builds an {@link ItemDetailSource}
 * from whatever it already has, and {@link buildItemDetailView} decides
 * every label, fallback, and grouping exactly once.
 */

export type ItemDetailType = "vocabulary" | "grammar";

/** Which sections the shell renders. Spec 18: lessons show Info/Examples/Resources and never Progress. */
export type ItemDetailMode = "page" | "lesson";

export type ItemDetailSectionId = "info" | "examples" | "progress" | "resources";

export const ITEM_DETAIL_SECTION_LABELS: Record<ItemDetailSectionId, string> = {
  info: "Info",
  examples: "Examples",
  progress: "Progress",
  resources: "Resources",
};

/**
 * Spec 18's section tabs, in order. Progress is dropped in lesson mode
 * because the learner has no progress on an item they are being taught for
 * the first time — and because a lesson must not present SRS state that
 * enrollment has not created yet.
 */
export function itemDetailSections(mode: ItemDetailMode): ItemDetailSectionId[] {
  return mode === "lesson" ? ["info", "examples", "resources"] : ["info", "examples", "progress", "resources"];
}

/** Register values, as a learner reads them. `null` register renders as an em dash — see `registerEnum`. */
export const REGISTER_LABELS: Record<Register, string> = {
  neutral: "Neutral",
  formal: "Formal",
  informal: "Informal",
  colloquial: "Colloquial",
  slang: "Slang",
  vulgar: "Vulgar",
  literary: "Literary",
};

export const GENDER_LABELS: Record<GrammaticalGender, string> = {
  masculine: "Masculine",
  feminine: "Feminine",
};

/** What a summary field shows when the value is genuinely absent rather than not applicable. */
export const EMPTY_FIELD = "—";

/** What Gender shows for a word that has no grammatical gender at all (spec 18: "If vocabulary has no grammatical gender, display `N/A`"). */
export const NOT_APPLICABLE_FIELD = "N/A";

// --- Source shapes each caller builds ---

export type ItemDetailSenseSource = { id: string; gloss: string; tags: string[] };

export type ItemDetailPatternSource = { id: string; label: string; note: string | null };

export type ItemDetailExampleSource = {
  id: string;
  targetText: string;
  translation: string;
  /** Which "Pattern of Use" tab this example belongs to. `null` is the General tab (spec 17). */
  patternId: string | null;
};

export type ItemDetailResourceSource = { id: string; label: string; url: string };

export type GrammarContentBlockSource =
  | { id: string; position: number; type: "text" | "note"; body: string }
  | { id: string; position: number; type: "example"; targetText: string; translation: string };

type ItemDetailSourceBase = {
  itemId: string;
  levelNumber: number;
  cefrLevel: CefrLevel | null;
  register: Register | null;
  patterns: ItemDetailPatternSource[];
  examples: ItemDetailExampleSource[];
  resources: ItemDetailResourceSource[];
};

export type ItemDetailSource =
  | (ItemDetailSourceBase & {
      type: "vocabulary";
      /** The word as taught, article included — compose it with `composeVocabularyDisplayWord`, never by hand. */
      displayWord: string;
      translation: string;
      /** Derived from the item's article by the language's lexical provider; `null` means the language or word has no gender. */
      gender: GrammaticalGender | null;
      /** Part of speech, shown as "Word Type". */
      wordType: string | null;
      pronunciationGuide: string | null;
      ipa: string | null;
      audioUrl: string | null;
      /** Polyglot's own teaching explanation. */
      teachingDefinition: string | null;
      /** Wiktionary-derived senses, kept in their own list so the UI can never present one as Polyglot's teaching text. */
      dictionarySenses: ItemDetailSenseSource[];
      attribution: string | null;
      officialSynonyms: string[];
      personalSynonyms: string[];
      officialVariations: string[];
      personalVariations: string[];
    })
  | (ItemDetailSourceBase & {
      type: "grammar";
      /** The short display label, e.g. "y" — the large centered hero content. */
      structure: string;
      /** Optional longer descriptive name, used in the About card's title when present. */
      title: string | null;
      translation: string;
      explanation: string;
      /** Ordered About blocks. Empty for a grammar point authored before spec 18, which falls back to `explanation`. */
      blocks: GrammarContentBlockSource[];
      officialSynonyms: string[];
      personalSynonyms: string[];
    });

// --- View shapes the components render ---

export type ItemDetailField = { label: string; value: string };

export type ItemDetailPronunciationView = {
  guide: string | null;
  ipa: string | null;
  wordType: string | null;
  /** A real recording, when one exists. Absent for every item today — the `media` domain is unbuilt. */
  audioUrl: string | null;
  /** The target-language text a speech-synthesis fallback should read aloud. */
  spokenText: string;
};

/**
 * A card's official and learner-private values, kept apart rather than
 * merged into one list. Spec 18 keeps private learner content
 * distinguishable from official curriculum everywhere it appears, and a
 * learner needs to know which synonyms Polyglot accepts for everyone and
 * which ones they added themselves.
 */
export type ItemDetailAnswerListView = {
  /** Dictionary/Polyglot values — official content. */
  official: string[];
  /** The reader's own private values. Never another learner's. */
  personal: string[];
};

export type ItemDetailAboutView = {
  title: string;
  /** Polyglot's teaching text. `null` when nothing has been authored and there are no blocks either. */
  body: string | null;
  /** Dictionary senses, always separate from `body` so attribution stays attached to what it describes. */
  dictionarySenses: ItemDetailSenseSource[];
  attribution: string | null;
  blocks: GrammarContentBlockSource[];
};

export type ItemDetailExampleView = { id: string; targetText: string; translation: string; spokenText: string };

export type ItemDetailPatternView = {
  id: string;
  label: string;
  note: string | null;
  examples: ItemDetailExampleView[];
};

export type ItemDetailView = {
  itemId: string;
  type: ItemDetailType;
  /** "Vocabulary Info" / "Grammar Info" — the hero's top-left kicker. */
  kindLabel: string;
  /** The large centered hero content. */
  headline: string;
  /** The primary translation/meaning shown beneath it. */
  translation: string;
  levelNumber: number;
  cefrLevel: CefrLevel | null;
  details: ItemDetailField[];
  pronunciation: ItemDetailPronunciationView | null;
  synonyms: ItemDetailAnswerListView;
  variations: ItemDetailAnswerListView;
  about: ItemDetailAboutView;
  /** "Pattern of Use" tabs with their examples. Empty when the item has no patterns configured. */
  patterns: ItemDetailPatternView[];
  /** Every example the item has, flat and in curriculum order — the Examples section, independent of pattern grouping. */
  examples: ItemDetailExampleView[];
  resources: ItemDetailResourceSource[];
};

/** The General tab's synthetic id — examples belonging to no pattern (spec 17's rule, unchanged). */
export const GENERAL_PATTERN_ID = "general";

function toExampleView(example: ItemDetailExampleSource): ItemDetailExampleView {
  return { id: example.id, targetText: example.targetText, translation: example.translation, spokenText: example.targetText };
}

function registerField(register: Register | null): ItemDetailField {
  return { label: "Register", value: register ? REGISTER_LABELS[register] : EMPTY_FIELD };
}

/**
 * Groups examples under their pattern, appending the General tab only when
 * something actually falls into it — spec 17's existing rule, preserved so
 * a word with patterns and no leftover examples does not grow an empty
 * "General" tab.
 *
 * A configured pattern with no examples yet is still returned: an empty tab
 * says "this form exists and nothing has been written for it", which is more
 * useful to a learner than the form silently not existing.
 */
function buildPatterns(source: ItemDetailSource): ItemDetailPatternView[] {
  const general = source.examples.filter((example) => example.patternId === null);
  const patterns: ItemDetailPatternView[] = source.patterns.map((pattern) => ({
    id: pattern.id,
    label: pattern.label,
    note: pattern.note,
    examples: source.examples.filter((example) => example.patternId === pattern.id).map(toExampleView),
  }));

  if (patterns.length === 0) return [];
  if (general.length === 0) return patterns;

  return [...patterns, { id: GENERAL_PATTERN_ID, label: "General", note: null, examples: general.map(toExampleView) }];
}

/**
 * The one place spec 18's item presentation is decided. Both the item page
 * and the lesson call this; neither computes a label, fallback, or grouping
 * of its own.
 */
export function buildItemDetailView(source: ItemDetailSource): ItemDetailView {
  const patterns = buildPatterns(source);
  const examples = source.examples.map(toExampleView);

  if (source.type === "grammar") {
    const hasBlocks = source.blocks.length > 0;
    return {
      itemId: source.itemId,
      type: "grammar",
      kindLabel: "Grammar Info",
      headline: source.structure,
      translation: source.translation,
      levelNumber: source.levelNumber,
      cefrLevel: source.cefrLevel,
      details: [{ label: "Structure", value: source.structure }, registerField(source.register)],
      pronunciation: null,
      synonyms: { official: source.officialSynonyms, personal: source.personalSynonyms },
      variations: { official: [], personal: [] },
      about: {
        title: `About ${source.title ?? source.structure}`,
        // Blocks supersede the legacy single explanation field rather than
        // rendering alongside it: an admin who has authored blocks has
        // written the explanation there, and showing both would duplicate it.
        body: hasBlocks ? null : source.explanation,
        dictionarySenses: [],
        attribution: null,
        blocks: [...source.blocks].sort((a, b) => a.position - b.position),
      },
      patterns,
      examples,
      resources: source.resources,
    };
  }

  return {
    itemId: source.itemId,
    type: "vocabulary",
    kindLabel: "Vocabulary Info",
    headline: source.displayWord,
    translation: source.translation,
    levelNumber: source.levelNumber,
    cefrLevel: source.cefrLevel,
    details: [
      { label: "Gender", value: source.gender ? GENDER_LABELS[source.gender] : NOT_APPLICABLE_FIELD },
      registerField(source.register),
    ],
    pronunciation: {
      guide: source.pronunciationGuide,
      ipa: source.ipa,
      wordType: source.wordType,
      audioUrl: source.audioUrl,
      spokenText: source.displayWord,
    },
    synonyms: { official: source.officialSynonyms, personal: source.personalSynonyms },
    variations: { official: source.officialVariations, personal: source.personalVariations },
    about: {
      title: "Definition",
      body: source.teachingDefinition,
      dictionarySenses: source.dictionarySenses,
      attribution: source.attribution,
      blocks: [],
    },
    patterns,
    examples,
    resources: source.resources,
  };
}

// --- Hero navigation ---

/**
 * The hero's previous/next arrows and its `1/13` position indicator.
 *
 * The set the arrows cycle through differs by surface and item type (spec
 * 18): on the item page grammar cycles through every grammar item in the
 * level and vocabulary through its own theme; in a lesson both cycle only
 * through the active session's items and must never escape it. All three
 * are the same computation over an ordered id list, so the *scope* is the
 * caller's decision and the wraparound is not.
 */
export type ItemNavigationView = {
  /** 1-based, as displayed. */
  position: number;
  total: number;
  previousItemId: string;
  nextItemId: string;
  /** Names what the arrows move through, for the arrows' accessible labels. */
  scopeLabel: string;
};

/**
 * Wraps in both directions: `1/13` back is `13/13`, and `13/13` forward is
 * `1/13` (spec 18). Returns `null` when the item is not in the list, or when
 * the list holds only this item — one item has nowhere to go, and arrows
 * that navigate to the current page would be a lie rather than a no-op.
 */
export function buildItemNavigation(itemIds: string[], currentItemId: string, scopeLabel: string): ItemNavigationView | null {
  const index = itemIds.indexOf(currentItemId);
  if (index === -1 || itemIds.length < 2) return null;

  return {
    position: index + 1,
    total: itemIds.length,
    previousItemId: itemIds[(index - 1 + itemIds.length) % itemIds.length],
    nextItemId: itemIds[(index + 1) % itemIds.length],
    scopeLabel,
  };
}
