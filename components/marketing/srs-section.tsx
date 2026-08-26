import { cn } from "@/lib/utils";
import { Reveal } from "@/components/shared/reveal";

type StageColorGroup = "beginner" | "familiar" | "intermediate" | "master" | "fluent";

type SrsStage = {
  name: string;
  position: number;
  interval: string | null;
  colorGroup: StageColorGroup;
};

// Names and intervals are the "Standard Review Intervals" from project-overview.md —
// the accelerated Level 1/2 intervals don't apply to this general, level-agnostic explanation.
const SRS_STAGES: SrsStage[] = [
  { name: "Beginner 1", position: 1, interval: "4 hours", colorGroup: "beginner" },
  { name: "Beginner 2", position: 2, interval: "8 hours", colorGroup: "beginner" },
  { name: "Beginner 3", position: 3, interval: "1 day", colorGroup: "beginner" },
  { name: "Beginner 4", position: 4, interval: "2 days", colorGroup: "beginner" },
  { name: "Familiar 1", position: 5, interval: "1 week", colorGroup: "familiar" },
  { name: "Familiar 2", position: 6, interval: "2 weeks", colorGroup: "familiar" },
  { name: "Intermediate", position: 7, interval: "1 month", colorGroup: "intermediate" },
  { name: "Master", position: 8, interval: "4 months", colorGroup: "master" },
  { name: "Fluent", position: 9, interval: null, colorGroup: "fluent" },
];

// Inline style, not a Tailwind class, so the per-card color always wins over the
// shared `border-border` class regardless of Tailwind's internal utility ordering.
const STAGE_ACCENT_VAR: Record<StageColorGroup, string> = {
  beginner: "var(--srs-beginner)",
  familiar: "var(--srs-familiar)",
  intermediate: "var(--srs-intermediate)",
  master: "var(--srs-master)",
  fluent: "var(--srs-fluent)",
};

export function SrsSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
          One shared schedule for everything you learn
        </h2>
        <p className="mt-3 text-muted-foreground">
          Vocabulary and grammar move through the same nine-stage review schedule. Answer correctly
          and an item advances to the next stage; miss it and it comes back sooner.
        </p>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {SRS_STAGES.map((stage, index) => (
          <Reveal key={stage.name} delayMs={index * 60}>
            <div
              className={cn(
                "h-full rounded-xl border border-l-4 border-border bg-card p-5"
              )}
              style={{ borderLeftColor: STAGE_ACCENT_VAR[stage.colorGroup] }}
            >
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Stage {stage.position} of {SRS_STAGES.length}
              </p>
              <p
                data-testid="srs-stage-name"
                className="mt-1 text-lg font-semibold text-foreground"
              >
                {stage.name}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {stage.interval ? `Next review in ${stage.interval}` : "No further reviews scheduled"}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-8 rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <p>
          A level unlocks once about five out of every six of its vocabulary and grammar items reach
          at least Familiar 1 — for a standard 60-item level, that&apos;s 50 items. Once a level is
          earned it stays unlocked, even if an item&apos;s stage later slips back below Familiar 1.
        </p>
      </Reveal>
    </section>
  );
}
