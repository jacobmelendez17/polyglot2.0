import { DictionaryPanel } from "./dictionary-panel";
import { UsageContextTabs } from "./usage-context-tabs";
import { ItemDetailHeader } from "./item-detail-header";
import { ItemProgressPanel } from "./item-progress-panel";
import type { CurriculumStatus } from "@/domains/curriculum";
import { resolveVocabularyPresentation } from "@/domains/lexicon";
import type { VocabularyDetail } from "@/domains/lexicon";

type VocabularyItemDetailProps = {
  detail: VocabularyDetail;
  status: CurriculumStatus;
};

/**
 * Spec 13 + the 2026-09-07 "confirmed mapping wins" decision: composes
 * `domains/lexicon`'s `getVocabularyDetail` read model, then resolves the
 * teaching meaning/pronunciation live through `resolveVocabularyPresentation`
 * rather than showing the admin's typed value and the dictionary's as two
 * unrelated facts. The full "Dictionary information" panel — senses beyond
 * the primary one, forms, synonyms, regional evidence — only renders once a
 * human has actually confirmed the mapping (`matchStatus === "manual"`); an
 * unreviewed auto-match never reaches a learner.
 */
export function VocabularyItemDetail({ detail, status }: VocabularyItemDetailProps) {
  const { curriculum, dictionary, progress } = detail;
  const resolved = resolveVocabularyPresentation(detail);
  const confirmedDictionary = dictionary?.matchStatus === "manual" ? dictionary : null;

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
        <p className="text-sm text-foreground">{resolved.definition ?? "No teaching note yet for this item."}</p>
        {resolved.definitionSource === "dictionary" && confirmedDictionary?.attribution ? (
          <p className="text-xs text-muted-foreground">
            From {confirmedDictionary.lemma} — {confirmedDictionary.attribution.attributionText}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">Part of speech: {curriculum.partOfSpeech}</p>
        {curriculum.manualPronunciation || resolved.ipa ? (
          <p className="text-sm text-foreground">
            {curriculum.manualPronunciation}
            <span className="ml-1 font-mono text-muted-foreground">{resolved.ipa}</span>
          </p>
        ) : null}
      </section>

      {curriculum.examples.length > 0 || curriculum.usageContexts.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Context</h2>
          <UsageContextTabs examples={curriculum.examples} usageContexts={curriculum.usageContexts} />
        </section>
      ) : null}

      {curriculum.creatorNotes ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Notes</h2>
          <p className="text-sm text-foreground">{curriculum.creatorNotes}</p>
        </section>
      ) : null}

      {confirmedDictionary ? (
        <DictionaryPanel
          lemma={confirmedDictionary.lemma}
          selectedSenses={confirmedDictionary.selectedSenses}
          pronunciations={confirmedDictionary.pronunciations}
          preferredPronunciationId={confirmedDictionary.preferredPronunciationId}
          forms={confirmedDictionary.forms}
          synonyms={confirmedDictionary.synonyms}
          variants={confirmedDictionary.variants}
          regionalEvidence={confirmedDictionary.regionalEvidence}
          attribution={confirmedDictionary.attribution}
        />
      ) : null}
    </div>
  );
}
