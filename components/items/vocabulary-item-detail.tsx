import { DictionaryPanel } from "./dictionary-panel";
import { ExampleList } from "./example-list";
import { ItemDetailHeader } from "./item-detail-header";
import { ItemProgressPanel } from "./item-progress-panel";
import type { CurriculumStatus } from "@/domains/curriculum";
import type { VocabularyDetail } from "@/domains/lexicon";

type VocabularyItemDetailProps = {
  detail: VocabularyDetail;
  status: CurriculumStatus;
};

/**
 * Spec 13: composes `domains/lexicon`'s `getVocabularyDetail` read model —
 * no dictionary/curriculum join happens here or anywhere else in this
 * component tree. The dictionary section only renders when `dictionary` is
 * non-null (an unmatched item is a normal, fully usable curriculum item).
 */
export function VocabularyItemDetail({ detail, status }: VocabularyItemDetailProps) {
  const { curriculum, dictionary, progress } = detail;
  const pronunciation = curriculum.manualPronunciation;
  const ipa = curriculum.manualIpa;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <ItemDetailHeader
        itemType="vocabulary"
        primary={curriculum.displayWord}
        secondary={curriculum.translation}
        levelNumber={curriculum.levelNumber}
        groupName={curriculum.groupName}
        status={status}
      />

      <section className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-sm font-semibold text-foreground">Progress</h2>
        <ItemProgressPanel progress={progress} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">Teaching meaning</h2>
        <p className="text-sm text-foreground">{curriculum.teachingSummary ?? "No teaching note yet for this item."}</p>
        <p className="text-xs text-muted-foreground">Part of speech: {curriculum.partOfSpeech}</p>
        {pronunciation || ipa ? (
          <p className="text-sm text-foreground">
            {pronunciation}
            {/* Matches `dictionary-mapping-panel.tsx`'s raw IPA render — admin-entered IPA is free text, not guaranteed to omit delimiters either way. */}
            {ipa ? <span className="ml-1 font-mono text-muted-foreground">{ipa}</span> : null}
          </p>
        ) : null}
      </section>

      {curriculum.examples.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Examples</h2>
          <ExampleList examples={curriculum.examples} />
        </section>
      ) : null}

      {curriculum.creatorNotes ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Notes</h2>
          <p className="text-sm text-foreground">{curriculum.creatorNotes}</p>
        </section>
      ) : null}

      {dictionary ? (
        <DictionaryPanel
          lemma={dictionary.lemma}
          selectedSenses={dictionary.selectedSenses}
          pronunciations={dictionary.pronunciations}
          preferredPronunciationId={dictionary.preferredPronunciationId}
          forms={dictionary.forms}
          synonyms={dictionary.synonyms}
          variants={dictionary.variants}
          regionalEvidence={dictionary.regionalEvidence}
          attribution={dictionary.attribution}
        />
      ) : null}
    </div>
  );
}
