import { PronunciationButton } from "@/components/shared/pronunciation-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LearningItem } from "@/domains/curriculum";
import { REGIONAL_STATUS_LABELS } from "@/domains/lexicon";

type LessonItemTabsProps = {
  item: LearningItem;
  /** `languages.code`, e.g. `es-MX` — passed down to `PronunciationButton` for voice selection. */
  languageCode: string;
};

/**
 * Details / Examples / Resources, operating within the current learning
 * item rather than navigating routes (spec 07 §14). Field lists follow
 * §15 (vocabulary) / §16 (grammar).
 */
export function LessonItemTabs({ item, languageCode }: LessonItemTabsProps) {
  return (
    <Tabs defaultValue="details" className="mx-auto w-full max-w-2xl">
      <TabsList className="mx-auto">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="examples">Examples</TabsTrigger>
        <TabsTrigger value="resources">Resources</TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-4 flex flex-col gap-4">
        {item.type === "vocabulary" ? (
          <VocabularyDetails item={item} languageCode={languageCode} />
        ) : (
          <GrammarDetails item={item} />
        )}
      </TabsContent>

      <TabsContent value="examples" className="mt-4">
        <ExamplesList examples={item.examples} />
      </TabsContent>

      <TabsContent value="resources" className="mt-4">
        <ResourcesList resources={item.resources} />
      </TabsContent>
    </Tabs>
  );
}

function VocabularyDetails({
  item,
  languageCode,
}: {
  item: Extract<LearningItem, { type: "vocabulary" }>;
  languageCode: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {item.definition ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">
            Definition
          </h3>
          <p className="mt-1 text-sm text-foreground">{item.definition}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-4 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Part of speech
          </h3>
          <p className="mt-1 text-sm text-foreground">{item.partOfSpeech}</p>
        </div>
        {item.article ? (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Article
            </h3>
            <p className="mt-1 text-sm text-foreground">{item.article}</p>
          </div>
        ) : null}
      </section>

      {/*
        Omitted entirely when the curriculum has no pronunciation data at all
        — real `vocabulary_items` rows frequently have neither a guide nor an
        IPA transcription, and an empty labelled card reads as missing content
        rather than as absent content. Audio alone still renders the section,
        since the control is the content in that case.
      */}
      {item.pronunciation.guide ||
      item.pronunciation.ipa ||
      item.pronunciation.audioUrl ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">
            Pronunciation
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <PronunciationButton
              text={item.word}
              languageCode={languageCode}
              audioUrl={item.pronunciation.audioUrl}
              label={item.word}
              size="sm"
            />
            <p className="text-sm text-foreground">
              {item.pronunciation.guide}
              {item.pronunciation.ipa ? (
                <span className="text-muted-foreground">
                  {item.pronunciation.guide ? " · " : null}/
                  {item.pronunciation.ipa}/
                </span>
              ) : null}
            </p>
          </div>
        </section>
      ) : null}

      {item.context ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">Context</h3>
          <p className="mt-1 text-sm text-foreground">{item.context}</p>
        </section>
      ) : null}

      {item.creatorNotes ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">
            Creator notes
          </h3>
          <p className="mt-1 text-sm text-foreground">{item.creatorNotes}</p>
        </section>
      ) : null}

      {item.dictionary ? (
        <VocabularyDictionaryInfoSection dictionary={item.dictionary} />
      ) : null}
    </div>
  );
}

/**
 * "Everything the dictionary has" (2026-09-07 decision), rendered only when
 * the item's mapping is confirmed — `item.dictionary` is absent otherwise
 * (see `curriculum-db-service.ts`'s `withConfirmedDictionaryData`).
 */
function VocabularyDictionaryInfoSection({
  dictionary,
}: {
  dictionary: NonNullable<
    Extract<LearningItem, { type: "vocabulary" }>["dictionary"]
  >;
}) {
  const hasContent =
    dictionary.synonyms.length > 0 ||
    dictionary.variants.length > 0 ||
    dictionary.usageLabels.length > 0 ||
    dictionary.regionalEvidence.length > 0;
  if (!hasContent) return null;

  return (
    <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-medium text-muted-foreground">
        Dictionary information
      </h3>
      <div className="mt-2 flex flex-col gap-3">
        {dictionary.usageLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {dictionary.usageLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}

        {dictionary.synonyms.length > 0 ? (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Synonyms: </span>
            {dictionary.synonyms.join(", ")}
          </p>
        ) : null}

        {dictionary.variants.length > 0 ? (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Also written: </span>
            {dictionary.variants.join(", ")}
          </p>
        ) : null}

        {dictionary.regionalEvidence.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {dictionary.regionalEvidence.map((evidence) => (
              <li
                key={evidence.regionCode}
                className={
                  evidence.status === "recognized"
                    ? "rounded-full bg-state-success/10 px-2 py-0.5 text-xs text-state-success"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                }
                title={evidence.matchedForm ?? undefined}
              >
                {evidence.regionCode}: {REGIONAL_STATUS_LABELS[evidence.status]}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {dictionary.attributionText ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {dictionary.attributionText}
        </p>
      ) : null}
    </section>
  );
}

function GrammarDetails({
  item,
}: {
  item: Extract<LearningItem, { type: "grammar" }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="text-sm font-medium text-muted-foreground">
          Explanation
        </h3>
        <p className="mt-1 text-sm text-foreground">{item.explanation}</p>
      </section>

      <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="text-sm font-medium text-muted-foreground">Usage</h3>
        <p className="mt-1 text-sm text-foreground">{item.usage}</p>
      </section>

      {item.context ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">Context</h3>
          <p className="mt-1 text-sm text-foreground">{item.context}</p>
        </section>
      ) : null}

      {item.creatorNotes ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">
            Creator notes
          </h3>
          <p className="mt-1 text-sm text-foreground">{item.creatorNotes}</p>
        </section>
      ) : null}
    </div>
  );
}

function ExamplesList({ examples }: { examples: LearningItem["examples"] }) {
  if (examples.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No examples for this item yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {examples.map((example, index) => (
        <li
          key={index}
          className="rounded-lg bg-card p-4 ring-1 ring-foreground/10"
        >
          <p className="text-sm text-foreground">{example.targetText}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {example.englishText}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ResourcesList({
  resources,
}: {
  resources: LearningItem["resources"];
}) {
  if (resources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No additional resources for this item.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {resources.map((resource) => (
        <li key={resource.url}>
          <a
            href={resource.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
          >
            {resource.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
