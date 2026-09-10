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
 * Polyglot's own teaching explanation and any Wiktionary-derived senses are
 * separate blocks with their own heading and attribution, never one merged
 * paragraph — spec 12/13's "clearly distinguish" rule, which survives the
 * 2026-09-07 "confirmed mapping wins" change: a confirmed sense may *become*
 * the teaching definition, but the reader is still told where it came from.
 */
export function AboutDefinition({ about, languageCode }: AboutDefinitionProps) {
  const hasContent = about.body !== null || about.blocks.length > 0 || about.dictionarySenses.length > 0;

  return (
    <div className="rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/5 sm:p-5">
      <h3 className="font-heading text-xl font-semibold text-foreground">{about.title}</h3>

      <div className="mt-3 flex flex-col gap-4">
        {about.body ? <p className="text-lg leading-relaxed text-foreground">{about.body}</p> : null}

        <GrammarContentBlocks blocks={about.blocks} languageCode={languageCode} />

        {about.dictionarySenses.length > 0 ? (
          <div className="rounded-lg bg-card p-3 ring-1 ring-foreground/10">
            <h4 className="text-sm font-medium text-muted-foreground">Dictionary senses</h4>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4">
              {about.dictionarySenses.map((sense) => (
                <li key={sense.id} className="text-base text-foreground">
                  {sense.gloss}
                  {sense.tags.length > 0 ? <span className="ml-1 text-sm text-muted-foreground">({sense.tags.join(", ")})</span> : null}
                </li>
              ))}
            </ol>
            {about.attribution ? <p className="mt-2 text-sm text-muted-foreground">{about.attribution}</p> : null}
          </div>
        ) : null}

        {hasContent ? null : <p className="text-base text-muted-foreground">No explanation has been written for this item yet.</p>}
      </div>
    </div>
  );
}
