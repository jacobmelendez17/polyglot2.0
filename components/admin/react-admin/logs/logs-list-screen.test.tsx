import { focusManager } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../admin-api-error";
import { navigation } from "../test-support/next-navigation";
import {
  ADA,
  TARGET,
  logPage,
  logRow,
  renderLogsList,
} from "./logs-list-test-harness";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const PATH = "/admin/logs";

beforeEach(() => {
  navigation.reset("", PATH);
});

const table = () => screen.findByRole("table", { name: "Audit log" });
/** The events' own rows — React Admin keeps an (empty, collapsed) row under each for its details panel. */
const eventRows = (t: HTMLElement) =>
  within(t)
    .getAllByRole("row")
    .filter((row) => row.querySelector("time") !== null);
const DEBOUNCED = { timeout: 3000 };

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  option: string,
) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/* -------------------------------------------------------------------------- */

describe("LogsListScreen — what is shown (parity with the table it replaces)", () => {
  it("shows when, who, what, to what and why — newest first, as the server ordered them", async () => {
    renderLogsList({
      pages: {
        "": logPage([
          logRow(2, { action: "GROUP_CREATED", resourceType: "group" }),
          logRow(1),
        ]),
      },
    });
    const t = await table();

    expect(
      within(t)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["When", "Actor", "Action", "Resource", "Reason", "Details"]);

    const [first, second] = eventRows(t);
    expect(within(first!).getByText("GROUP_CREATED")).toBeVisible();
    expect(within(second!).getByText("USER_ROLE_CHANGED")).toBeVisible();
    expect(within(second!).getByText("Ada Admin")).toBeVisible();
    // The resource keeps the short id the old table showed; the whole id is in the details.
    expect(
      within(second!).getByText("· b0000000…", { exact: false }),
    ).toBeVisible();
    expect(within(second!).getByText("Reviews lessons")).toBeVisible();

    const when = within(second!).getByText(/2026/);
    expect(when.tagName).toBe("TIME");
    expect(when).toHaveAttribute("datetime", "2026-10-14T22:46:21.710Z");
    expect(when).toHaveAttribute("title", "2026-10-14T22:46:21.710Z");
  });

  it("says so, plainly, when an event has no reason and no resource id", async () => {
    renderLogsList({
      pages: {
        "": logPage([
          logRow(1, { reason: null, resourceId: null, resourceType: "level" }),
        ]),
      },
    });
    const [row] = eventRows(await table());
    expect(within(row!).getByText("—")).toBeVisible();
    expect(within(row!).getByText("level")).toBeVisible();
    expect(within(row!).queryByText(/…/)).toBeNull();
  });

  it("offers no checkbox, no sort and no row to click: the log is read-only", async () => {
    renderLogsList();
    const t = await table();
    expect(within(t).queryByRole("checkbox")).toBeNull();
    for (const header of within(t).getAllByRole("columnheader")) {
      expect(within(header).queryByRole("button")).toBeNull();
    }
  });
});

