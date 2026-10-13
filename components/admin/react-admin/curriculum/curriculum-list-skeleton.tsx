import { cn } from "@/lib/utils";

function Block({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-lg bg-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * Placeholder for the curriculum list, shaped like it (a filter row, then
 * table rows) so nothing shifts when data arrives. Plain Tailwind, free of
 * Material UI, because it is also the `next/dynamic` fallback that shows
 * before the React Admin chunk has loaded.
 */
export function CurriculumListSkeleton({
  withFilters = true,
}: {
  withFilters?: boolean;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading curriculum…</span>
      {withFilters ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Block className="h-10 min-w-48 flex-1" />
          {Array.from({ length: 6 }, (_, index) => (
            <Block key={index} className="h-10 w-32" />
          ))}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border">
        <Block className="h-10 rounded-none" />
        {Array.from({ length: 8 }, (_, index) => (
          <Block key={index} className="mt-px h-10 rounded-none" />
        ))}
      </div>
    </div>
  );
}
