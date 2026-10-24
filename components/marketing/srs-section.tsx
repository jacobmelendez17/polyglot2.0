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
          A learning system designed for everyone. Stages are made in a way where
          you can learn right before you forget. If you're someone who likes the addition
          study, there's options for that, too!
        </p>
      </Reveal>
    </section>
  );
}
