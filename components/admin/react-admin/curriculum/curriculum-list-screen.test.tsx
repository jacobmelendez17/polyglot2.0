import { act, screen, waitFor, within } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../admin-api-error";

import {
  page,
  renderCurriculumList,
  row,
} from "./curriculum-list-test-harness";
import { navigation } from "../test-support/next-navigation";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports below.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

beforeEach(() => {
  navigation.reset();
});

describe("CurriculumListScreen — rows", () => {
  it("shows the six columns, in order, with the legacy labels", async () => {
    renderCurriculumList({
      pages: {
        "": page([
          row(1, {
            itemLabel: "el gato",
            meaningLabel: "cat",
            groupId: "group-a",
            groupName: "Animals",
            status: "pending",
          }),
          row(2, { type: "grammar", itemLabel: "porque" }),
        ]),
      },
    });

    const table = await screen.findByRole("table", {
      name: "Curriculum items",
    });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    // (the first header is the select-all checkbox)
    expect(headers.slice(1)).toEqual([
      "Type",
      "Item",
      "Meaning",
      "Level",
      "Group",
      "Status",
    ]);

    const [gato, porque] = within(table).getAllByRole("row").slice(1);
    expect(within(gato!).getByText("Vocab")).toBeVisible();
    expect(within(gato!).getByText("el gato")).toBeVisible();
    expect(within(gato!).getByText("cat")).toBeVisible();
    expect(within(gato!).getByText("Animals")).toBeVisible();
    expect(within(gato!).getByText("Pending")).toBeVisible();
    expect(within(porque!).getByText("Gram")).toBeVisible();
    // Grammar items have no group.
    expect(within(porque!).getByText("—")).toBeVisible();
  });

  it("links each item to the specialist editor, carrying the list's URL as ?from=", async () => {
    navigation.reset(
      "language=lang-es&level=level-1&type=vocabulary&cursor=abc",
    );
    renderCurriculumList({
      pages: { abc: page([row(7, { itemLabel: "el perro" })]) },
    });

    const link = await screen.findByRole("link", { name: "el perro" });
    const from = encodeURIComponent(
      "language=lang-es&level=level-1&type=vocabulary&cursor=abc",
    );
    expect(link).toHaveAttribute(
      "href",
      `/admin/curriculum/items/item-7?from=${from}`,
    );
  });

  it("links without ?from= when the page has no query string", async () => {
    navigation.reset("");
    renderCurriculumList();
    const link = await screen.findByRole("link", { name: "palabra 1" });
    expect(link).toHaveAttribute("href", "/admin/curriculum/items/item-1");
  });

  it("does not sort: no column header is a sort button", async () => {
    renderCurriculumList();
    const table = await screen.findByRole("table");
    expect(
      within(table).queryAllByRole("button", { name: /sort/i }),
    ).toHaveLength(0);
  });

  it("shows no total or page count — there is no honest one", async () => {
    renderCurriculumList({
      pages: { "": page([row(1)], { nextCursor: "c1" }) },
    });
    await screen.findByRole("table");
    expect(screen.queryByText(/\bof \d+\b/)).toBeNull();
    expect(screen.queryByText(/page \d+/i)).toBeNull();
  });
});

