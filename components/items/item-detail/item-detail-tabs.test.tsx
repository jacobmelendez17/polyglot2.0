import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ItemDetailTabs } from "@/components/items/item-detail/item-detail-tabs";
import { ResourcesSection } from "@/components/items/item-detail/resources-section";
import { itemDetailSections } from "@/domains/curriculum";

describe("ItemDetailTabs", () => {
  it("marks the active section without claiming to be a tablist", () => {
    render(<ItemDetailTabs sections={itemDetailSections("page")} activeSection="examples" onSelect={() => {}} variant="full" />);

    // Anchor navigation, not panels that show and hide — so `aria-current`,
    // never `role="tab"`, which would misdescribe the behavior.
    expect(screen.getByRole("button", { name: "Examples" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Info" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("reports the selected section to its owner", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ItemDetailTabs sections={itemDetailSections("page")} activeSection="info" onSelect={onSelect} variant="full" />);

    await user.click(screen.getByRole("button", { name: "Resources" }));

    expect(onSelect).toHaveBeenCalledWith("resources");
  });

  it("drops out of the tab order entirely when disabled", () => {
    render(<ItemDetailTabs sections={itemDetailSections("page")} activeSection="info" onSelect={() => {}} variant="compact" disabled />);

    expect(screen.getByRole("button", { name: "Info" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Info" })).toHaveAttribute("tabindex", "-1");
  });

  it("omits Progress in lesson mode", () => {
    render(<ItemDetailTabs sections={itemDetailSections("lesson")} activeSection="info" onSelect={() => {}} variant="full" />);

    expect(screen.queryByRole("button", { name: "Progress" })).not.toBeInTheDocument();
  });
});

describe("ResourcesSection", () => {
  it("opens each resource externally and says so in its accessible name", () => {
    render(<ResourcesSection resources={[{ id: "resource-1", label: "Conjugation table", url: "https://example.invalid/ser" }]} />);

    const link = screen.getByRole("link", { name: "Conjugation table (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://example.invalid/ser");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("says an item has no resources rather than rendering an empty list", () => {
    render(<ResourcesSection resources={[]} />);
    expect(screen.getByText("No additional resources for this item yet.")).toBeInTheDocument();
  });
});
