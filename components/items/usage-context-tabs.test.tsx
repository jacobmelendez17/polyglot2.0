import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UsageContextTabs, type UsageContextExample } from "@/components/items/usage-context-tabs";

const COMO = { id: "ctx-como", label: "como", note: "first-person singular present" };
const COMES = { id: "ctx-comes", label: "comes", note: null };

function example(targetText: string, context: UsageContextExample["usageContext"]): UsageContextExample {
  return { targetText, translation: `${targetText} (translated)`, usageContext: context };
}

describe("UsageContextTabs", () => {
  it("shows one tab per usage context, plus General for ungrouped examples", () => {
    render(
      <UsageContextTabs
        usageContexts={[COMO, COMES]}
        examples={[example("Yo como pan.", COMO), example("Tú comes.", COMES), example("Comer es vivir.", null)]}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["como", "comes", "General"]);
  });

  it("shows only the active tab's examples, and switches on click", async () => {
    render(<UsageContextTabs usageContexts={[COMO, COMES]} examples={[example("Yo como pan.", COMO), example("Tú comes.", COMES)]} />);

    expect(screen.getByText("Yo como pan.")).toBeInTheDocument();
    expect(screen.queryByText("Tú comes.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "comes" }));
    expect(screen.getByText("Tú comes.")).toBeInTheDocument();
    expect(screen.queryByText("Yo como pan.")).not.toBeInTheDocument();
  });

  it("explains a form's usage when the dictionary described it", () => {
    render(<UsageContextTabs usageContexts={[COMO]} examples={[example("Yo como pan.", COMO)]} />);
    expect(screen.getByText("first-person singular present")).toBeInTheDocument();
  });

  it("renders a plain list, with no tabs at all, when a word has only ungrouped examples", () => {
    // Every word today. Tabs should grow out of the content rather than being
    // chrome the content has to fill.
    render(<UsageContextTabs usageContexts={[]} examples={[example("El gato duerme.", null)]} />);

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByText("El gato duerme.")).toBeInTheDocument();
  });

  it("still offers a context that has no examples yet, rather than hiding the form", async () => {
    render(<UsageContextTabs usageContexts={[COMO, COMES]} examples={[example("Yo como pan.", COMO)]} />);

    await userEvent.click(screen.getByRole("tab", { name: "comes" }));
    expect(screen.getByText(/no examples for this form yet/i)).toBeInTheDocument();
  });

  it("renders nothing when there is nothing to show", () => {
    const { container } = render(<UsageContextTabs usageContexts={[]} examples={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the active tab for assistive technology, not just visually", async () => {
    render(<UsageContextTabs usageContexts={[COMO, COMES]} examples={[example("Yo como pan.", COMO)]} />);

    expect(screen.getByRole("tab", { name: "como" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "comes" }));
    expect(screen.getByRole("tab", { name: "comes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "como" })).toHaveAttribute("aria-selected", "false");
  });
});