describe("CurriculumListScreen — pagination by the server's cursors", () => {
  const pages = {
    "": page([row(1), row(2)], { nextCursor: "after-2" }),
    "after-2": page([row(3), row(4)], {
      nextCursor: "after-4",
      hasPreviousPage: true,
      previousCursor: null, // the previous page is the first page
    }),
    "after-4": page([row(5)], {
      hasPreviousPage: true,
      previousCursor: "after-2",
    }),
  };

  it("offers only Next on the first page", async () => {
    renderCurriculumList({ pages });
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
  });

  it("offers neither when everything fits on one page", async () => {
    renderCurriculumList();
    await screen.findByRole("table");
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  it("moves forward by handing back the server's cursor, in the URL", async () => {
    const user = userEvent.setup();
    const { requests } = renderCurriculumList({ pages });
    await screen.findByRole("link", { name: "palabra 1" });

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum?language=lang-es&cursor=after-2",
      expect.anything(),
    );
    expect(
      await screen.findByRole("link", { name: "palabra 3" }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "palabra 1" })).toBeNull();
    expect(requests.at(-1)).toContain("cursor=after-2");
  });

  it("goes back to the first page without a cursor in the URL", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&cursor=after-2");
    renderCurriculumList({ pages });
    await screen.findByRole("link", { name: "palabra 3" });

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum?language=lang-es",
      expect.anything(),
    );
    expect(
      await screen.findByRole("link", { name: "palabra 1" }),
    ).toBeVisible();
  });

  it("goes back to a middle page by its own cursor — also after a refresh or deep link", async () => {
    const user = userEvent.setup();
    // Opened cold on the last page: no history exists on the client.
    navigation.reset("language=lang-es&cursor=after-4");
    renderCurriculumList({ pages });
    await screen.findByRole("link", { name: "palabra 5" });

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum?language=lang-es&cursor=after-2",
      expect.anything(),
    );
    expect(
      await screen.findByRole("link", { name: "palabra 3" }),
    ).toBeVisible();
  });

  it("disables Next on the last page", async () => {
    navigation.reset("language=lang-es&cursor=after-4");
    renderCurriculumList({ pages });
    await screen.findByRole("link", { name: "palabra 5" });
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });
});

