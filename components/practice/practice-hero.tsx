import { cn } from "@/lib/utils";

/**
 * Decorative falling leaves. Positions, speeds, and delays are fixed data so
 * the server render and the client agree (no hydration mismatch), and each
 * leaf takes a color from the existing token set.
 */
const LEAVES = [
  { left: "4%", color: "bg-practice-listening", duration: 9, delay: 0 },
  { left: "41%", color: "bg-practice-speaking", duration: 11.5, delay: -1.7 },
  { left: "78%", color: "bg-practice-reading", duration: 14, delay: -3.4 },
  { left: "23%", color: "bg-srs-familiar", duration: 16.5, delay: -5.1 },
  { left: "60%", color: "bg-learning-grammar", duration: 9, delay: -6.8 },
  { left: "93%", color: "bg-practice-listening", duration: 11.5, delay: -8.5 },
  { left: "33%", color: "bg-practice-speaking", duration: 14, delay: -10.2 },
  { left: "70%", color: "bg-practice-reading", duration: 16.5, delay: -11.9 },
] as const;

export function PracticeHero() {
  return (
    <section className="practice-canopy relative overflow-hidden px-4 pt-8 pb-6 sm:px-7">
      {LEAVES.map((leaf) => (
        <span
          key={leaf.left}
          aria-hidden="true"
          className={cn(
            "practice-leaf animate-practice-fall pointer-events-none absolute -top-5 h-[9px] w-3.5 rounded-[0_100%_0_100%] opacity-75",
            leaf.color,
          )}
          style={{
            left: leaf.left,
            animationDuration: `${leaf.duration}s`,
            animationDelay: `${leaf.delay}s`,
          }}
        />
      ))}
      <div className="relative mx-auto max-w-[1240px]">
        <h1 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
          Practice
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          Start with today&apos;s walk, or pick a skill and choose any practice
          pinned in its grove.
        </p>
      </div>
    </section>
  );
}
