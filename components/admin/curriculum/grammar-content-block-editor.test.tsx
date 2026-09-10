import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GrammarContentBlockEditor } from "@/components/admin/curriculum/grammar-content-block-editor";
import { grammarContentBlockAction } from "@/app/(admin)/admin/curriculum/actions";
import type { GrammarContentBlockSource } from "@/domains/curriculum";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(admin)/admin/curriculum/actions", () => ({ grammarContentBlockAction: vi.fn() }));

const mockedAction = vi.mocked(grammarContentBlockAction);

const blocks: GrammarContentBlockSource[] = [
  { id: "block-1", position: 1, type: "text", body: "Use ser for identity." },
  { id: "block-2", position: 2, type: "example", targetText: "Soy alto.", translation: "I am tall." },
  { id: "block-3", position: 3, type: "note", body: "Not estar." },
];

beforeEach(() => {
  mockedAction.mockReset();
  mockedAction.mockResolvedValue({ ok: true, data: { blockId: "block-4" } });
});

describe("GrammarContentBlockEditor", () => {
  it("adds a text block", async () => {
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={[]} />);

    await user.type(screen.getByLabelText("New block text"), "Use ser for identity.");
    await user.click(screen.getByRole("button", { name: /Add block/ }));

    expect(mockedAction).toHaveBeenCalledWith(
      expect.objectContaining({ mutation: { kind: "create", type: "text", body: "Use ser for identity." } }),
    );
  });

  it("adds an example block as a sentence pair, not a body", async () => {
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={[]} />);

    await user.click(screen.getByRole("combobox", { name: "New block type" }));
    await user.click(screen.getByRole("option", { name: "Example sentence" }));
    await user.type(screen.getByLabelText("New example sentence"), "Soy alto.");
    await user.type(screen.getByLabelText("New example translation"), "I am tall.");
    await user.click(screen.getByRole("button", { name: /Add block/ }));

    expect(mockedAction).toHaveBeenCalledWith(
      expect.objectContaining({ mutation: { kind: "create", type: "example", targetText: "Soy alto.", translation: "I am tall." } }),
    );
  });

  it("refuses to submit an empty block", async () => {
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={[]} />);

    await user.click(screen.getByRole("button", { name: /Add block/ }));

    expect(mockedAction).not.toHaveBeenCalled();
  });

  it("keeps an example's other half when editing one of them", async () => {
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />);

    const translation = screen.getByLabelText("Translation for block 2");
    await user.clear(translation);
    await user.type(translation, "I'm tall.");
    await user.tab();

    // The update replaces the whole block, so the untouched half must be resent.
    expect(mockedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: { kind: "update", blockId: "block-2", type: "example", targetText: "Soy alto.", translation: "I'm tall." },
      }),
    );
  });

  it("does not write when a field is blurred unchanged", async () => {
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />);

    await user.click(screen.getByLabelText("Text for block 1"));
    await user.tab();

    expect(mockedAction).not.toHaveBeenCalled();
  });

  it("reorders by sending the full new order", async () => {
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />);

    await user.click(screen.getByRole("button", { name: "Move block 3 earlier" }));

    expect(mockedAction).toHaveBeenCalledWith(
      expect.objectContaining({ mutation: { kind: "reorder", orderedIds: ["block-1", "block-3", "block-2"] } }),
    );
  });

  it("explains that blocks replace the original explanation field", () => {
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={[]} />);
    expect(screen.getByText(/Adding a block replaces it/)).toBeInTheDocument();
  });

  it("warns that changes are live even on a published item", () => {
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />);
    expect(screen.getByText(/live immediately, even on a published item/)).toBeInTheDocument();
  });

  it("surfaces a rejected mutation", async () => {
    mockedAction.mockResolvedValue({ ok: false, error: { code: "CURRICULUM_VALIDATION_FAILED", message: "Archived items cannot be edited." } });
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />);

    await user.click(screen.getByRole("button", { name: "Delete block 1" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Archived items cannot be edited.");
  });
});
