import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ItemResourceEditor } from "@/components/admin/curriculum/item-resource-editor";
import { itemResourceAction } from "@/app/(admin)/admin/curriculum/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(admin)/admin/curriculum/actions", () => ({ itemResourceAction: vi.fn() }));

const mockedAction = vi.mocked(itemResourceAction);

const resources = [
  { id: "resource-1", label: "Conjugation table", url: "https://example.invalid/ser" },
  { id: "resource-2", label: "Video", url: "https://example.invalid/video" },
];

beforeEach(() => {
  mockedAction.mockReset();
  mockedAction.mockResolvedValue({ ok: true, data: { resourceId: "resource-3" } });
});

describe("ItemResourceEditor", () => {
  it("creates a resource with its label and link", async () => {
    const user = userEvent.setup();
    render(<ItemResourceEditor learningItemId="item-1" resources={[]} />);

    await user.type(screen.getByLabelText("Label"), "Conjugation table");
    await user.type(screen.getByLabelText("Link"), "https://example.invalid/ser");
    await user.click(screen.getByRole("button", { name: /Add resource/ }));

    expect(mockedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        learningItemId: "item-1",
        mutation: { kind: "create", label: "Conjugation table", url: "https://example.invalid/ser" },
      }),
    );
  });

  it("sends a fresh idempotency key with every mutation", async () => {
    const user = userEvent.setup();
    render(<ItemResourceEditor learningItemId="item-1" resources={resources} />);

    await user.click(screen.getByRole("button", { name: "Delete Conjugation table" }));
    await user.click(screen.getByRole("button", { name: "Delete Video" }));

    const [first, second] = mockedAction.mock.calls.map(([input]) => input.idempotencyKey);
    expect(first).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it("reorders by sending the full new order, not a single moved id", async () => {
    const user = userEvent.setup();
    render(<ItemResourceEditor learningItemId="item-1" resources={resources} />);

    await user.click(screen.getByRole("button", { name: "Move Video earlier" }));

    expect(mockedAction).toHaveBeenCalledWith(
      expect.objectContaining({ mutation: { kind: "reorder", orderedIds: ["resource-2", "resource-1"] } }),
    );
  });

  it("cannot move the first resource up or the last one down", () => {
    render(<ItemResourceEditor learningItemId="item-1" resources={resources} />);

    expect(screen.getByRole("button", { name: "Move Conjugation table earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Video later" })).toBeDisabled();
  });

  it("surfaces a rejected mutation instead of appearing to succeed", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      error: { code: "CURRICULUM_VALIDATION_FAILED", message: "Resource links must start with http:// or https://" },
    });
    const user = userEvent.setup();
    render(<ItemResourceEditor learningItemId="item-1" resources={[]} />);

    await user.type(screen.getByLabelText("Label"), "Bad");
    await user.type(screen.getByLabelText("Link"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: /Add resource/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Resource links must start with http:// or https://");
  });

  it("says an item has no resources rather than showing an empty list", () => {
    render(<ItemResourceEditor learningItemId="item-1" resources={[]} />);
    expect(screen.getByText("No resources yet.")).toBeInTheDocument();
  });
});
