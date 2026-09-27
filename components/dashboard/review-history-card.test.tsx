import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviewHistoryCard } from "@/components/dashboard/review-history-card";
import type { DashboardData } from "@/domains/dashboard";
import { AppearanceProvider } from "@/lib/appearance/appearance-context";

// jsdom has no matchMedia at all; AppearanceProvider's effect calls it
// unconditionally to resolve `system` theme. Same per-file convention as
// components/onboarding/onboarding-flow.test.tsx.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

// The Chart.js-backed LineChart reads theme/color-blind settings via
// `useAppearance()` (`components/dashboard/charts/chart-colors.ts`) — in the
// real app this is always available from the root layout's provider.
function renderCard(reviewHistory: DashboardData["reviewHistory"]) {
  return render(
    <AppearanceProvider>
      <ReviewHistoryCard reviewHistory={reviewHistory} />
    </AppearanceProvider>,
  );
}

const reviewHistory: DashboardData["reviewHistory"] = {
  "24h": [
    { timestamp: "2026-08-30T12:00:00.000Z", label: "12p", completedCount: 4 },
  ],
  "7d": [
    { timestamp: "2026-08-30T00:00:00.000Z", label: "Sun", completedCount: 22 },
  ],
  "30d": [
    { timestamp: "2026-08-01T00:00:00.000Z", label: "8/1", completedCount: 58 },
  ],
};

describe("ReviewHistoryCard", () => {
  it("renders the 7-day range by default, driven by the supplied data", () => {
    renderCard(reviewHistory);

    expect(
      screen.getByRole("img", { name: /Sun: 22 reviews/ }),
    ).toBeInTheDocument();
  });

  it("switches between all three documented ranges", async () => {
    const user = userEvent.setup();
    renderCard(reviewHistory);

    await user.click(screen.getByRole("button", { name: "24 Hours" }));
    expect(
      screen.getByRole("img", { name: /12p: 4 reviews/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "30 Days" }));
    expect(
      screen.getByRole("img", { name: /8\/1: 58 reviews/ }),
    ).toBeInTheDocument();
  });

  it("renders an empty state when there is no history for the selected range", () => {
    renderCard({
      "24h": [],
      "7d": [
        {
          timestamp: "2026-08-30T00:00:00.000Z",
          label: "Sun",
          completedCount: 0,
        },
      ],
      "30d": [],
    });

    expect(screen.getByText("No review history yet")).toBeInTheDocument();
  });
});
