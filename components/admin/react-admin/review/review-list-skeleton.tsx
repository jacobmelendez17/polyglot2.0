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
 * Placeholder for the review queue: table-shaped, so nothing shifts when data
 * arrives. Plain Tailwind, free of Material UI, because it is also the
 * `next/dynamic` fallback that shows before the React Admin chunk has loaded.
 */
export function ReviewListSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the review queue…</span>
      <div className="overflow-hidden rounded-xl border border-border">
        <Block className="h-10 rounded-none" />
        {Array.from({ length: 6 }, (_, index) => (
          <Block key={index} className="mt-px h-12 rounded-none" />
        ))}
      </div>
    </div>
  );
}
