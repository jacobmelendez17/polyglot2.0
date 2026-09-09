import { getLexicalLanguageProvider } from "../lexical-language-provider";
import { normalizeLexicalForm, normalizePartOfSpeech } from "../lexical-normalization";
import type { DictionaryRelationType } from "../lexicon-types";

import { hashSourceValue } from "./source-hash";
import type {
  ProjectedDictionaryRecord,
  ProjectedForm,
  ProjectedPronunciation,
  ProjectedRelation,
  ProjectedSense,
} from "./import-types";
import type { WiktextractRecord } from "./wiktextract-schema";

/**
 * The Wiktionary/Kaikki-specific half of dictionary ingestion (spec 12
 * "Wiktionary / Kaikki Import"). Everything that knows what a Wiktextract
 * record looks like lives here and in `wiktextract-schema.ts`; the importer,
 * the repository, and every consumer downstream see only
 * `ProjectedDictionaryRecord`.
 *
 * No network access: spec 12 forbids scraping Wiktionary at runtime, and
 * nothing in this module fetches anything. It transforms bytes that a
 * server-configured dump file already provided.
 */

/** Wiktextract's own field names for relationships, mapped onto Polyglot's `dictionary_relation_type`. */
const RELATION_FIELDS: readonly (readonly [keyof WiktextractRecord, DictionaryRelationType])[] = [
  ["synonyms", "synonym"],
  ["antonyms", "antonym"],
  ["related", "related"],
  ["derived", "derived"],
  ["hypernyms", "hypernym"],
  ["hyponyms", "hyponym"],
  ["alt_of", "alternative_form"],
  ["form_of", "form_of"],
];

function projectSenses(record: WiktextractRecord): ProjectedSense[] {
  const senses: ProjectedSense[] = [];
  const usedKeys = new Set<string>();

  for (const sense of record.senses ?? []) {
    const gloss = (sense.glosses ?? sense.raw_glosses ?? []).join("; ").trim();
    // A sense with no gloss teaches nothing and cannot be selected or
    // displayed — Wiktextract emits these for form-of stubs. Skipping is
    // correct; storing an empty meaning is not.
    if (gloss.length === 0) continue;

    // Prefer the source's own sense id, which is stable across reimports.
    // Falling back to the normalized gloss keeps a sense recognizable when
    // the source has no id — using the array index instead would silently
    // re-key every later sense the moment one was inserted upstream, which
    // is exactly how a selected sense gets lost.
    const baseKey = sense.id ?? normalizeLexicalForm(gloss);
    let key = baseKey;
    let collision = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}#${collision}`;
      collision += 1;
    }
    usedKeys.add(key);

    const tags = sense.tags ?? [];
    const topics = sense.topics ?? [];
    senses.push({
      sourceSenseKey: key.slice(0, 512),
      sourceFingerprint: hashSourceValue({ gloss, tags, topics }),
      senseOrder: senses.length,
      gloss,
      tags,
      topics,
    });
  }

  return senses;
}

function projectForms(record: WiktextractRecord): ProjectedForm[] {
  const forms: ProjectedForm[] = [];
  const seen = new Set<string>();

  for (const form of record.forms ?? []) {
    const value = form.form.trim();
    if (value.length === 0) continue;
    const tags = form.tags ?? [];
    const fingerprint = hashSourceValue({ form: value, tags });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    forms.push({ form: value, normalizedForm: normalizeLexicalForm(value), tags, sourceFingerprint: fingerprint });
  }

  return forms;
}

function projectPronunciations(record: WiktextractRecord, languageCode: string): ProjectedPronunciation[] {
  const provider = getLexicalLanguageProvider(languageCode);
  const pronunciations: ProjectedPronunciation[] = [];
  const seen = new Set<string>();

  for (const sound of record.sounds ?? []) {
    const audioUrl = sound.ogg_url ?? sound.mp3_url ?? null;
    // A sound entry carrying neither a transcription nor audio has nothing
    // to show a learner.
    if (!sound.ipa && !audioUrl) continue;
    const tags = sound.tags ?? [];
    const regionCode = tags.map((tag) => provider.regionCodeForSourceLabel(tag)).find((code) => code !== null) ?? null;
    const fingerprint = hashSourceValue({ ipa: sound.ipa ?? null, tags, audioUrl });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    pronunciations.push({ ipa: sound.ipa ?? null, regionCode, tags, audioUrl, sourceFingerprint: fingerprint });
  }

  return pronunciations;
}

