import { Reveal } from "@/components/shared/reveal";

export function PillarsSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <h2 className="text-center text-3xl font-semibold text-foreground sm:text-4xl">
        What you study
      </h2>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-xl border border-border bg-card p-6">
            <p className="text-sm font-semibold tracking-wide text-[color:var(--learning-vocabulary)] uppercase">
              Vocabulary
            </p>
            <p className="mt-3 text-muted-foreground">
              Each level introduces 48 vocabulary items across four themed groups of twelve. Every
              word gets its own item page.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Meaning, article, and part of speech</li>
              <li>Pronunciation guidance, IPA, and audio</li>
              <li>Example sentences in context</li>
              <li>Its own place in the shared SRS review schedule</li>
            </ul>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="h-full rounded-xl border border-border bg-card p-6">
            <p className="text-sm font-semibold tracking-wide text-[color:var(--learning-grammar)] uppercase">
              Grammar
            </p>
            <p className="mt-3 text-muted-foreground">
              Each level also introduces 12 grammar points, taught and reviewed with the same
              seriousness as vocabulary — not as supplementary reading.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>A plain-language explanation of the concept</li>
              <li>Example sentences showing it in use</li>
              <li>Practice questions suited to the concept, like translation or word banks</li>
              <li>Its own SRS review schedule, tracked separately from vocabulary</li>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
