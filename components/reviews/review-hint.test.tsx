import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviewHint } from "./review-hint";
import type { ReviewHintView } from "@/domains/srs";

describe("ReviewHint", () => {
  it("renders nothing for hide", () => {
    const { container } = render(<ReviewHint hint={{ mode: "hide" }} autoExpand={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for hint mode when the item has no nuance content", () => {
    const { container } = render(<ReviewHint hint={{ mode: "hint", nuance: null }} autoExpand={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hint mode: reveals the nuance only after clicking Show Hint", async () => {
    const user = userEvent.setup();
    render(<ReviewHint hint={{ mode: "hint", nuance: "Used for pets or strays." }} autoExpand={false} />);

    expect(screen.queryByText("Used for pets or strays.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Hint" }));
    expect(screen.getByText("Used for pets or strays.")).toBeInTheDocument();
  });

  it("show mode: reveals the translation only after clicking Show Meaning", async () => {
    const user = userEvent.setup();
    render(<ReviewHint hint={{ mode: "show", translation: "cat" }} autoExpand={false} />);

    expect(screen.queryByText("cat")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Meaning" }));
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("always_show_nuance: visible immediately, no button", () => {
    render(<ReviewHint hint={{ mode: "always_show_nuance", nuance: "Used for pets or strays." }} autoExpand={false} />);
    expect(screen.getByText("Used for pets or strays.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("always_show_nuance: renders nothing when there is no nuance content", () => {
    const { container } = render(<ReviewHint hint={{ mode: "always_show_nuance", nuance: null }} autoExpand={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("more mode: reveals one piece at a time, in Hint Order's order", async () => {
    const hint: ReviewHintView = { mode: "more", order: "nuance_first", translation: "cat", nuance: "Used for pets or strays." };
    const user = userEvent.setup();
    render(<ReviewHint hint={hint} autoExpand={false} />);

    await user.click(screen.getByRole("button", { name: "Show Hint" }));
    expect(screen.getByText("Used for pets or strays.")).toBeInTheDocument();
    expect(screen.queryByText("cat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show Meaning" }));
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("more mode: translation_first reverses the order", async () => {
    const hint: ReviewHintView = { mode: "more", order: "translation_first", translation: "cat", nuance: "Used for pets or strays." };
    const user = userEvent.setup();
    render(<ReviewHint hint={hint} autoExpand={false} />);

    await user.click(screen.getByRole("button", { name: "Show Meaning" }));
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.queryByText("Used for pets or strays.")).not.toBeInTheDocument();
  });

  it("more mode: skips a step with no content instead of a dead button", () => {
    const hint: ReviewHintView = { mode: "more", order: "nuance_first", translation: "cat", nuance: null };
    render(<ReviewHint hint={hint} autoExpand={false} />);
    expect(screen.getByRole("button", { name: "Show Meaning" })).toBeInTheDocument();
  });

  it("autoExpand reveals content immediately without a click", () => {
    render(<ReviewHint hint={{ mode: "hint", nuance: "Used for pets or strays." }} autoExpand={true} />);
    expect(screen.getByText("Used for pets or strays.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("autoExpand reveals both pieces of a more-mode hint at once", () => {
    const hint: ReviewHintView = { mode: "more", order: "nuance_first", translation: "cat", nuance: "Used for pets or strays." };
    render(<ReviewHint hint={hint} autoExpand={true} />);
    expect(screen.getByText("Used for pets or strays.")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });
});
