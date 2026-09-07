import { z } from "zod";

/**
 * Spec 12 "Security": every imported record is untrusted input and is
 * validated at the boundary before anything is projected or stored — record
 * shape, nested structure, and maximum field lengths included. A malformed
 * or oversized row is counted and skipped, never allowed to abort a
 * multi-hundred-thousand-record import or to reach the database unchecked.
 *
 * This schema deliberately describes only the fields Polyglot projects, plus
 * the two it filters on (`lang_code`, `pos`). Wiktextract records carry far
 * more (etymology templates, categories, wikipedia links, …); those survive
 * untouched in `dictionary_entry_versions.raw_data` and are simply not
 * interpreted here. `.loose()` keeps them rather than stripping them.
 */

/** Generous enough for real lexical content, small enough that a pathological row can't blow out a column or a log line. */
const MAX_SHORT_TEXT = 512;
const MAX_GLOSS_TEXT = 4_000;
const MAX_ARRAY_ITEMS = 200;

const shortText = z.string().max(MAX_SHORT_TEXT);
const tagList = z.array(shortText).max(MAX_ARRAY_ITEMS).optional();

const senseSchema = z
  .object({
    id: shortText.optional(),
    glosses: z.array(z.string().max(MAX_GLOSS_TEXT)).max(MAX_ARRAY_ITEMS).optional(),
    raw_glosses: z.array(z.string().max(MAX_GLOSS_TEXT)).max(MAX_ARRAY_ITEMS).optional(),
    tags: tagList,
    topics: tagList,
  })
  .loose();

const formSchema = z
  .object({
    form: shortText,
    tags: tagList,
  })
  .loose();

const soundSchema = z
  .object({
    ipa: shortText.optional(),
    tags: tagList,
    audio: shortText.optional(),
    ogg_url: shortText.optional(),
    mp3_url: shortText.optional(),
  })
  .loose();

const relatedWordSchema = z
  .object({
    word: shortText,
    tags: tagList,
  })
  .loose();

const relatedWordList = z.array(relatedWordSchema).max(MAX_ARRAY_ITEMS).optional();

export const wiktextractRecordSchema = z
  .object({
    word: z.string().min(1).max(MAX_SHORT_TEXT),
    lang_code: z.string().min(1).max(32),
    lang: shortText.optional(),
    pos: z.string().min(1).max(64),
    /** Distinguishes same-spelling, same-POS homonyms with separate etymologies — which must stay separate entries. */
    etymology_number: z.number().int().min(0).max(64).optional(),
    senses: z.array(senseSchema).max(MAX_ARRAY_ITEMS).optional(),
    forms: z.array(formSchema).max(MAX_ARRAY_ITEMS).optional(),
    sounds: z.array(soundSchema).max(MAX_ARRAY_ITEMS).optional(),
    synonyms: relatedWordList,
    antonyms: relatedWordList,
    related: relatedWordList,
    derived: relatedWordList,
    hypernyms: relatedWordList,
    hyponyms: relatedWordList,
    alt_of: relatedWordList,
    form_of: relatedWordList,
  })
  .loose();

export type WiktextractRecord = z.infer<typeof wiktextractRecordSchema>;
