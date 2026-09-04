import { Skeleton } from "@/components/ui/skeleton";

/** Spec 10 §28 — preserves the selector area and approximates the default grid density; never a full-page spinner. */
export default function LevelLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 sm:px-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1">
        {Array.from({ length: 50 }).map((_, index) => (
          <Skeleton key={index} className="h-9 rounded-md" />
        ))}
      </div>

      <Skeleton className="h-8 w-32" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-24" />
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/5] rounded-lg" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-28" />
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 16 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/5] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
