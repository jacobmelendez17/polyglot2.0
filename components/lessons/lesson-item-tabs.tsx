import { Volume2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LearningItem } from "@/domains/curriculum";

type LessonItemTabsProps = {
  item: LearningItem;
};

/**
 * Details / Examples / Resources, operating within the current learning
 * item rather than navigating routes (spec 07 §14). Field lists follow
 * §15 (vocabulary) / §16 (grammar). Audio degrades to text-only pronunciation
 * when unavailable — the `media` domain doesn't exist yet — rather than
 * rendering a dead play control (§15 Missing Media).
 */
export function LessonItemTabs({ item }: LessonItemTabsProps) {
  return (
    <Tabs defaultValue="details" className="mx-auto w-full max-w-2xl">
      <TabsList className="mx-auto">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="examples">Examples</TabsTrigger>
        <TabsTrigger value="resources">Resources</TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-4 flex flex-col gap-4">
        {item.type === "vocabulary" ? <VocabularyDetails item={item} /> : <GrammarDetails item={item} />}
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

function VocabularyDetails({ item }: { item: Extract<LearningItem, { type: "vocabulary" }> }) {
  return (
    <div className="flex flex-col gap-4">
      {item.definition ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">Definition</h3>
          <p className="mt-1 text-sm text-foreground">{item.definition}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-4 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Part of speech</h3>
          <p className="mt-1 text-sm text-foreground">{item.partOfSpeech}</p>
        </div>
        {item.article ? (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Article</h3>
            <p className="mt-1 text-sm text-foreground">{item.article}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="text-sm font-medium text-muted-foreground">Pronunciation</h3>
        <div className="mt-1 flex items-center gap-2">
          {item.pronunciation.audioUrl ? (
            <button
              type="button"
              aria-label={`Play pronunciation of ${item.word}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-muted"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <p className="text-sm text-foreground">
            {item.pronunciation.guide}
            {item.pronunciation.ipa ? <span className="text-muted-foreground"> · /{item.pronunciation.ipa}/</span> : null}
          </p>
        </div>
      </section>

      {item.context ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">Context</h3>
          <p className="mt-1 text-sm text-foreground">{item.context}</p>
        </section>
      ) : null}

      {item.creatorNotes ? (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-medium text-muted-foreground">Creator notes</h3>
          <p className="mt-1 text-sm text-foreground">{item.creatorNotes}</p>
        </section>
      ) : null}
    </div>
  );
}

function GrammarDetails({ item }: { item: Extract<LearningItem, { type: "grammar" }> }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="text-sm font-medium text-muted-foreground">Explanation</h3>
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
          <h3 className="text-sm font-medium text-muted-foreground">Creator notes</h3>
          <p className="mt-1 text-sm text-foreground">{item.creatorNotes}</p>
        </section>
      ) : null}
    </div>
  );
}

function ExamplesList({ examples }: { examples: LearningItem["examples"] }) {
  if (examples.length === 0) {
    return <p className="text-sm text-muted-foreground">No examples for this item yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {examples.map((example, index) => (
        <li key={index} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-foreground">{example.targetText}</p>
          <p className="mt-1 text-sm text-muted-foreground">{example.englishText}</p>
        </li>
      ))}
    </ul>
  );
}

function ResourcesList({ resources }: { resources: LearningItem["resources"] }) {
  if (resources.length === 0) {
    return <p className="text-sm text-muted-foreground">No additional resources for this item.</p>;
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
