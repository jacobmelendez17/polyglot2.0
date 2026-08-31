import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  createNewUserDashboardFixture,
  createPopulatedDashboardFixture,
} from "@/domains/dashboard";

const NOW = new Date("2026-08-30T12:00:00Z");

describe("DashboardView", () => {
  it("renders every required section for a populated dashboard", () => {
    render(<DashboardView data={createPopulatedDashboardFixture(NOW)} />);

    expect(screen.getByRole("heading", { name: "Lessons" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reviews" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Item Forecast" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review History" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Level Progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Speaking" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Listening" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reading" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Writing" })).toBeInTheDocument();
  });

  it("renders the new-user empty states instead of populated data", () => {
    render(<DashboardView data={createNewUserDashboardFixture(NOW)} />);

    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
    expect(screen.getByText("No reviews forecasted")).toBeInTheDocument();
    expect(screen.getByText("No review history yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start lessons" }).length).toBeGreaterThan(0);
  });
});
