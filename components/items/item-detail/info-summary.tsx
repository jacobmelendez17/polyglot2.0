import type { ReactNode } from "react";

import { PronunciationButton } from "@/components/shared/pronunciation-button";
import { EMPTY_FIELD } from "@/domains/curriculum";
import type { ItemDetailAnswerListView, ItemDetailView } from "@/domains/curriculum";

type InfoSummaryProps = {
  view: ItemDetailView;
  languageCode: string;
};

/**
 * Spec 18's four Info cards: Details, Pronunciation, Synonyms, Variations —
 * four across on desktop, 2x2 at medium widths, stacked on mobile.
 *
 * All four always render, including the empty ones. A card that disappears
 * when it has nothing in it makes the grid reflow differently per item and
 * leaves the learner unsure whether a word has no synonyms or whether the
 * page simply does not show them; an explicit "None yet" answers the
 * question. This is the opposite of the rule the lesson tabs follow for
 * *pronunciation*, where an entirely empty labelled card would read as
 * missing content — here the four-card grid is itself the structure.
 */
export function InfoSummary({ view, languageCode }: InfoSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard title="Details">
        <dl className="flex flex-col gap-2">
          {view.details.map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-medium text-muted-foreground">{field.label}</dt>
              <dd className="mt-0.5 text-sm break-words text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      </SummaryCard>

      <SummaryCard title="Pronunciation">
        {view.pronunciation ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <PronunciationButton
                text={view.pronunciation.spokenText}
                languageCode={languageCode}
                audioUrl={view.pronunciation.audioUrl}
                label={view.headline}
                size="sm"
              />
              <span className="text-sm text-foreground">{view.pronunciation.guide ?? EMPTY_FIELD}</span>
            </div>
            {/* Stored IPA already carries its own delimiters — do not add another pair. */}
            <p className="font-mono text-sm text-muted-foreground">{view.pronunciation.ipa ?? EMPTY_FIELD}</p>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Word Type</dt>
              <dd className="mt-0.5 text-sm text-foreground">{view.pronunciation.wordType ?? EMPTY_FIELD}</dd>
            </div>
          </div>
        ) : (
          <EmptyNote>Grammar points are not pronounced as single words.</EmptyNote>
        )}
      </SummaryCard>

      <SummaryCard title="Synonyms">
        <AnswerList list={view.synonyms} emptyLabel="No synonyms yet." />
      </SummaryCard>

      <SummaryCard title="Variations">
        <AnswerList list={view.variations} emptyLabel="No variations yet." />
      </SummaryCard>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/5">
      <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * Official values and the reader's own, visibly separated. "Yours" is a
 * label, not a color — spec 18 keeps private content distinguishable, and
 * `ui-context.md` forbids communicating anything by color alone.
 */
function AnswerList({ list, emptyLabel }: { list: ItemDetailAnswerListView; emptyLabel: string }) {
  if (list.official.length === 0 && list.personal.length === 0) {
    return <EmptyNote>{emptyLabel}</EmptyNote>;
  }

  return (
    <div className="flex flex-col gap-2">
      {list.official.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {list.official.map((value) => (
            <li key={value} className="rounded-md bg-card px-2 py-0.5 text-sm text-foreground ring-1 ring-foreground/10">
              {value}
            </li>
          ))}
        </ul>
      ) : null}

      {list.personal.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Yours</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {list.personal.map((value) => (
              <li key={value} className="rounded-md bg-primary/10 px-2 py-0.5 text-sm text-foreground ring-1 ring-primary/20">
                {value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
