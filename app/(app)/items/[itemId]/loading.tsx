import { Skeleton } from "@/components/ui/skeleton";

/** Approximates the final layout — never a full-page spinner (matches `/levels/[level]/loading.tsx`'s convention). */
export default function ItemDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-40" />
      </div>

      <Skeleton className="h-20 w-full rounded-lg" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
