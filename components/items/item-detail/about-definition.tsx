import { GrammarContentBlocks } from "./grammar-content-blocks";
import type { ItemDetailAboutView } from "@/domains/curriculum";

type AboutDefinitionProps = {
  about: ItemDetailAboutView;
  languageCode: string;
};

/**
 * The full-width nested card beneath the four Info cards: `Definition` for
 * vocabulary, `About <grammar point>` for grammar (spec 18).
 *
 * Shows only Polyglot's own teaching explanation — never raw dictionary
 * senses (reverted user decision: a learner-facing "Dictionary senses" list
 * used to render here, alongside the 2026-09-07 "confirmed mapping wins"
 * change that let a dictionary gloss silently replace the teaching
 * definition itself; both are gone now, back to spec 12's original
 * "dictionary content stays out of what a learner is taught" boundary. See
 * `resolveVocabularyPresentation`'s docstring for the full history).
 * Dictionary senses are still visible to an admin, in `DictionaryMappingPanel`.
 */
export function AboutDefinition({ about, languageCode }: AboutDefinitionProps) {
  const hasContent = about.body !== null || about.blocks.length > 0;

  return (
    <div className="rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/5 sm:p-5">
      <h3 className="font-heading text-xl font-semibold text-foreground">
        {about.title}
      </h3>

      <div className="mt-3 flex flex-col gap-4">
        {about.body ? (
          <p className="text-lg leading-relaxed text-foreground">
            {about.body}
          </p>
        ) : null}

        <GrammarContentBlocks
          blocks={about.blocks}
          languageCode={languageCode}
        />

        {hasContent ? null : (
          <p className="text-base text-muted-foreground">
            No explanation has been written for this item yet.
          </p>
        )}
      </div>
    </div>
  );
}
