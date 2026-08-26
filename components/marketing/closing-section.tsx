import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";

export function ClosingSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <Reveal className="rounded-2xl bg-[var(--bg-warm)] px-6 py-16 text-center sm:px-12">
        <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
          Start learning Spanish the structured way
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Create a free account to start your curriculum, or explore Level 1 in the demo first —
          no account required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="rounded-full">
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/demo">Try the demo</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
