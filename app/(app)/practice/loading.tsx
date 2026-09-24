import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the hub's real shape (hero, walk, filter, four groves, two feature cards) so nothing shifts when data arrives. */
export default function PracticeLoading() {
  return (
    <>
      <div className="px-4 pt-8 pb-6 sm:px-7">
        <div className="mx-auto max-w-[1240px]">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-3 py-6 sm:px-7">
        <Skeleton className="h-52 rounded-xl" />
        <div className="flex flex-wrap gap-2.5">
          {[0, 1, 2, 3, 4].map((sign) => (
            <Skeleton key={sign} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((grove) => (
            <Skeleton key={grove} className="h-72 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((card) => (
            <Skeleton key={card} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    </>
  );
}
