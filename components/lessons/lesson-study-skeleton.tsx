import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the study layout's shape so nothing shifts when the lesson loads (spec 07 §64). */
export function LessonStudySkeleton() {
  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Skeleton className="h-5 w-24 rounded-md" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-40 w-full max-w-2xl rounded-lg" />
      </div>

      <div className="mt-auto flex flex-col items-center gap-4 pt-8">
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
