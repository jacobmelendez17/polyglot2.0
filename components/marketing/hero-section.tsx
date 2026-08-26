import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";

export function HeroSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <h1 className="text-balance text-4xl leading-tight font-semibold text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
          say <span className="text-[color:var(--accent-primary-hover)]">hola</span> to fluency
        </h1>
        <p className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
          Polyglot teaches Spanish through a structured curriculum where vocabulary and grammar are
          equally important study items. Every word and grammar point you learn is scheduled for
          review by a spaced-repetition system, so what you learn actually sticks.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="rounded-full">
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/demo">Try the demo</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Latin American Spanish, focused on Mexican usage.
        </p>
      </Reveal>
    </section>
  );
}
