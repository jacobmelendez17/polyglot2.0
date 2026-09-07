import { ExampleList } from "./example-list";
import { ItemDetailHeader } from "./item-detail-header";
import { ItemProgressPanel } from "./item-progress-panel";
import type { CurriculumExampleSentence, CurriculumGrammarDetail, CurriculumStatus } from "@/domains/curriculum";
import type { ItemProgress } from "@/domains/progress";

type GrammarItemDetailProps = {
  grammar: CurriculumGrammarDetail;
  levelNumber: number;
  status: CurriculumStatus;
  examples: CurriculumExampleSentence[];
  progress: ItemProgress | null;
};

/**
 * Spec 13: grammar items use only `domains/curriculum` — never
 * `domains/lexicon`, which maps vocabulary to dictionary entries and has no
 * grammar counterpart.
 */
export function GrammarItemDetail({ grammar, levelNumber, status, examples, progress }: GrammarItemDetailProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <ItemDetailHeader
        itemType="grammar"
        primary={grammar.title ?? grammar.structure}
        secondary={grammar.primaryMeaning}
        levelNumber={levelNumber}
        status={status}
      />

      <section className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-sm font-semibold text-foreground">Progress</h2>
        <ItemProgressPanel progress={progress} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">Explanation</h2>
        <p className="text-sm text-foreground">{grammar.explanation}</p>
        {grammar.category ? <p className="text-xs text-muted-foreground">Category: {grammar.category}</p> : null}
      </section>

      {examples.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Examples</h2>
          <ExampleList examples={examples} />
        </section>
      ) : null}

      {grammar.creatorNotes ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Notes</h2>
          <p className="text-sm text-foreground">{grammar.creatorNotes}</p>
        </section>
      ) : null}
    </div>
  );
}