describe("CurriculumListScreen — states", () => {
  it("shows a labelled skeleton, shaped like the table, while loading", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    renderCurriculumList({
      fail: () => {
        void gate; // not used to fail; see below
        return null;
      },
    });
    // The first request resolves on a microtask; assert the skeleton exists
    // in the same tick the screen mounts.
    expect(screen.getByRole("status")).toHaveTextContent("Loading curriculum");
    release();
    await screen.findByRole("table");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("tells 'nothing yet' apart from 'nothing matches', with a next step each", async () => {
    renderCurriculumList({ pages: { "": page([]) } });
    expect(
      await screen.findByText("No curriculum items in this language yet"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Add item" })).toHaveAttribute(
      "href",
      "/admin/curriculum/items/new?language=lang-es",
    );
  });

  it("offers to clear filters when they are why nothing shows", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&status=draft&search=zzz");
    renderCurriculumList({ pages: { "": page([]) } });

    expect(
      await screen.findByText("No curriculum items match these filters"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum?language=lang-es",
      expect.anything(),
    );
  });
});

/** Opens a React Admin select by its label and picks an option by name. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  option: string,
) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const DEBOUNCED = { timeout: 3000 };

describe("CurriculumListScreen — filters", () => {
  it("pushes a filter into the URL, starting again from the first page", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&cursor=after-2");
    renderCurriculumList({
      pages: { "after-2": page([row(3)]), "": page([row(1)]) },
    });
    await screen.findByRole("link", { name: "palabra 3" });

    await choose(user, /Status/, "Draft");

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          // No `cursor`: it only means something under the filters that made it.
          "/admin/curriculum?language=lang-es&status=draft",
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });

  it("clears level and group when the language changes", async () => {
    const user = userEvent.setup();
    navigation.reset(
      "language=lang-es&level=level-1&type=vocabulary&group=group-a",
    );
    renderCurriculumList();
    await screen.findByRole("table");

    await choose(user, /Language/, "French");

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          "/admin/curriculum?language=lang-fr&type=vocabulary",
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });

  it("clears the group when the level changes", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&level=level-1&group=group-a");
    renderCurriculumList();
    await screen.findByRole("table");

    await choose(user, /Level/, "Level 2");

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          "/admin/curriculum?language=lang-es&level=level-2",
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });

  it("scopes the Group choices to the selected level", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&level=level-1");
    renderCurriculumList();
    await user.click(await screen.findByRole("combobox", { name: /Group/ }));

    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent,
    );
    expect(options).toContain("Animals");
    expect(options).not.toContain("Colors");
    expect(options).not.toContain("L2 — Colors");
  });

  it("lists every level's groups, labelled by level, when no level is chosen", async () => {
    const user = userEvent.setup();
    renderCurriculumList();
    await user.click(await screen.findByRole("combobox", { name: /Group/ }));

    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent,
    );
    expect(options).toContain("L1 — Animals");
    expect(options).toContain("L2 — Colors");
  });

  it("offers the work-queue filters that have data, and not the two that do not", async () => {
    const user = userEvent.setup();
    renderCurriculumList();
    await user.click(await screen.findByRole("combobox", { name: /Needs/ }));

    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual(
      expect.arrayContaining([
        "Needs Definition",
        "Needs Examples",
        "Needs IPA",
        "Needs Pronunciation",
        "Needs Synonyms",
        "Needs Variations",
        "Has Draft Changes",
        "Ready to Publish",
      ]),
    );
    expect(options.join("|")).not.toMatch(/validation|imported/i);
  });

  it("labels the filters as a search landmark, with every control inside it", async () => {
    renderCurriculumList();
    const landmark = await screen.findByRole("search", {
      name: "Filter curriculum",
    });
    expect(
      within(landmark).getByRole("searchbox", { name: /Search curriculum/ }),
    ).toBeVisible();
    expect(
      within(landmark)
        .getAllByRole("combobox")
        .map((el) => el.textContent),
    ).toHaveLength(6);
  });

  it("makes language mandatory: there is no 'all languages' choice", async () => {
    const user = userEvent.setup();
    renderCurriculumList();
    await user.click(await screen.findByRole("combobox", { name: /Language/ }));
    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual(["Spanish", "French"]);
  });
});

describe("CurriculumListScreen — search", () => {
  it("refines the URL in place — replace, not push — so Back leaves the list", async () => {
    const user = userEvent.setup();
    renderCurriculumList();
    await screen.findByRole("table");

    await user.type(
      screen.getByRole("searchbox", { name: /Search curriculum/ }),
      "gáto",
    );

    await waitFor(
      () =>
        expect(navigation.replace).toHaveBeenCalledWith(
          // Accent preserved (percent-encoded), never folded.
          "/admin/curriculum?language=lang-es&search=g%C3%A1to",
          // …and without jumping the page to the top on every refinement.
          { scroll: false },
        ),
      DEBOUNCED,
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("sends the search to the API exactly as typed, case and accents intact", async () => {
    const user = userEvent.setup();
    const { requests } = renderCurriculumList();
    await screen.findByRole("table");

    await user.type(
      screen.getByRole("searchbox", { name: /Search curriculum/ }),
      "Sí",
    );

    await waitFor(
      () => expect(requests.at(-1)).toContain("search=S%C3%AD"),
      DEBOUNCED,
    );
  });
});

const TOOLBAR = { name: "Actions for the selected items" };

describe("CurriculumListScreen — selection", () => {
  const pages = {
    "": page([row(1), row(2), row(3)], { nextCursor: "after-3" }),
    "after-3": page([row(4)], { hasPreviousPage: true }),
  };

  it("shows the bar with a count once something is selected, and not before", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await screen.findByRole("table");
    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();

    // Checkbox 0 is the header's "select this page"; 1 is the first row.
    await user.click(screen.getAllByRole("checkbox")[1]!);

    expect(await screen.findByRole("group", TOOLBAR)).toHaveTextContent(
      "1 item selected",
    );
  });

  it("selects every row on the page with the header checkbox — and only that page", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await screen.findByRole("table");

    await user.click(screen.getAllByRole("checkbox")[0]!);

    // Three rows are on this page; the fourth is on the next and is not selected.
    expect(await screen.findByRole("group", TOOLBAR)).toHaveTextContent(
      "3 items selected",
    );
  });

  it("clears the selection with Unselect", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await screen.findByRole("table");
    await user.click(screen.getAllByRole("checkbox")[0]!);
    await screen.findByRole("group", TOOLBAR);

    await user.click(screen.getByRole("button", { name: "Unselect" }));

    await waitFor(() =>
      expect(screen.queryByRole("group", TOOLBAR)).toBeNull(),
    );
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it("clears the selection when the page changes — never carrying ids across a cursor", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await screen.findByRole("table");
    await user.click(screen.getAllByRole("checkbox")[0]!);
    await screen.findByRole("group", TOOLBAR);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByRole("link", { name: "palabra 4" });

    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
  });

  it("does not bring the selection back when returning to the page it was made on", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await screen.findByRole("table");
    await user.click(screen.getAllByRole("checkbox")[1]!);
    await screen.findByRole("group", TOOLBAR);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByRole("link", { name: "palabra 4" });
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await screen.findByRole("link", { name: "palabra 1" });

    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it("clears the selection when a filter changes", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await screen.findByRole("table");
    await user.click(screen.getAllByRole("checkbox")[0]!);
    await screen.findByRole("group", TOOLBAR);

    await choose(user, /Type/, "Grammar");
    await waitFor(() => expect(navigation.push).toHaveBeenCalled(), DEBOUNCED);

    await waitFor(() =>
      expect(screen.queryByRole("group", TOOLBAR)).toBeNull(),
    );
  });

  it("lets the row link stay independently clickable from its checkbox", async () => {
    renderCurriculumList({ pages });
    await screen.findByRole("table");
    // Checkbox and link are separate controls with separate names.
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(1);
    expect(screen.getByRole("link", { name: "palabra 1" })).toBeVisible();
  });

  it("offers no selection at all to someone who cannot use the commands", async () => {
    renderCurriculumList({ pages, role: "writer" });

    // The list is theirs to read and open…
    expect(
      await screen.findByRole("link", { name: "palabra 1" }),
    ).toBeVisible();
    // …but there is nothing to select, so no checkbox and no bar.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
    const headers = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual([
      "Type",
      "Item",
      "Meaning",
      "Level",
      "Group",
      "Status",
    ]);
  });

  it("waits for the server's permissions before showing the table, rather than flashing checkboxes", async () => {
    let resolveMe!: () => void;
    const gate = new Promise<void>((resolve) => (resolveMe = resolve));
    const { request } = renderCurriculumList({ meGate: gate });

    // The list's own answer arrives at once; the table still waits, because
    // whether it has a checkbox column depends on the permissions.
    await waitFor(() => expect(request).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("Loading curriculum");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    resolveMe();
    await screen.findByRole("table");
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("explains a refused permission lookup instead of guessing a role", async () => {
    renderCurriculumList({
      meFails: () => new AdminApiError("FORBIDDEN", 403),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("CurriculumListScreen — failures", () => {
  it("explains a 403 with a route out, instead of an empty list", async () => {
    renderCurriculumList({ fail: () => new AdminApiError("FORBIDDEN", 403) });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.queryByText("No curriculum items in this language yet"),
    ).toBeNull();
  });

  it("sends a 401 to sign-in and shows no rows meanwhile", async () => {
    const { redirect } = renderCurriculumList({
      fail: () => new AdminApiError("UNAUTHENTICATED", 401),
    });
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    renderCurriculumList({
      fail: () => (failing ? new AdminApiError("INTERNAL_ERROR", 500) : null),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side",
    );
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("link", { name: "palabra 1" }),
    ).toBeVisible();
  });

  it("keeps the rows, with a warning, when a refresh fails transiently", async () => {
    let failing = false;
    const { queryClient } = renderCurriculumList({
      fail: () => (failing ? new AdminApiError("NETWORK_ERROR", 0) : null),
    });
    await screen.findByRole("link", { name: "palabra 1" });

    failing = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["curriculum"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getByRole("link", { name: "palabra 1" })).toBeVisible();
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    renderCurriculumList({
      fail: () => (revoked ? new AdminApiError("FORBIDDEN", 403) : null),
    });
    await screen.findByRole("link", { name: "palabra 1" });

    revoked = true;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    // Privileged rows must not linger beside the denial.
    expect(screen.queryByRole("link", { name: "palabra 1" })).toBeNull();
  });
});
