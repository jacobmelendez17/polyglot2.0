/**
 * Slide 4's visual demonstration (spec 15): a deck of already-learned
 * vocabulary and grammar cards, cycling, with the optional Know / Don't Know
 * verdicts alternating beneath.
 *
 * Both card types appear on purpose — a Polyglot deck may hold vocabulary,
 * grammar, or both — and the caption on the slide itself (see
 * `onboarding-slides.ts`) is what carries spec 15's requirement that decks
 * read as *supplementary* practice rather than the main progression.
 *
 * Purely visual, prop-free, and replaceable on its own (see
 * `welcome-slide.tsx` for the full rationale).
 */
export function DecksSlide() {
  return (
    <div aria-hidden="true" className="flex h-56 w-full flex-col items-center justify-center gap-4 sm:h-72">
      <div className="relative h-28 w-52 sm:h-32 sm:w-60">
        {/* Two static cards behind give the stack depth; only the top one cycles. */}
        <span className="absolute inset-x-4 top-3 h-full rounded-xl bg-card/70 ring-1 ring-foreground/10" />
        <span className="absolute inset-x-2 top-1.5 h-full rounded-xl bg-card/85 ring-1 ring-foreground/10" />

        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl border-t-2 border-t-learning-vocabulary bg-card ring-1 ring-foreground/10 animate-ob-card">
          <span className="font-heading text-xl font-semibold text-foreground sm:text-2xl">el agua</span>
          <span className="text-sm text-muted-foreground">water</span>
          <span className="mt-1 rounded-md bg-learning-vocabulary/15 px-2 py-0.5 text-[0.65rem] font-medium text-foreground">
            Vocabulary
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full bg-card px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-foreground/10 animate-ob-verdict">
          Don&rsquo;t Know
        </span>
        <span className="rounded-full bg-primary/20 px-3 py-1.5 text-xs font-medium text-foreground animate-ob-verdict ob-delay-3">
          Know
        </span>
      </div>
    </div>
  );
}
