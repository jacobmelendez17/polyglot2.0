type LevelPageHeaderProps = {
  levelNumber: number;
};

/**
 * Spec 10 §8 — identifies the current level below the selector. Kept
 * compact and useful, not a marketing-style hero; the curriculum grid
 * below remains the visual focus.
 */
export function LevelPageHeader({ levelNumber }: LevelPageHeaderProps) {
  return <h1 className="font-heading text-2xl font-semibold text-foreground">Level {levelNumber}</h1>;
}