describe("LogsListScreen — an event's details", () => {
  it("opens the actor, the whole resource, the ids, and the recorded before and after", async () => {
    const user = userEvent.setup();
    renderLogsList();
    await table();

    await user.click(
      screen.getAllByRole("button", { name: "Show details" })[0]!,
    );

    const panel = await screen.findByRole("group", {
      name: "Details of USER_ROLE_CHANGED",
    });
    expect(within(panel).getByText(`Ada Admin (${ADA})`)).toBeVisible();
    expect(
      within(panel).getByText(`user · ${TARGET}`, { exact: false }),
    ).toBeVisible();
    expect(within(panel).getByText("Reviews lessons")).toBeVisible();
    expect(within(panel).getByText("correlation-1")).toBeVisible();
    expect(
      within(panel).getByText("e0000000-0000-4000-8000-000000000001"),
    ).toBeVisible();

    const before = within(panel).getByRole("region", { name: "Before" });
    const after = within(panel).getByRole("region", { name: "After" });
    expect(before).toHaveTextContent('"role": "user"');
    expect(after).toHaveTextContent('"role": "writer"');
    // Indented, as the old table showed it.
    expect(before.textContent).toBe(JSON.stringify({ role: "user" }, null, 2));
  });

  it("is a real button with the state it controls — and the way to close it", async () => {
    const user = userEvent.setup();
    renderLogsList();
    await table();

    const open = screen.getAllByRole("button", { name: "Show details" })[0]!;
    expect(open).toHaveAttribute("aria-expanded", "false");
    await user.click(open);

    const close = await screen.findByRole("button", { name: "Hide details" });
    expect(close).toHaveAttribute("aria-expanded", "true");
    // It points at the panel it opens, and the panel is there.
    const controls = close.getAttribute("aria-controls")!;
    expect(document.getElementById(controls)).not.toBeNull();

    await user.click(close);
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Details of USER_ROLE_CHANGED" }),
      ).toBeNull(),
    );
    expect(
      screen.getAllByRole("button", { name: "Show details" })[0],
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("can be reached and used from the keyboard", async () => {
    const user = userEvent.setup();
    renderLogsList();
    await table();

    const open = screen.getAllByRole("button", { name: "Show details" })[0]!;
    open.focus();
    expect(open).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("group", {
        name: "Details of USER_ROLE_CHANGED",
      }),
    ).toBeVisible();
  });

  it("opens one event at a time", async () => {
    const user = userEvent.setup();
    renderLogsList({
      pages: {
        "": logPage([
          logRow(1, { action: "GROUP_CREATED" }),
          logRow(2, { action: "LEVEL_CREATED" }),
        ]),
      },
    });
    await table();

    await user.click(
      screen.getAllByRole("button", { name: "Show details" })[0]!,
    );
    await screen.findByRole("group", { name: "Details of GROUP_CREATED" });

    await user.click(
      screen.getAllByRole("button", { name: "Show details" })[0]!,
    );
    expect(
      await screen.findByRole("group", { name: "Details of LEVEL_CREATED" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Details of GROUP_CREATED" }),
      ).toBeNull(),
    );
  });

  it("says null for a side nothing was recorded on", async () => {
    const user = userEvent.setup();
    renderLogsList({
      pages: {
        "": logPage([logRow(1, { beforeData: null, afterData: { a: 1 } })]),
      },
    });
    await table();
    await user.click(screen.getByRole("button", { name: "Show details" }));

    const panel = await screen.findByRole("group", {
      name: "Details of USER_ROLE_CHANGED",
    });
    expect(
      within(panel).getByRole("region", { name: "Before" }),
    ).toHaveTextContent("null");
    expect(
      within(panel).getByRole("region", { name: "After" }),
    ).toHaveTextContent('"a": 1');
  });

  it("says null for a side the server left out altogether, not just one it sent as null", async () => {
    const user = userEvent.setup();
    renderLogsList({
      pages: {
        "": logPage([
          logRow(1, { beforeData: undefined, afterData: undefined }),
        ]),
      },
    });
    await table();
    await user.click(screen.getByRole("button", { name: "Show details" }));

    const panel = await screen.findByRole("group", {
      name: "Details of USER_ROLE_CHANGED",
    });
    for (const side of ["Before", "After"])
      expect(
        within(panel).getByRole("region", { name: side }),
      ).toHaveTextContent("null");
  });

  it("does not leave React Admin's own expand button in the way — it cannot be reached by a keyboard", async () => {
    renderLogsList();
    await table();
    expect(
      screen.queryByRole("button", { name: /^(Expand|Close)$/ }),
    ).toBeNull();
    // Exactly one button per row, and it is ours.
    expect(screen.getAllByRole("button", { name: /details/i })).toHaveLength(2);
  });
});

describe("LogsListScreen — filters live in the address", () => {
  it("reads the address the Logs page always used — and sends the page's own `tab` nowhere", async () => {
    navigation.reset(
      `tab=audit&actor=${ADA}&action=GROUP_CREATED&resourceType=group&resourceId=r-1&from=2026-10-01&to=2026-10-14`,
      PATH,
    );
    const { listRequests } = renderLogsList();
    await table();

    expect(listRequests[0]).toBe(
      `/logs?actor=${ADA}&action=GROUP_CREATED&resourceType=group&resourceId=r-1&from=2026-10-01&to=2026-10-14&limit=25`,
    );
    expect(screen.getByRole("textbox", { name: "Actor ID" })).toHaveValue(ADA);
    expect(screen.getByRole("combobox", { name: /Action/ })).toHaveTextContent(
      "GROUP_CREATED",
    );
    expect(screen.getByRole("textbox", { name: "Resource type" })).toHaveValue(
      "group",
    );
    expect(screen.getByRole("textbox", { name: "Resource ID" })).toHaveValue(
      "r-1",
    );
    expect(screen.getByLabelText("From date")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("To date")).toHaveValue("2026-10-14");
  });

  it("drops a filter the endpoint would refuse, instead of turning the page into an error", async () => {
    navigation.reset("actor=ada&action=SOMETHING_ELSE&from=2026-02-30", PATH);
    const { listRequests } = renderLogsList();
    await table();
    expect(listRequests[0]).toBe("/logs?limit=25");
  });

  it("choosing an action opens a new view, back at the first page", async () => {
    const user = userEvent.setup();
    navigation.reset("cursor=here", PATH);
    renderLogsList({
      pages: { here: logPage([logRow(1)]), "": logPage([logRow(1)]) },
    });
    await table();

    await choose(user, /Action/, "GROUP_CREATED");

    await waitFor(() =>
      expect(navigation.push).toHaveBeenLastCalledWith(
        "/admin/logs?action=GROUP_CREATED",
        expect.anything(),
      ),
    );
  });

  it("choosing 'All actions' clears it", async () => {
    const user = userEvent.setup();
    navigation.reset("action=GROUP_CREATED", PATH);
    renderLogsList({ pages: { "": logPage([logRow(1)]) } });
    await table();

    // The empty option is named "Clear value" by React Admin.
    await choose(user, /Action/, "Clear value");

    await waitFor(() =>
      expect(navigation.push).toHaveBeenLastCalledWith(
        "/admin/logs",
        expect.anything(),
      ),
    );
  });

  it("picking a date opens a new view", async () => {
    renderLogsList();
    await table();

    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2026-10-01" },
    });

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenLastCalledWith(
          "/admin/logs?from=2026-10-01",
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });

  it("typing an id replaces the history entry — one per pause, not one per letter", async () => {
    const user = userEvent.setup();
    renderLogsList();
    await table();

    await user.type(
      screen.getByRole("textbox", { name: "Resource ID" }),
      "r-1",
    );

    await waitFor(
      () =>
        expect(navigation.replace).toHaveBeenLastCalledWith(
          "/admin/logs?resourceId=r-1",
          expect.anything(),
        ),
      DEBOUNCED,
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not search for half an actor id: it is a filter once it is a whole one", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderLogsList();
    await table();
    const reads = listRequests.length;

    const box = screen.getByRole("textbox", { name: "Actor ID" });
    await user.type(box, "a0000000-0000");
    // Let the form's debounce pass: nothing may have been asked or navigated.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(listRequests).toHaveLength(reads);

    await user.clear(box);
    await user.type(box, ADA);
    await waitFor(
      () =>
        expect(navigation.replace).toHaveBeenLastCalledWith(
          `/admin/logs?actor=${ADA}`,
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });
});

describe("LogsListScreen — paging by the server's cursors", () => {
  const pages = {
    "": logPage([logRow(1)], { nextCursor: "two" }),
    two: logPage([logRow(2)], {
      nextCursor: "three",
      hasPreviousPage: true,
      previousCursor: "back",
    }),
    three: logPage([logRow(3)], {
      hasPreviousPage: true,
      previousCursor: null,
    }),
    back: logPage([logRow(1)], { nextCursor: "two" }),
  };

  it("offers only Next on the first page, and hands back the server's cursor", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderLogsList({ pages });
    await table();

    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(navigation.push).toHaveBeenLastCalledWith(
      "/admin/logs?cursor=two",
      expect.anything(),
    );
    await waitFor(() =>
      expect(listRequests.at(-1)).toBe("/logs?cursor=two&limit=25"),
    );
  });

  it("goes back by the server's previous cursor — and to no cursor when the previous page is the first", async () => {
    const user = userEvent.setup();
    navigation.reset("cursor=two", PATH);
    renderLogsList({ pages });
    await table();

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/admin/logs?cursor=back",
      expect.anything(),
    );

    navigation.reset("cursor=three", PATH);
    navigation.push.mockClear();
    renderLogsList({ pages });
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Previous page" })[1],
      ).toBeEnabled(),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Previous page" })[1]!,
    );
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/admin/logs",
      expect.anything(),
    );
  });

  it("holds Next and Previous while the page it moved to is still loading", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderLogsList({ pages, pageGates: { two: gate } });
    await table();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    // The first page's rows stay while the second is on its way…
    expect(eventRows(screen.getByRole("table"))).toHaveLength(1);
    // …and neither button will move on from them.
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();

    release();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Previous page" }),
      ).toBeEnabled(),
    );
  });

  it("offers no paging when everything fits on one page", async () => {
    renderLogsList();
    await table();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});

