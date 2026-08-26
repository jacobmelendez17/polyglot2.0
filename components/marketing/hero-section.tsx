import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";

// Decorative only (ui-context.md: "Multilingual words around the hero... Languages
// saying forms of hello") — not a product claim, so it doesn't need to trace to
// project-overview.md the way the rest of this page's copy does.
const GREETING_WORDS = [
  { text: "Hola", lang: "Spanish" },
  { text: "Bonjour", lang: "French" },
  { text: "Ciao", lang: "Italian" },
  { text: "Olá", lang: "Portuguese" },
  { text: "Hallo", lang: "German" },
  { text: "こんにちは", lang: "Japanese" },
  { text: "안녕하세요", lang: "Korean" },
  { text: "你好", lang: "Mandarin" },
  { text: "Привет", lang: "Russian" },
  { text: "नमस्ते", lang: "Hindi" },
] as const;

const FLOATING_SPOTS = [
  { top: "8%", left: "5%", durationS: 7.5 },
  { top: "16%", left: "84%", durationS: 9 },
  { top: "68%", left: "6%", durationS: 8 },
  { top: "74%", left: "86%", durationS: 10 },
  { top: "42%", left: "91%", durationS: 6.5 },
  { top: "38%", left: "2%", durationS: 8.5 },
] as const;

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 py-20 text-center sm:py-28">
      <FloatingGreetings />

      <Reveal className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6">
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

      <GreetingMarquee />
    </section>
  );
}

// Purely decorative background text — hidden from assistive technology per
// ui-context.md's accessibility rule for decorative language content.
function FloatingGreetings() {
  const picks = [
    GREETING_WORDS[0],
    GREETING_WORDS[2],
    GREETING_WORDS[5],
    GREETING_WORDS[6],
    GREETING_WORDS[8],
    GREETING_WORDS[3],
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden select-none sm:block"
    >
      {picks.map((greeting, index) => {
        const spot = FLOATING_SPOTS[index];
        return (
          <span
            key={greeting.lang}
            className="animate-float absolute text-2xl text-[color:var(--accent-peach)] opacity-60 sm:text-4xl"
            style={{ top: spot.top, left: spot.left, animationDuration: `${spot.durationS}s` }}
          >
            {greeting.text}
          </span>
        );
      })}
    </div>
  );
}

function GreetingMarquee() {
  const track = [...GREETING_WORDS, ...GREETING_WORDS];

  return (
    <div
      aria-hidden="true"
      className="relative z-10 mt-14 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]"
    >
      <div className="animate-marquee flex w-max gap-10">
        {track.map((greeting, index) => (
          <span key={index} className="flex shrink-0 items-baseline gap-2">
            <span className="text-lg font-medium text-foreground">{greeting.text}</span>
            <span className="text-xs tracking-wide text-muted-foreground uppercase">
              {greeting.lang}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
