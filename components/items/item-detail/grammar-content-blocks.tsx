import { PronunciationButton } from "@/components/shared/pronunciation-button";
import type { GrammarContentBlockSource } from "@/domains/curriculum";

type GrammarContentBlocksProps = {
  blocks: GrammarContentBlockSource[];
  languageCode: string;
};

/**
 * Spec 18's three ordered About block types for grammar.
 *
 * Text is unbordered prose, an Example is an outlined sentence pair with
 * audio, and a Polyglot Note is a highlighted aside. The note uses the
 * warning token for its accent, which is `ui-context.md`'s yellow — and
 * carries a visible "Polyglot note" label, so the distinction survives for a
 * reader who cannot see the accent at all.
 */
export function GrammarContentBlocks({
  blocks,
  languageCode,
}: GrammarContentBlocksProps) {
  if (blocks.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block) => {
        if (block.type === "example") {
          return (
            <div
              key={block.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-lg text-foreground">{block.targetText}</p>
                <p className="mt-1 text-base text-muted-foreground">
                  {block.translation}
                </p>
              </div>
              <PronunciationButton
                text={block.targetText}
                languageCode={languageCode}
                label={block.targetText}
                size="sm"
              />
            </div>
          );
        }

        if (block.type === "note") {
          return (
            <div
              key={block.id}
              className="rounded-lg border border-state-warning/50 bg-state-warning/5 px-4 py-3"
            >
              <p className="text-sm font-semibold tracking-wide text-state-warning uppercase">
                Polyglot note
              </p>
              <p className="mt-1 text-base text-foreground">{block.body}</p>
            </div>
          );
        }

        return (
          <p key={block.id} className="text-lg leading-relaxed text-foreground">
            {block.body}
          </p>
        );
      })}
    </div>
  );
}
