import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";

const ACCENT_KEYS = ["á", "é", "í", "ó", "ú", "ü", "ñ"] as const;

export function ReviewPreviewSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <h2 className="text-center text-3xl font-semibold text-foreground sm:text-4xl">
        Reviews, distraction-free
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
        No card, no clutter — just the word, the answer, and the tools to type it correctly.
      </p>

      <Reveal className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <button
            type="button"
            disabled
            className="font-medium text-foreground disabled:opacity-100"
          >
            Exit
          </button>
          <div className="h-2 flex-1 rounded-full bg-muted">
            <div className="h-full w-3/5 rounded-full bg-primary" />
          </div>
          <span className="whitespace-nowrap">8 remaining · 94% accuracy</span>
        </div>

        <div className="mt-10 flex flex-col items-center gap-1 text-center">
          <span className="text-sm text-muted-foreground">el</span>
          <span className="text-4xl font-semibold text-foreground sm:text-5xl">gato</span>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <input
            type="text"
            readOnly
            value=""
            placeholder="Type the English meaning"
            aria-label="Answer"
            className="w-full max-w-sm rounded-lg border border-border bg-background px-4 py-2 text-center text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex flex-wrap justify-center gap-2">
            {ACCENT_KEYS.map((char) => (
              <button
                key={char}
                type="button"
                disabled
                className="h-8 w-8 rounded-md border border-border text-sm text-muted-foreground disabled:opacity-100"
              >
                {char}
              </button>
            ))}
          </div>
          <Button type="button" disabled className="rounded-full disabled:opacity-100">
            Submit
          </Button>
        </div>
      </Reveal>

      <p className="mx-auto mt-4 max-w-md text-center text-sm text-muted-foreground">
        Accent keys insert at the cursor, and Enter submits — no mouse required.
      </p>
    </section>
  );
}
