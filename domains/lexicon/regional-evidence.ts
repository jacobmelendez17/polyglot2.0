import type { DbClient } from "@/db/client";

import {
  findRegionalLexeme,
  findRegionalLexemes,
  getEntryLexicalForms,
  hasRegionalData,
  upsertRegionalEvidence,
} from "./lexicon-repository";
import { normalizeLexicalForm } from "./lexical-normalization";
import type { RegionalEvidenceStatus } from "./lexicon-types";

/**
 * Spec 12 "RLA-ES". The generic question the rest of the application asks is
 * `getRegionalEvidence(term, region)` — nothing outside this module and the
 * RLA adapter knows that the answer comes from a Hunspell word list.
 *
 * The distinction this file exists to protect: `not_listed` means "a word
 * list for this region exists and does not contain this word", which is weak
 * evidence. It is **not** a claim that the word is invalid there. `unknown`
 * means no regional data has been imported at all. Collapsing the two into a
 * `mexican = false` boolean is exactly what spec 12 forbids, and it is why
 * neither value alone ever rejects a match.
 */

/** How many entries to evaluate per round trip during a full refresh. Bounded so a full-language pass never materializes the dictionary. */
const EVIDENCE_BATCH_SIZE = 500;

export async function getRegionalEvidence(
  db: DbClient,
  term: string,
  regionCode: string,
): Promise<{ status: RegionalEvidenceStatus; matchedForm: string | null }> {
  const normalized = normalizeLexicalForm(term);
  const match = await findRegionalLexeme(db, { regionCode, normalizedWord: normalized });
  if (match) return { status: "recognized", matchedForm: match.word };
  const regionHasData = await hasRegionalData(db, regionCode);
  return { status: regionHasData ? "not_listed" : "unknown", matchedForm: null };
}

export interface RefreshRegionalEvidenceInput {
  languageId: string;
  /** The *dictionary* source whose entries are being evaluated — not the regional source supplying the evidence. */
  dictionarySourceId: string;
  regionCodes: readonly string[];
  now: Date;
}

/**
 * Recomputes cached evidence for every entry of a dictionary source, in each
 * of the language's regions. Run after either kind of import: new dictionary
 * entries need evidence, and a new regional word list changes the answer for
 * entries that already existed.
 *
 * An entry counts as recognized when the region's list contains its lemma or
 * any of its inflected forms — a plural being listed is real evidence about
 * the word, and requiring an exact lemma hit would report false absences.
 */
export async function refreshRegionalEvidence(
  db: DbClient,
  input: RefreshRegionalEvidenceInput,
): Promise<{ evaluated: number }> {
  const regionHasData = new Map<string, boolean>();
  for (const regionCode of input.regionCodes) {
    regionHasData.set(regionCode, await hasRegionalData(db, regionCode));
  }

  let evaluated = 0;
  let afterId: string | null = null;

  for (;;) {
    const batch = await getEntryLexicalForms(db, {
      languageId: input.languageId,
      sourceId: input.dictionarySourceId,
      afterId,
      limit: EVIDENCE_BATCH_SIZE,
    });
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1].entryId;

    for (const regionCode of input.regionCodes) {
      const words = [...new Set(batch.flatMap((entry) => [entry.normalizedLemma, ...entry.normalizedForms]))];
      const matches = await findRegionalLexemes(db, { regionCode, normalizedWords: words });
      const absentStatus: RegionalEvidenceStatus = regionHasData.get(regionCode) ? "not_listed" : "unknown";

      const rows = batch.map((entry) => {
        const candidates = [entry.normalizedLemma, ...entry.normalizedForms];
        const hit = candidates.map((form) => matches.get(form)).find((value) => value !== undefined);
        return {
          dictionaryEntryId: entry.entryId,
          regionCode,
          status: (hit ? "recognized" : absentStatus) satisfies RegionalEvidenceStatus as RegionalEvidenceStatus,
          sourceId: hit?.sourceId ?? null,
          lexicalImportId: hit?.lexicalImportId ?? null,
          matchedForm: hit?.word ?? null,
          evaluatedAt: input.now,
        };
      });

      evaluated += await upsertRegionalEvidence(db, rows);
    }
  }

  return { evaluated };
}
