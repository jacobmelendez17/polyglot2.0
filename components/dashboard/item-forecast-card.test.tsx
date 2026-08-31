import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ItemForecastCard } from "@/components/dashboard/item-forecast-card";
import type { DashboardData } from "@/domains/dashboard";

const forecast: DashboardData["forecast"] = {
  "24h": [
    { timestamp: "2026-08-30T12:00:00.000Z", label: "12p", vocabularyCount: 3, grammarCount: 1 },
  ],
  "7d": [
    { timestamp: "2026-08-30T00:00:00.000Z", label: "Sun", vocabularyCount: 12, grammarCount: 5 },
  ],
};

describe("ItemForecastCard", () => {
  it("renders the 24-hour range by default, driven by the supplied data", () => {
    render(<ItemForecastCard forecast={forecast} />);

    expect(screen.getByRole("img", { name: /12p: 4 items/ })).toBeInTheDocument();
  });

  it("switches to the 7-day range when toggled", async () => {
    const user = userEvent.setup();
    render(<ItemForecastCard forecast={forecast} />);

    await user.click(screen.getByRole("button", { name: "7 Days" }));

    expect(screen.getByRole("img", { name: /Sun: 17 items/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 Days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders an empty state when nothing is forecasted for the selected range", () => {
    render(
      <ItemForecastCard
        forecast={{
          "24h": [{ timestamp: "2026-08-30T12:00:00.000Z", label: "12p", vocabularyCount: 0, grammarCount: 0 }],
          "7d": [],
        }}
      />
    );

    expect(screen.getByText("No reviews forecasted")).toBeInTheDocument();
  });
});
