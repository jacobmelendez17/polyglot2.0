import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the review layout's shape so nothing shifts when the session loads (spec 09 §18 — shape-matched skeletons, no full-page spinner). */
export function ReviewLoadingSkeleton() {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-1 w-40 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-64 max-w-md" />
        <div className="flex gap-1">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-11 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
