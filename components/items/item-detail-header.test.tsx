import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ItemDetailHeader } from "@/components/items/item-detail-header";

describe("ItemDetailHeader", () => {
  it("renders the primary/secondary text, a link back to the level, and no archived badge for a published item", () => {
    render(<ItemDetailHeader itemType="vocabulary" primary="el gato" secondary="cat" levelNumber={2} groupName="Animals" status="published" />);

    expect(screen.getByRole("heading", { name: "el gato" })).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Level 2/ })).toHaveAttribute("href", "/levels/2");
    expect(screen.getByText("Vocabulary")).toBeInTheDocument();
    expect(screen.getByText("· Animals")).toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("shows an archived badge, with icon and text, for an archived item", () => {
    render(<ItemDetailHeader itemType="grammar" primary="Ser vs. Estar" secondary="to be" levelNumber={5} status="archived" />);

    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("Grammar")).toBeInTheDocument();
  });

  it("omits the group separator entirely when no group is given (grammar has none)", () => {
    render(<ItemDetailHeader itemType="grammar" primary="Ser vs. Estar" secondary="to be" levelNumber={5} status="published" />);

    expect(screen.queryByText("·", { exact: false })).not.toBeInTheDocument();
  });
});
