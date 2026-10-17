import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setAnalyticsConsentAction } from "@/app/(app)/settings/privacy/actions";

import { AnalyticsConsentField } from "./analytics-consent-field";

vi.mock("@/app/(app)/settings/privacy/actions", () => ({
  setAnalyticsConsentAction: vi.fn(),
}));

const action = vi.mocked(setAnalyticsConsentAction);

function accepted(revision: number) {
  return {
    ok: true as const,
    data: { status: "accepted" as const, revision, needsReview: false },
  };
}

function declined(revision: number) {
  return {
    ok: true as const,
    data: { status: "declined" as const, revision, needsReview: false },
  };
}

beforeEach(() => action.mockReset());

describe("AnalyticsConsentField", () => {
  it("starts off for a learner who has never chosen, with Save and Cancel on screen but disabled", () => {
    render(
      <AnalyticsConsentField initialAccepted={false} initialRevision={null} />,
    );

    expect(
      screen.getByRole("switch", { name: "Share anonymous usage analytics" }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("starts on only for a stored, current acceptance", () => {
    render(<AnalyticsConsentField initialAccepted initialRevision={4} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("changes nothing on the server until Save is pressed", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsConsentField initialAccepted={false} initialRevision={null} />,
    );

    await user.click(screen.getByRole("switch"));

    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(action).not.toHaveBeenCalled();
  });

  it("accepts with the revision the page was given, and says Saved", async () => {
    action.mockResolvedValueOnce(accepted(1));
    const user = userEvent.setup();
    render(
      <AnalyticsConsentField initialAccepted={false} initialRevision={null} />,
    );

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(action).toHaveBeenCalledWith({
      status: "accepted",
      expectedRevision: null,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("names the revision the server returned in the next change, not the one it started with", async () => {
    action
      .mockResolvedValueOnce(accepted(1))
      .mockResolvedValueOnce(declined(2));
    const user = userEvent.setup();
    render(
      <AnalyticsConsentField initialAccepted={false} initialRevision={null} />,
    );

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(action).toHaveBeenNthCalledWith(2, {
      status: "declined",
      expectedRevision: 1,
    });
    await vi.waitFor(() =>
      expect(screen.getByRole("switch")).not.toBeChecked(),
    );
  });

  it("withdraws a stored acceptance, naming its revision", async () => {
    action.mockResolvedValueOnce(declined(5));
    const user = userEvent.setup();
    render(<AnalyticsConsentField initialAccepted initialRevision={4} />);

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(action).toHaveBeenCalledWith({
      status: "declined",
      expectedRevision: 4,
    });
  });

  it("shows the server's words when the choice was changed on another device, and does not move on", async () => {
    action
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "STALE_SETTING",
          message:
            "Your analytics choice was changed on another device. Reload this page to see the current choice.",
        },
      })
      .mockResolvedValueOnce(accepted(8));
    const user = userEvent.setup();
    render(
      <AnalyticsConsentField initialAccepted={false} initialRevision={7} />,
    );

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/changed on another device/),
    ).toBeInTheDocument();
    // Still a pending change: nothing was saved, so Save stays available ...
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    // ... and a retry still names the revision the page was built from, because
    // the server never told this page about a newer one.
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(action).toHaveBeenNthCalledWith(2, {
      status: "accepted",
      expectedRevision: 7,
    });
  });

  it("puts the switch back, without calling the server, on Cancel", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsConsentField initialAccepted={false} initialRevision={null} />,
    );

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(action).not.toHaveBeenCalled();
  });

  it("can be chosen and saved entirely from the keyboard", async () => {
    action.mockResolvedValueOnce(accepted(1));
    const user = userEvent.setup();
    render(
      <AnalyticsConsentField initialAccepted={false} initialRevision={null} />,
    );

    await user.tab();
    expect(screen.getByRole("switch")).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("switch")).toBeChecked();

    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(action).toHaveBeenCalledWith({
      status: "accepted",
      expectedRevision: null,
    });
  });
});
