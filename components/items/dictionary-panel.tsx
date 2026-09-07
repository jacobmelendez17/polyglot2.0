import { NOT_LISTED_CAVEAT, REGIONAL_STATUS_LABELS } from "@/domains/lexicon";
import type { DictionaryForm, DictionaryPronunciation, DictionarySense, LexicalAttribution, RegionalEvidence } from "@/domains/lexicon";

type DictionaryPanelProps = {
  lemma: string;
  selectedSenses: DictionarySense[];
  pronunciations: DictionaryPronunciation[];
  preferredPronunciationId: string | null;
  forms: DictionaryForm[];
  synonyms: string[];
  variants: string[];
  regionalEvidence: RegionalEvidence[];
  attribution: LexicalAttribution | null;
};

/**
 * Everything in this panel is dictionary-derived, never Polyglot's own
 * teaching content (spec 12/13's "clearly distinguish" rule) — its own
 * section heading, tinted background, and the required attribution line
 * carry that distinction, not color alone. Only `selectedSenses` (the
 * admin-curated set) are shown, never `allSenses` — that field is an
 * admin QA view, not learner-facing content.
 */
export function DictionaryPanel({
  lemma,
  selectedSenses,
  pronunciations,
  preferredPronunciationId,
  forms,
  synonyms,
  variants,
  regionalEvidence,
  attribution,
}: DictionaryPanelProps) {
  const orderedPronunciations = [...pronunciations].sort((a) => (a.id === preferredPronunciationId ? -1 : 0));

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-muted/30 p-4 ring-1 ring-foreground/10">
      <div>
        <h2 className="font-heading text-sm font-semibold text-foreground">Dictionary information</h2>
        <p className="text-xs text-muted-foreground">From {lemma} — not Polyglot&rsquo;s own teaching content.</p>
      </div>

      {orderedPronunciations.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {orderedPronunciations.map((pronunciation) =>
            pronunciation.ipa ? (
              <span key={pronunciation.id} className="text-sm">
                {/* Stored IPA already carries its own delimiters (matching `dictionary-mapping-panel.tsx`'s existing raw render) — do not add another pair. */}
                <span className="font-mono text-foreground">{pronunciation.ipa}</span>
                {pronunciation.regionCode ? <span className="ml-1 text-xs text-muted-foreground">({pronunciation.regionCode})</span> : null}
              </span>
            ) : null,
          )}
        </div>
      ) : null}

      {selectedSenses.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Senses</h3>
          <ol className="mt-1 flex flex-col gap-1">
            {selectedSenses.map((sense) => (
              <li key={sense.id} className="text-sm text-foreground">
                {sense.gloss}
                {sense.tags.length > 0 ? <span className="ml-1 text-xs text-muted-foreground">({sense.tags.join(", ")})</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {forms.length > 0 || variants.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Forms &amp; variants</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {forms.map((form) => (
              <span key={form.id} className="rounded-md bg-card px-2 py-0.5 text-xs text-foreground ring-1 ring-foreground/10">
                {form.form}
                {form.tags.length > 0 ? ` (${form.tags.join(", ")})` : ""}
              </span>
            ))}
            {variants.map((variant) => (
              <span key={variant} className="rounded-md bg-card px-2 py-0.5 text-xs text-foreground ring-1 ring-foreground/10">
                {variant}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {synonyms.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Synonyms</h3>
          <p className="mt-1 text-sm text-foreground">{synonyms.join(", ")}</p>
        </div>
      ) : null}

      {regionalEvidence.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Regional usage</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {regionalEvidence.map((evidence) => (
              <li key={evidence.regionCode} className="text-sm text-foreground">
                <span className="font-medium">{evidence.regionCode}:</span> {REGIONAL_STATUS_LABELS[evidence.status]}
                {evidence.status === "not_listed" ? <span className="block text-xs text-muted-foreground">{NOT_LISTED_CAVEAT}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {attribution ? (
        <p className="text-xs text-muted-foreground">
          {attribution.attributionText}
          {attribution.sourceVersion ? ` (${attribution.sourceVersion})` : ""}
        </p>
      ) : null}
    </section>
  );
}
