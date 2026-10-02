import { SrsScrollTrail } from "@/components/marketing/srs-scroll-trail";
import { Reveal } from "@/components/shared/reveal";

// Names are the "Standard Review Intervals" stage names from project-overview.md. The landing
// trail deliberately shows stage names only — no wait durations.
// Dot colors step light to dark through the --srs-* tokens, matching the stage badges in the app.
const SRS_STAGES = [
  { name: "Beginner 1", color: "var(--srs-beginner)" },
  { name: "Beginner 2", color: "var(--srs-beginner)" },
  { name: "Beginner 3", color: "var(--srs-beginner)" },
  { name: "Beginner 4", color: "var(--srs-beginner)" },
  { name: "Familiar 1", color: "var(--srs-familiar)" },
  { name: "Familiar 2", color: "var(--srs-familiar)" },
  { name: "Intermediate", color: "var(--srs-intermediate)" },
  { name: "Master", color: "var(--srs-master)" },
  { name: "Fluent", color: "var(--srs-fluent)" },
] as const;

export function SrsSection() {
  return (
    <section aria-label="How the review schedule works">
      <SrsScrollTrail stages={SRS_STAGES} />

      <Reveal className="mx-auto max-w-2xl px-4 pb-16 sm:px-6 sm:pb-20">
        <p className="rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          A level unlocks once about five out of every six of its vocabulary and
          grammar items reach at least Familiar 1 — for a standard 60-item
          level, that&apos;s 50 items. Once a level is earned it stays unlocked,
          even if an item&apos;s stage later slips back below Familiar 1.
        </p>
      </Reveal>
    </section>
  );
}
