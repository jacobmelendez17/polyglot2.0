import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ItemForecastCard } from "@/components/dashboard/item-forecast-card";
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

// The Chart.js-backed StackedBarChart reads theme/color-blind settings via
// `useAppearance()` (`components/dashboard/charts/chart-colors.ts`) — in the
// real app this is always available from the root layout's provider.
function renderCard(forecast: DashboardData["forecast"]) {
  return render(
    <AppearanceProvider>
      <ItemForecastCard forecast={forecast} />
    </AppearanceProvider>,
  );
}

const forecast: DashboardData["forecast"] = {
  "24h": [
    {
      timestamp: "2026-08-30T12:00:00.000Z",
      label: "12p",
      vocabularyCount: 3,
      grammarCount: 1,
    },
  ],
  "7d": [
    {
      timestamp: "2026-08-30T00:00:00.000Z",
      label: "Sun",
      vocabularyCount: 12,
      grammarCount: 5,
    },
  ],
};

describe("ItemForecastCard", () => {
  it("renders the 24-hour range by default, driven by the supplied data", () => {
    renderCard(forecast);

    expect(
      screen.getByRole("img", { name: /12p: 4 items/ }),
    ).toBeInTheDocument();
  });

  it("switches to the 7-day range when toggled", async () => {
    const user = userEvent.setup();
    renderCard(forecast);

    await user.click(screen.getByRole("button", { name: "7 Days" }));

    expect(
      screen.getByRole("img", { name: /Sun: 17 items/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 Days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders an empty state when nothing is forecasted for the selected range", () => {
    renderCard({
      "24h": [
        {
          timestamp: "2026-08-30T12:00:00.000Z",
          label: "12p",
          vocabularyCount: 0,
          grammarCount: 0,
        },
      ],
      "7d": [],
    });

    expect(screen.getByText("No reviews forecasted")).toBeInTheDocument();
  });
});
