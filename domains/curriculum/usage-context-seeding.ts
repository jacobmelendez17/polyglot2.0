/**
 * Turning a confirmed dictionary entry's inflected forms into the usage
 * contexts a word starts with (spec 17).
 *
 * Pure and database-free: it takes forms in and gives proposed contexts
 * back, so the rule is unit-testable and the caller decides what to write.
 * Seeding is a starting point, never a constraint — every proposal here can
 * be renamed, reordered, or deleted afterwards, and a word with no
 * dictionary match can still have contexts written by hand.
 */

export type DictionaryFormInput = { form: string; tags: string[] };

export type ProposedUsageContext = {
  label: string;
  note: string | null;
  sourceForm: string;
};

/**
 * Grammatical tags that describe *which* form a word takes, in the order a
 * person would read them ("first-person singular present"), rather than the
 * order Wiktextract happens to list them.
 *
 * Tags outside this list are ignored on purpose. A real extract carries a
 * long tail of editorial and dialectal markers, and a tab label reading
 * "first-person singular present indicative canonical no-gloss" helps
 * nobody.
 */
const ORDERED_TAG_GROUPS: readonly (readonly string[])[] = [
  ["first-person", "second-person", "third-person"],
  ["singular", "plural"],
  ["present", "preterite", "imperfect", "future", "conditional", "past"],
  ["indicative", "subjunctive", "imperative", "infinitive", "participle", "gerund"],
  ["masculine", "feminine", "neuter"],
];

/** The tags a form carries that are worth showing, in reading order. */
function describeTags(tags: string[]): string | null {
  const present = ORDERED_TAG_GROUPS.flatMap((group) => group.filter((tag) => tags.includes(tag)));
  return present.length > 0 ? present.join(" ") : null;
}

/**
 * Forms that are not a distinct *usage* — they are the word itself, or a
 * spelling note about it. Seeding a "canonical" tab for `comer` beside
 * `comer` would be noise.
 */
function isUsageForm(form: DictionaryFormInput, lemma: string): boolean {
  if (form.form.trim().length === 0) return false;
  if (form.form.trim().toLowerCase() === lemma.trim().toLowerCase()) return false;
  const uninteresting = ["canonical", "romanization", "no-gloss", "table-tags", "class", "inflection-template"];
  return !form.tags.some((tag) => uninteresting.includes(tag));
}

export type SeedUsageContextsInput = {
  lemma: string;
  forms: DictionaryFormInput[];
  /** Forms already used by an existing context, so re-seeding never duplicates one. */
  existingSourceForms?: string[];
  /** A guard against a verb's full conjugation table becoming ninety tabs. */
  limit?: number;
};

/**
 * The contexts a word should be seeded with.
 *
 * Deduplicated by form: an extract lists the same spelling under several tag
 * combinations (`como` is both indicative and, elsewhere, something else),
 * and a learner wants one tab per spelling with the clearest description of
 * it, not the same tab three times.
 */
export function proposeUsageContexts({
  lemma,
  forms,
  existingSourceForms = [],
  limit = 12,
}: SeedUsageContextsInput): ProposedUsageContext[] {
  const alreadySeeded = new Set(existingSourceForms.map((form) => form.trim().toLowerCase()));
  const byForm = new Map<string, ProposedUsageContext>();

  for (const form of forms) {
    if (!isUsageForm(form, lemma)) continue;
    const label = form.form.trim();
    const key = label.toLowerCase();
    if (alreadySeeded.has(key)) continue;

    const note = describeTags(form.tags);
    const existing = byForm.get(key);
    // Prefer the description that actually says something: the first
    // occurrence of a form is often the bare one.
    if (!existing) byForm.set(key, { label, note, sourceForm: label });
    else if (existing.note === null && note !== null) byForm.set(key, { ...existing, note });
  }

  return [...byForm.values()].slice(0, limit);
}
