import { resolveByLanguageCode } from "@/lib/language-code";

import type { LexicalSourceType } from "./lexicon-types";

/**
 * The lexical sources Polyglot knows how to ingest (spec 12 "Licensing and
 * Attribution": provider, source, license metadata, and required attribution
 * must be persisted, and third-party data must stay distinguishable from
 * Polyglot-authored content).
 *
 * Source *locations* are deliberately not here — spec 12's security section
 * requires dictionary source locations be configured server-side, never
 * supplied by the Admin UI. Paths live in `lexicon-source-config.ts`, read
 * from the environment.
 *
 * The full license texts and the attribution wording live under
 * `/licenses` and `/attributions`; this registry records which applies to
 * what, so a row in `lexical_sources` can never exist without one.
 */

export interface LexicalSourceDefinition {
  code: string;
  provider: string;
  sourceType: LexicalSourceType;
  sourceLanguage: string;
  entryLanguage: string | null;
  licenseMetadata: Record<string, unknown>;
  attributionText: string;
}

export const WIKTIONARY_ES_SOURCE_CODE = "wiktionary-en-es";
export const RLA_ES_MX_SOURCE_CODE = "rla-es-mx";
export const RLA_ES_SOURCE_CODE = "rla-es-general";

export const LEXICAL_SOURCE_DEFINITIONS: Record<string, LexicalSourceDefinition> = {
  [WIKTIONARY_ES_SOURCE_CODE]: {
    code: WIKTIONARY_ES_SOURCE_CODE,
    provider: "wiktextract",
    sourceType: "dictionary",
    sourceLanguage: "es",
    entryLanguage: "en",
    licenseMetadata: {
      license: "CC-BY-SA-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      upstream: "English Wiktionary",
      upstreamUrl: "https://en.wiktionary.org/",
      extractor: "wiktextract / kaikki.org",
      extractorUrl: "https://kaikki.org/",
      licenseFile: "/licenses/wiktionary-cc-by-sa-4.0.md",
      // ShareAlike is not a formality here: derived lexical content carries
      // the obligation forward. Recorded in data so nothing surfaces this
      // content without the terms travelling alongside it.
      shareAlike: true,
    },
    attributionText:
      "Dictionary data from English Wiktionary via Wiktextract (kaikki.org), used under CC BY-SA 4.0.",
  },
  [RLA_ES_MX_SOURCE_CODE]: {
    code: RLA_ES_MX_SOURCE_CODE,
    provider: "rla-es",
    sourceType: "regional_wordlist",
    sourceLanguage: "es",
    entryLanguage: null,
    licenseMetadata: {
      license: "GPL-3.0-or-later / LGPL-3.0-or-later / MPL-1.1 (tri-license)",
      upstream: "RLA-ES (Recursos Lingüísticos Abiertos del Español)",
      upstreamUrl: "https://github.com/sbosio/rla-es",
      licenseFile: "/licenses/rla-es.md",
      regionCode: "es-MX",
    },
    attributionText: "Regional word list from RLA-ES (Recursos Lingüísticos Abiertos del Español).",
  },
  [RLA_ES_SOURCE_CODE]: {
    code: RLA_ES_SOURCE_CODE,
    provider: "rla-es",
    sourceType: "regional_wordlist",
    sourceLanguage: "es",
    entryLanguage: null,
    licenseMetadata: {
      license: "GPL-3.0-or-later / LGPL-3.0-or-later / MPL-1.1 (tri-license)",
      upstream: "RLA-ES (Recursos Lingüísticos Abiertos del Español)",
      upstreamUrl: "https://github.com/sbosio/rla-es",
      licenseFile: "/licenses/rla-es.md",
      regionCode: "es",
    },
    attributionText: "Regional word list from RLA-ES (Recursos Lingüísticos Abiertos del Español).",
  },
};

/**
 * Which dictionary source backs a language's lexical data. One source per
 * language for this first implementation; the mapping lives in data so
 * adding JMdict for Japanese is a registry entry rather than a branch in
 * matching code.
 *
 * Keyed by base language subtag, then overridable per region: Polyglot's own
 * `languages.code` is `es-MX`, but Wiktionary's Spanish extract covers
 * Spanish as a whole, so both resolve to the same source unless a region is
 * given its own entry.
 */
const DICTIONARY_SOURCE_BY_LANGUAGE: Record<string, string> = {
  es: WIKTIONARY_ES_SOURCE_CODE,
};

export function getDictionarySourceCodeForLanguage(languageCode: string): string | null {
  return resolveByLanguageCode(DICTIONARY_SOURCE_BY_LANGUAGE, languageCode) ?? null;
}

/** Which regional source supplies evidence for a region code. */
const REGIONAL_SOURCE_BY_REGION: Record<string, string> = {
  "es-MX": RLA_ES_MX_SOURCE_CODE,
  es: RLA_ES_SOURCE_CODE,
};

export function getRegionalSourceCodeForRegion(regionCode: string): string | null {
  return REGIONAL_SOURCE_BY_REGION[regionCode] ?? null;
}