describe("LogsListScreen — empty states", () => {
  it("says so when nothing has been recorded yet", async () => {
    renderLogsList({ pages: { "": logPage([]) } });
    expect(await screen.findByText("No audit events yet")).toBeVisible();
    expect(
      screen.getByText(
        "Administrative changes are recorded here as they happen.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says so, differently, when nothing matches the filters", async () => {
    navigation.reset("action=GROUP_CREATED", PATH);
    renderLogsList({ pages: { "": logPage([]) } });
    expect(
      await screen.findByText("No audit events match these filters"),
    ).toBeVisible();
    expect(
      screen.getByText("Try a different filter, or clear one."),
    ).toBeVisible();
    expect(screen.queryByText("No audit events yet")).toBeNull();
  });

  it("does not call a page past the end 'no events' — it offers the way back", async () => {
    navigation.reset("cursor=gone", PATH);
    renderLogsList({
      pages: {
        gone: logPage([], { hasPreviousPage: true, previousCursor: null }),
      },
    });
    expect(
      await screen.findByText("There is nothing more on this page"),
    ).toBeVisible();
    expect(screen.queryByText("No audit events yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });
});

describe("LogsListScreen — failures", () => {
  it("explains a 403 with a route out, instead of an empty log", async () => {
    renderLogsList({ failList: () => new AdminApiError("FORBIDDEN", 403) });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("No audit events yet")).toBeNull();
  });

  it("sends a 401 to sign-in and shows no rows meanwhile", async () => {
    const { redirect } = renderLogsList({
      failList: () => new AdminApiError("UNAUTHENTICATED", 401),
    });
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    renderLogsList({
      failList: () =>
        failing ? new AdminApiError("INTERNAL_ERROR", 500) : null,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side",
    );
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await table()).toBeVisible();
  });

  it("says a bad page link is bad, in the server's words", async () => {
    navigation.reset("cursor=garbage", PATH);
    renderLogsList({
      failList: () =>
        new AdminApiError("VALIDATION_FAILED", 422, undefined, {
          serverMessage:
            "That page link is not valid. Go back to the first page.",
        }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That page link is not valid. Go back to the first page.",
    );
  });

  it("keeps the rows, with a warning, when a refresh fails transiently", async () => {
    let failing = false;
    const { queryClient } = renderLogsList({
      failList: () => (failing ? new AdminApiError("NETWORK_ERROR", 0) : null),
    });
    await table();

    failing = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["logs"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getAllByText("USER_ROLE_CHANGED").length).toBeGreaterThan(0);
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    renderLogsList({
      failList: () => (revoked ? new AdminApiError("FORBIDDEN", 403) : null),
    });
    await table();

    revoked = true;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    // Privileged rows must not linger beside the denial.
    expect(screen.queryByText("USER_ROLE_CHANGED")).toBeNull();
  });
});
