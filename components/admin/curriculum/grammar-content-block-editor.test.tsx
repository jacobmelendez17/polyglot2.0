import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GrammarContentBlockEditor } from "@/components/admin/curriculum/grammar-content-block-editor";
import { saveGrammarContentBlocksAction } from "@/app/(admin)/admin/curriculum/actions";
import type { GrammarContentBlockSource } from "@/domains/curriculum";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/app/(admin)/admin/curriculum/actions", () => ({
  saveGrammarContentBlocksAction: vi.fn(),
}));

const mockedSave = vi.mocked(saveGrammarContentBlocksAction);

const blocks: GrammarContentBlockSource[] = [
  { id: "block-1", position: 1, type: "text", body: "Use ser for identity." },
  {
    id: "block-2",
    position: 2,
    type: "example",
    targetText: "Soy alto.",
    translation: "I am tall.",
  },
  { id: "block-3", position: 3, type: "note", body: "Not estar." },
];

beforeEach(() => {
  mockedSave.mockReset();
  refresh.mockReset();
  mockedSave.mockResolvedValue({ ok: true, data: { blocks } });
});

describe("GrammarContentBlockEditor", () => {
  it("shows an added block in the list straight away, marked New, without saving yet", async () => {
    const user = userEvent.setup();
    render(<GrammarContentBlockEditor learningItemId="item-1" blocks={[]} />);

    await user.type(
      screen.getByLabelText("New block text"),
      "Use ser for identity.",
    );
    await user.click(screen.getByRole("button", { name: /Add block/ }));

    expect(screen.getByLabelText("Text for block 1")).toHaveValue(
      "Use ser for identity.",
    );
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByLabelText("New block text")).toHaveValue("");
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("only offers Save once there is something to save", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Text for block 1"), "!");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("saves the whole list in one call — new blocks without an id, existing ones with theirs", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    await user.click(screen.getByRole("combobox", { name: "New block type" }));
    await user.click(screen.getByRole("option", { name: "Example sentence" }));
    await user.type(screen.getByLabelText("New example sentence"), "Es alta.");
    await user.type(
      screen.getByLabelText("New example translation"),
      "She is tall.",
    );
    await user.click(screen.getByRole("button", { name: /Add block/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({
        learningItemId: "item-1",
        blocks: [
          { id: "block-1", type: "text", body: "Use ser for identity." },
          {
            id: "block-2",
            type: "example",
            targetText: "Soy alto.",
            translation: "I am tall.",
          },
          { id: "block-3", type: "note", body: "Not estar." },
          {
            type: "example",
            targetText: "Es alta.",
            translation: "She is tall.",
          },
        ],
      }),
    );
  });

  it("confirms what was saved and refreshes the page behind the dialog", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    await user.type(screen.getByLabelText("Text for block 1"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Saved — 3 blocks live"),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the staged changes and shows the error when saving fails", async () => {
    mockedSave.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN", message: "Something went wrong." },
    });
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    await user.type(screen.getByLabelText("Text for block 1"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong.",
    );
    expect(screen.getByLabelText("Text for block 1")).toHaveValue(
      "Use ser for identity.!",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reorders with the arrow buttons and saves the new order", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Move block 1 later" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    const sent = mockedSave.mock.calls[0]![0].blocks.map((block) => block.id);
    expect(sent).toEqual(["block-2", "block-1", "block-3"]);
  });

  it("deletes a block from the list and leaves it out of the save", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete block 2" }));
    expect(screen.queryByLabelText("Sentence for block 2")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(
      mockedSave.mock.calls[0]![0].blocks.map((block) => block.id),
    ).toEqual(["block-1", "block-3"]);
  });

  it("won't save a block whose text has been cleared", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    await user.clear(screen.getByLabelText("Text for block 1"));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText(/needs its text filled in/)).toBeInTheDocument();
  });

  it("discard puts the list back to what was saved", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete block 1" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByLabelText("Text for block 1")).toHaveValue(
      "Use ser for identity.",
    );
  });

  it("previews the 'word' emphasis shortcut only for blocks that use it", async () => {
    const user = userEvent.setup();
    render(
      <GrammarContentBlockEditor learningItemId="item-1" blocks={blocks} />,
    );

    expect(screen.queryByText("Preview")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Text for block 1"), " 'ser' here");

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("ser").tagName).toBe("STRONG");
  });
});
