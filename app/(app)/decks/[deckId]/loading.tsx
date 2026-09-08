import { Skeleton } from "@/components/ui/skeleton";

/** Matches the detail page's header-plus-list shape so nothing shifts when the deck arrives. */
export default function DeckDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-3 py-6 sm:px-4">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border border-border">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} className="h-14 rounded-none" />
        ))}
      </div>
    </div>
  );
}
