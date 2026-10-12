import {
  QueryClient,
  focusManager,
  type QueryClientConfig,
} from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdminMe, AdminOverview } from "@/domains/admin";
import { buildAdminMe, buildAdminOverview } from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { AdminApiError } from "../admin-api-error";
import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { OverviewScreen } from "./overview-screen";

const COUNTS = { published: 55, pending: 3, draft: 2, archived: 1 };

function me(role: UserRole): AdminMe {
  return buildAdminMe({ id: `user-${role}`, role });
}

function overviewFor(role: UserRole): AdminOverview {
  return buildAdminOverview(
    { role, activeLanguageId: "lang-1" },
    // The real server only loads counts for someone who may manage curriculum;
    // `buildAdminOverview` nulls them either way.
    COUNTS,
  );
}

type Responder<T> = () => Promise<T>;

function setup({
  role = "admin",
  loadOverview = async () => overviewFor(role),
  loadMe = async () => me(role),
}: {
  role?: UserRole;
  loadOverview?: Responder<AdminOverview>;
  loadMe?: Responder<AdminMe>;
} = {}) {
  const request = vi.fn<() => Promise<AdminOverview>>(() => loadOverview());
  const fetchMe = vi.fn(loadMe);
  const redirect = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  } satisfies QueryClientConfig);

  const view = render(
    <ReactAdminProvider
      signInPath="/sign-in"
      queryClient={queryClient}
      dataProvider={createAdminDataProvider({ request: request as never })}
      authProvider={createAdminAuthProvider({
        fetchMe,
        signInUrl: () => "/sign-in?redirect_url=%2Fadmin",
        redirect,
      })}
    >
      <OverviewScreen />
    </ReactAdminProvider>,
  );
  return { ...view, request, fetchMe, redirect, queryClient };
}

function statValue(label: string): string {
  const term = screen.getByText(label, { selector: "dt" });
  return within(term.parentElement!).getByRole("definition").textContent ?? "";
}

describe("OverviewScreen — role matrix", () => {
  it("shows an admin the curriculum counts and every shortcut", async () => {
    setup({ role: "admin" });

    expect(
      await screen.findByLabelText("Curriculum status counts"),
    ).toBeVisible();
    expect(statValue("Published")).toBe("55");
    expect(statValue("Pending")).toBe("3");
    expect(statValue("Draft")).toBe("2");
    expect(statValue("Archived")).toBe("1");

    const shortcuts = screen.getByLabelText("Admin shortcuts");
    expect(
      within(shortcuts).getByRole("link", { name: /Curriculum/ }),
    ).toHaveAttribute("href", "/admin/curriculum");
    expect(
      within(shortcuts).getByRole("link", { name: /Logs/ }),
    ).toHaveAttribute("href", "/admin/logs");
    expect(
      within(shortcuts).getByRole("link", { name: /Sandbox/ }),
    ).toHaveAttribute("href", "/admin/sandbox");
  });

  it("shows a writer the counts and Curriculum only — not Logs or Sandbox", async () => {
    setup({ role: "writer" });

    expect(
      await screen.findByLabelText("Curriculum status counts"),
    ).toBeVisible();
    const shortcuts = screen.getByLabelText("Admin shortcuts");
    expect(within(shortcuts).getAllByRole("link")).toHaveLength(1);
    expect(
      within(shortcuts).getByRole("link", { name: /Curriculum/ }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /Logs/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Sandbox/ })).toBeNull();
  });

  it("shows a developer the operational tools and no curriculum data at all", async () => {
    setup({ role: "developer" });

    const shortcuts = await screen.findByLabelText("Admin shortcuts");
    expect(within(shortcuts).getByRole("link", { name: /Logs/ })).toBeVisible();
    expect(
      within(shortcuts).getByRole("link", { name: /Sandbox/ }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /Curriculum/ })).toBeNull();
    expect(screen.queryByLabelText("Curriculum status counts")).toBeNull();
    expect(screen.queryByText("Published")).toBeNull();
  });
});

