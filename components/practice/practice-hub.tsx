import {
  filterGroves,
  type PracticeHubView,
  type PracticeSkillFilter,
} from "@/domains/practice";
import { cn } from "@/lib/utils";

import { PracticeFeatureCard } from "./practice-feature-card";
import { PracticeGrove } from "./practice-grove";
import { PracticeSkillFilterNav } from "./practice-skill-filter";
import { PracticeWalkCard } from "./practice-walk-card";

type PracticeHubProps = {
  view: PracticeHubView;
  skillFilter: PracticeSkillFilter;
};

/**
 * Pure composition of the hub from its read model; used directly in tests.
 * A Server Component: nothing here needs client state, since the skill
 * filter is URL state.
 */
export function PracticeHub({ view, skillFilter }: PracticeHubProps) {
  const visibleGroves = filterGroves(view.groves, skillFilter);
  const isFiltered = skillFilter !== "all";

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-3 py-6 sm:px-7">
      <PracticeWalkCard walk={view.walk} />

      <PracticeSkillFilterNav groves={view.groves} active={skillFilter} />

      <div
        className={cn(
          "practice-groves practice-planks practice-sketch grid items-start gap-3.5 p-4 sm:p-[18px]",
          isFiltered
            ? "grid-cols-1 sm:grid-cols-[minmax(0,22.5rem)]"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {visibleGroves.map((grove, index) => (
          <PracticeGrove key={grove.skill} grove={grove} index={index} />
        ))}
      </div>

      <section
        aria-labelledby="practice-check-and-drill"
        className="flex flex-col gap-3"
      >
        <h2
          id="practice-check-and-drill"
          className="font-heading text-lg font-semibold text-foreground"
        >
          Check and drill
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {view.features.map((feature, index) => (
            <PracticeFeatureCard
              key={feature.id}
              feature={feature}
              index={index}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
