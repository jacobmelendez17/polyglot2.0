import type { PracticeFeatureView } from "@/domains/practice";

import { PracticeAction } from "./practice-action";
import { PRACTICE_FEATURE_ICONS } from "./practice-icons";

type PracticeFeatureCardProps = {
  feature: PracticeFeatureView;
  index: number;
};

const TONE_BY_FEATURE = {
  tests: "progress",
  // Conjugation is Grammar, and Grammar is red everywhere else in the app.
  conjugation: "grammar",
} as const satisfies Record<PracticeFeatureView["id"], string>;

/** Tests and Grammar conjugations: check-and-drill features that sit outside the four skill groves. */
export function PracticeFeatureCard({
  feature,
  index,
}: PracticeFeatureCardProps) {
  const Icon = PRACTICE_FEATURE_ICONS[feature.id];
  const headingId = `practice-feature-${feature.id}`;

  return (
    <article
      aria-labelledby={headingId}
      data-practice-tone={TONE_BY_FEATURE[feature.id]}
      className="practice-sketch animate-practice-rise flex flex-col gap-3 border-t-4 border-t-(--c) bg-card p-5 transition-transform duration-150 hover:-translate-y-1 motion-reduce:transform-none"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="practice-blob flex h-14 w-14 shrink-0 items-center justify-center border-[1.5px] border-(--c) bg-(--c)/20"
          aria-hidden="true"
        >
          <Icon className="h-6 w-6 text-foreground" />
        </span>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {feature.eyebrow}
          </p>
          <h3
            id={headingId}
            className="font-heading text-xl font-semibold text-foreground"
          >
            {feature.title}
          </h3>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{feature.description}</p>

      {feature.id === "tests" ? (
        <p className="rounded-[10px] bg-background px-2.5 py-2 text-sm text-muted-foreground">
          No tests are available yet. Module, theme, and level tests will appear
          here as they open.
        </p>
      ) : (
        <ul aria-label="Tenses covered" className="flex flex-wrap gap-1.5">
          {feature.tags.map((tag) => (
            <li
              key={tag}
              className="practice-sketch rounded-full bg-background px-3 py-1 text-sm"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {feature.lastPracticedLabel ?? "Not tried yet"}
        </span>
        <PracticeAction href={feature.href}>Set up</PracticeAction>
      </div>
    </article>
  );
}