describe("OverviewScreen — interface states", () => {
  it("shows a labelled loading placeholder, then replaces it with content", async () => {
    let release!: (value: AdminOverview) => void;
    const pending = new Promise<AdminOverview>((resolve) => {
      release = resolve;
    });
    setup({ loadOverview: () => pending });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the admin overview",
    );
    expect(screen.queryByLabelText("Curriculum status counts")).toBeNull();

    await act(async () => release(overviewFor("admin")));

    expect(
      await screen.findByLabelText("Curriculum status counts"),
    ).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("explains a 403 with a route out — and no pointless retry", async () => {
    setup({
      loadOverview: async () => {
        throw new AdminApiError("FORBIDDEN", 403);
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("never mistakes a denial for an empty success", async () => {
    setup({
      loadOverview: async () => {
        throw new AdminApiError("FORBIDDEN", 403);
      },
    });
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Curriculum status counts")).toBeNull();
    expect(screen.queryByLabelText("Admin shortcuts")).toBeNull();
  });

  it("sends a 401 to Clerk's sign-in and says so while it goes", async () => {
    const { redirect } = setup({
      loadOverview: async () => {
        throw new AdminApiError("UNAUTHENTICATED", 401);
      },
    });

    // (The loading placeholder is also role="status", so wait for the text.)
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    // Never an empty success: no stats, no shortcuts while that happens.
    expect(screen.queryByLabelText("Curriculum status counts")).toBeNull();
    expect(screen.queryByLabelText("Admin shortcuts")).toBeNull();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(redirect).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fadmin");
  });

  it("offers a retry for a server failure, and recovers when it succeeds", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { request } = setup({
      loadOverview: async () => {
        attempts += 1;
        if (attempts === 1) throw new AdminApiError("INTERNAL_ERROR", 500);
        return overviewFor("admin");
      },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on our side");
    // The server's own wording (and any detail) never reaches the screen.
    expect(alert).not.toHaveTextContent("INTERNAL_ERROR");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByLabelText("Curriculum status counts"),
    ).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says when a network failure is the problem", async () => {
    setup({
      loadOverview: async () => {
        throw new AdminApiError("NETWORK_ERROR", 0);
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("keeps showing loaded data, with a warning, when a refresh fails transiently", async () => {
    let calls = 0;
    const { queryClient } = setup({
      loadOverview: async () => {
        calls += 1;
        if (calls > 1) throw new AdminApiError("NETWORK_ERROR", 0);
        return overviewFor("admin");
      },
    });
    await screen.findByLabelText("Curriculum status counts");

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["overview"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getByLabelText("Curriculum status counts")).toBeVisible();
  });
});

describe("OverviewScreen — a role revoked while the page stays open", () => {
  it("clears the privileged data and shows access-denied when the tab regains focus", async () => {
    let revoked = false;
    setup({
      role: "admin",
      loadOverview: async () => {
        if (revoked) throw new AdminApiError("FORBIDDEN", 403);
        return overviewFor("admin");
      },
      loadMe: async () => {
        if (revoked) throw new AdminApiError("FORBIDDEN", 403);
        return me("admin");
      },
    });
    expect(
      await screen.findByLabelText("Curriculum status counts"),
    ).toBeVisible();

    revoked = true;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(screen.queryByLabelText("Curriculum status counts")).toBeNull();
    expect(screen.queryByLabelText("Admin shortcuts")).toBeNull();
  });

  it("re-asks the server for permissions instead of trusting a five-minute cache", async () => {
    const { fetchMe } = setup({ role: "writer" });
    await screen.findByLabelText("Admin shortcuts");
    const before = fetchMe.mock.calls.length;

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() =>
      expect(fetchMe.mock.calls.length).toBeGreaterThan(before),
    );
  });
});