function projectRelations(record: WiktextractRecord): ProjectedRelation[] {
  const relations: ProjectedRelation[] = [];
  const seen = new Set<string>();

  for (const [field, relationType] of RELATION_FIELDS) {
    const entries = record[field];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const targetLemma = typeof entry === "object" && entry !== null && "word" in entry ? String(entry.word).trim() : "";
      if (targetLemma.length === 0) continue;
      const normalizedTargetLemma = normalizeLexicalForm(targetLemma);
      const dedupeKey = `${relationType}:${normalizedTargetLemma}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      relations.push({ relationType, targetLemma, normalizedTargetLemma });
    }
  }

  return relations;
}

/**
 * Region restrictions stated by the source itself, gathered from the usage
 * labels on the entry's senses. This is positive evidence ("this sense is
 * labelled Spain"), which is a different and much stronger claim than a word
 * simply being absent from a regional word list — spec 12 is explicit that
 * absence must never be treated as proof.
 */
function projectRestrictedRegionCodes(record: WiktextractRecord, languageCode: string): string[] {
  const provider = getLexicalLanguageProvider(languageCode);
  const codes = new Set<string>();
  for (const sense of record.senses ?? []) {
    for (const tag of sense.tags ?? []) {
      const code = provider.regionCodeForSourceLabel(tag);
      if (code) codes.add(code);
    }
  }
  return [...codes].sort();
}


/**
 * Makes entry keys unique across one import run.
 *
 * `projectWiktextractRecord` can only see one record, so it cannot know that
 * the key it just produced belongs to a second, genuinely different upstream
 * entry. Two records sharing a key are not a harmless duplicate: the batch
 * write is a single `INSERT ... ON CONFLICT DO UPDATE`, and Postgres rejects
 * a statement that would touch the same conflict target twice
 * (`21000: ON CONFLICT DO UPDATE command cannot affect row a second time`),
 * failing the entire import. That is exactly what the first real Kaikki
 * import hit; the committed 24-record fixture never contained a repeat.
 *
 * Mirrors `projectSenses`' own collision handling one level up: the first
 * occurrence keeps the natural key, so existing entries and the mappings
 * pointing at them are undisturbed, and only genuine repeats are suffixed.
 * The suffix adds a fourth segment, so a disambiguated key can never collide
 * with a natural three-segment one (`naranja#noun#0#2` is not reachable as
 * an etymology number).
 *
 * Ordering-dependent, and deliberately so: a stable dump reproduces the same
 * keys, and the primary entry — the one upstream lists first — is the one
 * that keeps the unsuffixed key. State lives in the returned closure rather
 * than the module, so imports never leak keys into one another.
 */
export function createEntryKeyDisambiguator(): (sourceEntryKey: string) => string {
  const occurrences = new Map<string, number>();
  return (sourceEntryKey: string): string => {
    const seen = occurrences.get(sourceEntryKey) ?? 0;
    occurrences.set(sourceEntryKey, seen + 1);
    return seen === 0 ? sourceEntryKey : `${sourceEntryKey}#${seen + 1}`;
  };
}

/**
 * Projects one validated Wiktextract record. Returns `null` when the record
 * cannot become a usable Polyglot entry — an unmappable part of speech, or
 * no glossed sense at all — so the caller counts it as rejected rather than
 * storing a half-meaningful entry that would later pollute matching.
 */
export function projectWiktextractRecord(record: WiktextractRecord): ProjectedDictionaryRecord | null {
  const partOfSpeech = normalizePartOfSpeech(record.pos);
  if (partOfSpeech === null) return null;

  const lemma = record.word.trim();
  const normalizedLemma = normalizeLexicalForm(lemma);
  if (normalizedLemma.length === 0) return null;

  // Same spelling and same part of speech with a different etymology is a
  // genuinely different word (the homonym case spec 12 wants surfaced for
  // review), so the etymology number is part of the entry's identity.
  //
  // It is not sufficient on its own, though: a real Kaikki extract routinely
  // emits several records for one spelling and part of speech with **no**
  // etymology number at all ("naranja" the fruit, the colour, and the
  // political supporter are three noun records, all `etymology_number:
  // null`). They all land on `naranja#noun#0` here, which is why the caller
  // runs these keys through `createEntryKeyDisambiguator` before writing —
  // see that function for why the uniqueness cannot be decided from a single
  // record.
  const sourceEntryKey = [normalizedLemma, partOfSpeech, record.etymology_number ?? 0].join("#");
  const senses = projectSenses(record);
  if (senses.length === 0) return null;

  return {
    sourceEntryKey,
    lemma,
    normalizedLemma,
    partOfSpeech,
    languageCode: record.lang_code,
    senses,
    forms: projectForms(record),
    pronunciations: projectPronunciations(record, record.lang_code),
    relations: projectRelations(record),
    restrictedRegionCodes: projectRestrictedRegionCodes(record, record.lang_code),
    rawData: record,
    sourceHash: hashSourceValue(record),
  };
}
