import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LessonItemTabs } from "@/components/lessons/lesson-item-tabs";
import { FIXTURE_LEARNING_ITEMS } from "@/domains/curriculum";

const gato = FIXTURE_LEARNING_ITEMS.find((item) => item.id === "vocab-gato")!;

describe("LessonItemTabs", () => {
  it("switches between Details, Examples, and Resources", async () => {
    const user = userEvent.setup();
    render(<LessonItemTabs item={gato} />);

    expect(screen.getByText("Definition")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Examples" }));
    expect(screen.getByText("El gato duerme.")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Resources" }));
    expect(screen.getByText("No additional resources for this item.")).toBeVisible();
  });

  it("does not render a dead play control when pronunciation audio is unavailable", () => {
    render(<LessonItemTabs item={gato} />);
    expect(screen.queryByRole("button", { name: /play pronunciation/i })).not.toBeInTheDocument();
  });
});
