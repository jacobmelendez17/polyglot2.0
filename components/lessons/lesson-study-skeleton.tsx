import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the study layout's shape — header / scrollable content / fixed footer, same `h-svh` structure — so nothing shifts when the lesson loads (spec 07 §64). */
export function LessonStudySkeleton() {
  return (
    <div className="mx-auto flex h-svh max-w-3xl flex-col px-4">
      <div className="flex shrink-0 items-center justify-between py-6">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-5 w-32" />
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-40 w-full max-w-2xl rounded-lg" />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-4 pt-8 pb-6">
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-1.5 w-8 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}
