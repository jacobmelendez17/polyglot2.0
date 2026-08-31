import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviewHistoryCard } from "@/components/dashboard/review-history-card";
import type { DashboardData } from "@/domains/dashboard";

const reviewHistory: DashboardData["reviewHistory"] = {
  "24h": [{ timestamp: "2026-08-30T12:00:00.000Z", label: "12p", completedCount: 4 }],
  "7d": [{ timestamp: "2026-08-30T00:00:00.000Z", label: "Sun", completedCount: 22 }],
  "30d": [{ timestamp: "2026-08-01T00:00:00.000Z", label: "8/1", completedCount: 58 }],
};

describe("ReviewHistoryCard", () => {
  it("renders the 7-day range by default, driven by the supplied data", () => {
    render(<ReviewHistoryCard reviewHistory={reviewHistory} />);

    expect(screen.getByRole("img", { name: /Sun: 22 reviews/ })).toBeInTheDocument();
  });

  it("switches between all three documented ranges", async () => {
    const user = userEvent.setup();
    render(<ReviewHistoryCard reviewHistory={reviewHistory} />);

    await user.click(screen.getByRole("button", { name: "24 Hours" }));
    expect(screen.getByRole("img", { name: /12p: 4 reviews/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "30 Days" }));
    expect(screen.getByRole("img", { name: /8\/1: 58 reviews/ })).toBeInTheDocument();
  });

  it("renders an empty state when there is no history for the selected range", () => {
    render(
      <ReviewHistoryCard
        reviewHistory={{
          "24h": [],
          "7d": [{ timestamp: "2026-08-30T00:00:00.000Z", label: "Sun", completedCount: 0 }],
          "30d": [],
        }}
      />
    );

    expect(screen.getByText("No review history yet")).toBeInTheDocument();
  });
});
