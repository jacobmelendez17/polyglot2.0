import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UsageContextEditor } from "@/components/admin/curriculum/usage-context-editor";
import { itemExampleAction } from "@/app/(admin)/admin/curriculum/actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(admin)/admin/curriculum/actions", () => ({
  itemExampleAction: vi.fn(),
  seedUsageContextsAction: vi.fn(),
  usageContextAction: vi.fn(),
}));

const mockedExample = vi.mocked(itemExampleAction);

const CONTEXT_ID = "11111111-1111-4111-8111-111111111111";
const EXAMPLE_ID = "22222222-2222-4222-8222-222222222222";

function renderEditor() {
  return render(
    <UsageContextEditor
      learningItemId="item-1"
      itemType="grammar"
      canSeedFromDictionary={false}
      contexts={[
        {
          id: CONTEXT_ID,
          label: "como",
          note: null,
          position: 1,
          sourceForm: null,
        },
      ]}
      examples={[
        {
          id: EXAMPLE_ID,
          usageContextId: null,
          position: 1,
          targetText: "Yo tambien quiero ir.",
          translation: "I also want to go.",
        },
      ]}
    />,
  );
}

beforeEach(() => {
  mockedExample.mockReset();
  refresh.mockReset();
  mockedExample.mockResolvedValue({
    ok: true,
    data: { exampleId: EXAMPLE_ID },
  });
});

describe("UsageContextEditor — editing an example", () => {
  it("edits an existing example in place and saves it as an update, not a delete + create", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Edit example Yo tambien quiero ir.",
      }),
    );
    const sentence = screen.getByLabelText("Example sentence");
    expect(sentence).toHaveValue("Yo tambien quiero ir.");
    await user.clear(sentence);
    await user.type(sentence, "Yo también quiero ir.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedExample).toHaveBeenCalledTimes(1);
    expect(mockedExample).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: {
          kind: "update",
          exampleId: EXAMPLE_ID,
          targetText: "Yo también quiero ir.",
          translation: "I also want to go.",
          usageContextId: null,
        },
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("only allows Save once something changed and nothing is blank", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Edit example Yo tambien quiero ir.",
      }),
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Example translation"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(screen.getByLabelText("Example translation"), "Me too.");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("Cancel discards the edit without calling the server", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Edit example Yo tambien quiero ir.",
      }),
    );
    await user.type(screen.getByLabelText("Example sentence"), " extra");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockedExample).not.toHaveBeenCalled();
    expect(screen.getByText("Yo tambien quiero ir.")).toBeInTheDocument();
  });

  it("can move an example to another tab while editing it", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Edit example Yo tambien quiero ir.",
      }),
    );
    await user.click(screen.getByRole("combobox", { name: "Example tab" }));
    await user.click(screen.getByRole("option", { name: "como" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedExample).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          kind: "update",
          usageContextId: CONTEXT_ID,
        }),
      }),
    );
  });
});
