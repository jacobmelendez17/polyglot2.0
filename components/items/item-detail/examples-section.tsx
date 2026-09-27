import { AuthoredText } from "@/components/shared/authored-text";
import { stripEmphasisMarks } from "@/lib/authored-text";
import { PronunciationButton } from "@/components/shared/pronunciation-button";
import type { ItemDetailExampleView } from "@/domains/curriculum";

type ExamplesSectionProps = {
  examples: ItemDetailExampleView[];
  languageCode: string;
};

/**
 * Spec 18's Examples section: full-width rows, each with the target
 * sentence, its translation beneath, and a voice button.
 *
 * Every example the item has, flat and in curriculum order — independent of
 * the Context card's pattern grouping above, which shows the same sentences
 * organized by form. The duplication is intentional: Context answers "how is
 * this form used?", Examples answers "show me every sentence".
 */
export function ExamplesSection({
  examples,
  languageCode,
}: ExamplesSectionProps) {
  if (examples.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        No example sentences for this item yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {examples.map((example) => (
        <li
          key={example.id}
          className="flex items-start justify-between gap-3 rounded-xl bg-muted/30 px-4 py-3 ring-1 ring-foreground/5"
        >
          {/* Balances the voice button so the text is truly centered. */}
          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-center">
            <p className="text-lg text-foreground">
              <AuthoredText text={example.targetText} />
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              <AuthoredText text={example.translation} />
            </p>
          </div>
          <PronunciationButton
            text={example.spokenText}
            languageCode={languageCode}
            label={stripEmphasisMarks(example.targetText)}
            size="sm"
          />
        </li>
      ))}
    </ul>
  );
}
