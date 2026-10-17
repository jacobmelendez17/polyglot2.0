import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const requireUser = vi.hoisted(() => vi.fn());
const getAnalyticsConsent = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/analytics/server", () => ({ getAnalyticsConsent }));
// The switch has its own tests; here it only has to be given the right start.
vi.mock("@/components/settings/privacy/analytics-consent-field", () => ({
  AnalyticsConsentField: (props: {
    initialAccepted: boolean;
    initialRevision: number | null;
  }) => (
    <div
      data-testid="consent-field"
      data-accepted={String(props.initialAccepted)}
      data-revision={String(props.initialRevision)}
    />
  ),
}));

import PrivacySettingsPage from "./page";

beforeEach(() => {
  requireUser.mockReset();
  getAnalyticsConsent.mockReset();
  requireUser.mockResolvedValue({ id: "user-1", isSandbox: false });
  getAnalyticsConsent.mockResolvedValue({
    status: "unknown",
    revision: null,
    needsReview: false,
  });
});

async function renderPage() {
  render(await PrivacySettingsPage());
}

describe("Settings → Privacy page", () => {
  it("reads the choice for the signed-in account from the server", async () => {
    await renderPage();
    expect(getAnalyticsConsent).toHaveBeenCalledWith("user-1");
  });

  it("starts the switch off, with no stored revision, for a learner who has never chosen", async () => {
    await renderPage();

    const field = screen.getByTestId("consent-field");
    expect(field).toHaveAttribute("data-accepted", "false");
    expect(field).toHaveAttribute("data-revision", "null");
    expect(
      screen.queryByText(/The wording on this page changed/),
    ).not.toBeInTheDocument();
  });

  it("starts the switch on, at the stored revision, only for a current acceptance", async () => {
    getAnalyticsConsent.mockResolvedValue({
      status: "accepted",
      revision: 3,
      needsReview: false,
    });
    await renderPage();

    const field = screen.getByTestId("consent-field");
    expect(field).toHaveAttribute("data-accepted", "true");
    expect(field).toHaveAttribute("data-revision", "3");
  });

  it("starts a declined choice off, at its revision", async () => {
    getAnalyticsConsent.mockResolvedValue({
      status: "declined",
      revision: 2,
      needsReview: false,
    });
    await renderPage();

    const field = screen.getByTestId("consent-field");
    expect(field).toHaveAttribute("data-accepted", "false");
    expect(field).toHaveAttribute("data-revision", "2");
  });

  it("asks the learner to choose again, switch off, when the wording changed since they accepted", async () => {
    getAnalyticsConsent.mockResolvedValue({
      status: "unknown",
      revision: 4,
      needsReview: true,
    });
    await renderPage();

    expect(
      screen.getByText(/The wording on this page changed after you last chose/),
    ).toBeInTheDocument();
    const field = screen.getByTestId("consent-field");
    expect(field).toHaveAttribute("data-accepted", "false");
    expect(field).toHaveAttribute("data-revision", "4");
  });

  it("offers no choice to a sandbox persona, and says why", async () => {
    requireUser.mockResolvedValue({ id: "persona-1", isSandbox: true });
    await renderPage();

    expect(screen.queryByTestId("consent-field")).not.toBeInTheDocument();
    expect(
      screen.getByText(/never collected for sandbox personas/),
    ).toBeInTheDocument();
  });

  it("says plainly what may and may not be recorded, and what withdrawing does", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Usage analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "If you turn this on, we may record",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "We never record" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your answers, journal entries, notes or recordings/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your name or email address/)).toBeInTheDocument();
    expect(
      screen.getByText(/stops new events straight away/),
    ).toBeInTheDocument();
    expect(screen.getByText(/not deleted automatically/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "privacy notice" }),
    ).toHaveAttribute("href", "/privacy");
  });
});
