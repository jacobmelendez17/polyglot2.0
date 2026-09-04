import { LevelLink } from "@/components/shared/level-link";
import { LEVEL_NUMBER_MAX, LEVEL_NUMBER_MIN } from "@/domains/curriculum";

const LEVEL_NUMBERS = Array.from({ length: LEVEL_NUMBER_MAX - LEVEL_NUMBER_MIN + 1 }, (_, i) => i + LEVEL_NUMBER_MIN);

type LevelSelectorProps = {
  currentLevel: number;
};

/**
 * The page-level 1-50 selector (spec 10 §6/§7) — substantially denser than
 * the header dropdown, targeting 2-3 rows on desktop by using available
 * width aggressively. `auto-fill`/`minmax` rather than a hardcoded desktop
 * column count, per §6's explicit "respond to available width rather than
 * hardcoding a specific desktop column count."
 */
export function LevelSelector({ currentLevel }: LevelSelectorProps) {
  return (
    <nav aria-label="Levels" className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1">
      {LEVEL_NUMBERS.map((levelNumber) => (
        <LevelLink key={levelNumber} levelNumber={levelNumber} isCurrent={levelNumber === currentLevel} className="h-9" />
      ))}
    </nav>
  );
}
