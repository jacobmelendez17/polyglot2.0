import { cn } from "@/lib/utils";

type OverviewSkeletonProps = {
  /** The stat row only renders for accounts that may see curriculum counts; unknown until loaded, so the skeleton assumes the common (Admin) shape. */
  showStats?: boolean;
};

function Block({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-xl bg-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * Loading placeholder for the Overview (ui-context.md "Interface States").
 * Plain Tailwind, deliberately free of Material UI: it is both the
 * `next/dynamic` fallback that shows *before* the React Admin chunk has
 * loaded and the in-screen loading state after, so the two are literally the
 * same markup and sized like the real content — nothing shifts when data
 * arrives.
 */
export function OverviewSkeleton({ showStats = true }: OverviewSkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the admin overview…</span>
      {showStats ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Block key={index} className="h-[5.25rem]" />
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Block key={index} className="h-[5.25rem]" />
        ))}
      </div>
    </div>
  );
}
