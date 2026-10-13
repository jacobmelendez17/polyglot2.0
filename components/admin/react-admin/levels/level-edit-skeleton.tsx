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
 * Placeholder for the level's metadata form: three fields and a button, the
 * same width as the form, so nothing shifts when it arrives. Plain Tailwind,
 * free of Material UI, because it is also the `next/dynamic` fallback that shows
 * before the React Admin chunk has loaded.
 */
export function LevelEditSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex max-w-xl flex-col gap-4"
    >
      <span className="sr-only">Loading the properties of this level…</span>
      <Block className="h-14" />
      <Block className="h-14" />
      <Block className="h-14" />
      <Block className="h-10 w-24" />
    </div>
  );
}
