import { ItemForecastCard } from "@/components/dashboard/item-forecast-card";
import { LessonsCard } from "@/components/dashboard/lessons-card";
import { LevelProgressCard } from "@/components/dashboard/level-progress-card";
import { PracticeGrid } from "@/components/dashboard/practice-grid";
import { ReviewHistoryCard } from "@/components/dashboard/review-history-card";
import { ReviewsCard } from "@/components/dashboard/reviews-card";
import type { DashboardData } from "@/domains/dashboard";

/**
 * Pure composition of the populated dashboard from an already-resolved
 * `DashboardData`. Kept separate from `dashboard-content.tsx` (the async
 * Clerk/data-fetching boundary) so this layout — and each section's
 * loading/empty/populated behavior — is testable with plain data props.
 */
export function DashboardView({ data }: { data: DashboardData }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LessonsCard lessons={data.lessons} />
            <ReviewsCard reviews={data.reviews} />
          </div>
          <ItemForecastCard forecast={data.forecast} />
          <ReviewHistoryCard reviewHistory={data.reviewHistory} />
        </div>

        <LevelProgressCard levelProgress={data.levelProgress} />
      </div>

      <div className="mt-6">
        <PracticeGrid />
      </div>
    </>
  );
}
