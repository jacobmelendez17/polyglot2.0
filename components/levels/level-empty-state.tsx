type LevelEmptyStateProps = {
  message: string;
};

/** Spec 10 §29 — an empty section is normal, not an error; never fabricated placeholder curriculum. */
export function LevelEmptyState({ message }: LevelEmptyStateProps) {
  return <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">{message}</p>;
}
