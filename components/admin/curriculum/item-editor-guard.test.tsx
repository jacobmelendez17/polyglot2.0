import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  GuardedLink,
  ItemEditorGuardProvider,
  useItemEditorGuard,
} from "./item-editor-guard";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A minimal consumer that lets a test flip the shared dirty flag on demand. */
function DirtyToggle() {
  const { setDirty } = useItemEditorGuard();
  return (
    <button type="button" onClick={() => setDirty(true)}>
      Make dirty
    </button>
  );
}

describe("useItemEditorGuard", () => {
  it("returns a working no-op outside any provider, rather than throwing", () => {
    function Consumer() {
      const { setDirty } = useItemEditorGuard();
      return (
        <button type="button" onClick={() => setDirty(true)}>
          Make dirty
        </button>
      );
    }
    render(<Consumer />);
    expect(() => fireEvent.click(screen.getByText("Make dirty"))).not.toThrow();
  });
});

describe("GuardedLink (spec 25 §17 — unsaved-changes navigation warning)", () => {
  it("navigates without confirming when nothing is dirty", () => {
    render(
      <ItemEditorGuardProvider>
        <GuardedLink href="/admin/curriculum">Return to Results</GuardedLink>
      </ItemEditorGuardProvider>,
    );
    const confirmSpy = vi.spyOn(window, "confirm");
    const notCancelled = fireEvent.click(screen.getByText("Return to Results"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });

  it("confirms before navigating once the form is dirty, and cancels the click when the admin declines", () => {
    render(
      <ItemEditorGuardProvider>
        <DirtyToggle />
        <GuardedLink href="/admin/curriculum">Return to Results</GuardedLink>
      </ItemEditorGuardProvider>,
    );
    fireEvent.click(screen.getByText("Make dirty"));

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const notCancelled = fireEvent.click(screen.getByText("Return to Results"));
    expect(confirmSpy).toHaveBeenCalledWith(
      "You have unsaved changes. Leave this page and lose them?",
    );
    // fireEvent.click returns false exactly when the handler called preventDefault.
    expect(notCancelled).toBe(false);
  });

  it("lets the navigation through when the admin confirms leaving", () => {
    render(
      <ItemEditorGuardProvider>
        <DirtyToggle />
        <GuardedLink href="/admin/curriculum">Return to Results</GuardedLink>
      </ItemEditorGuardProvider>,
    );
    fireEvent.click(screen.getByText("Make dirty"));

    vi.spyOn(window, "confirm").mockReturnValue(true);
    const notCancelled = fireEvent.click(screen.getByText("Return to Results"));
    expect(notCancelled).toBe(true);
  });
});

describe("ItemEditorGuardProvider's beforeunload listener", () => {
  it("only prevents the tab-close/refresh event once dirty", () => {
    render(
      <ItemEditorGuardProvider>
        <DirtyToggle />
      </ItemEditorGuardProvider>,
    );

    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByText("Make dirty"));

    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });
});
