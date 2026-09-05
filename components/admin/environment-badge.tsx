const ENVIRONMENT_LABELS = {
  development: "DEVELOPMENT",
  preview: "PREVIEW",
} as const;

type NonProductionAppEnv = keyof typeof ENVIRONMENT_LABELS;

type EnvironmentBadgeProps = {
  appEnv: string;
};

/**
 * Spec 11 §60: a visible, non-production indicator so an admin can't
 * mistake a preview/development environment for production. Renders
 * nothing in production. Takes the resolved `APP_ENV` string as a plain
 * prop rather than importing `lib/env.ts` itself — that module also holds
 * server secrets, and only the resolving Server Component should touch it.
 */
export function EnvironmentBadge({ appEnv }: EnvironmentBadgeProps) {
  if (!(appEnv in ENVIRONMENT_LABELS)) return null;

  const label = ENVIRONMENT_LABELS[appEnv as NonProductionAppEnv];

  return (
    <span className="rounded-full border border-state-warning bg-state-warning/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-state-warning">
      {label}
    </span>
  );
}
