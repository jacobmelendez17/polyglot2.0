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
 * Placeholder for an Admin list: table-shaped, so nothing shifts when the data
 * arrives. `label` is what assistive technology hears while it shows.
 *
 * Plain Tailwind, free of Material UI, on purpose: it is also the
 * `next/dynamic` fallback that shows before the React Admin chunk has loaded.
 */
export function ListSkeleton({
  label,
  rows = 5,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="overflow-hidden rounded-xl border border-border">
        <Block className="h-10 rounded-none" />
        {Array.from({ length: rows }, (_, index) => (
          <Block key={index} className="mt-px h-12 rounded-none" />
        ))}
      </div>
    </div>
  );
}

/** Placeholder for an Admin form: `fields` inputs and a button, the same width as the form. Same constraints as `ListSkeleton`. */
export function FormSkeleton({
  label,
  fields = 3,
}: {
  label: string;
  fields?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex max-w-xl flex-col gap-4"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: fields }, (_, index) => (
        <Block key={index} className="h-14" />
      ))}
      <Block className="h-10 w-24" />
    </div>
  );
}
