import { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListBase, useListContext } from "react-admin";
import { useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { buildAdminMe, type AdminCurriculumPage } from "@/domains/admin";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";

/**
 * SPEC 26 UNIT 2 — THE SPIKE (kept as a regression test).
 *
 * Question (spec §3, "Cursor pagination contract"): can React Admin's own
 * `ListBase` — with its partial-pagination support — drive the curriculum list,
 * or does the list need a custom list-context wrapper? The spec says to decide
 * from a *tested* spike, not from assumed API behaviour. This is that spike:
 * it runs the stock `ListBase` through the real Polyglot provider stack
 * (contained `MemoryRouter`, typed data provider, auth provider) and records
 * what it actually does.
 *
 * Findings, each pinned below:
 *  1. `ListBase` asks for a sort the keyset cannot honour (its own default).
 *  2. Its page state is a page *number*; a number cannot be a deep-linkable
 *     keyset cursor, and the provider correctly refuses a jump to page 2.
 *  3. It writes list state (`page`, filters) to React Admin's router — the
 *     contained MemoryRouter — and never to `window.location`. So the Next URL
 *     (what `?from=`, refresh and deep links depend on) never sees it.
 *
 * Conclusion: use RA's list *primitives* (`useGetList`, `DataTable`,
 * `FilterForm`, `ListContext`, selection) but drive them from a thin custom
 * controller that owns URL state and cursor navigation. See
 * `use-curriculum-list.ts`.
 */

const PAGE: AdminCurriculumPage = {
  items: [
    {
      id: "item-1",
      type: "vocabulary",
      status: "published",
      levelId: "level-1",
      levelNumber: 1,
      itemLabel: "el gato",
      meaningLabel: "cat",
      groupId: null,
      groupName: null,
    },
  ],
  nextCursor: "next-token",
  hasPreviousPage: false,
  previousCursor: null,
};

function Probe() {
  const { page, setPage, filterValues, setFilters, data, error } =
    useListContext();
  const location = useLocation();
  return (
    <div>
      <output aria-label="page">{page}</output>
      <output aria-label="memory-location">
        {location.pathname}
        {location.search}
      </output>
      <output aria-label="rows">{data?.length ?? "none"}</output>
      <output aria-label="error">
        {error ? String((error as Error).name) : ""}
      </output>
      <output aria-label="filters">{JSON.stringify(filterValues)}</output>
      <button type="button" onClick={() => setPage(2)}>
        page 2
      </button>
      <button
        type="button"
        onClick={() =>
          setFilters({ language: "lang-es", level: "level-1" }, {})
        }
      >
        filter
      </button>
    </div>
  );
}

function setup(listProps: Record<string, unknown> = {}) {
  const request = vi.fn<(path: string) => Promise<AdminCurriculumPage>>(
    async () => PAGE,
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <ReactAdminProvider
      signInPath="/sign-in"
      queryClient={queryClient}
      dataProvider={createAdminDataProvider({ request: request as never })}
      authProvider={createAdminAuthProvider({
        fetchMe: async () => buildAdminMe({ id: "u", role: "admin" }),
        signInUrl: () => "/sign-in",
        redirect: vi.fn(),
      })}
    >
      <ListBase resource="curriculum" perPage={20} {...listProps}>
        <Probe />
      </ListBase>
    </ReactAdminProvider>,
  );
  return { request };
}

describe("spike: stock ListBase against the cursor-paginated curriculum endpoint", () => {
  it("(1) asks for React Admin's default sort, which the keyset cannot honour", async () => {
    setup({ filter: { language: "lang-es" } });

    // The provider refuses it — correctly, since a cursor is only meaningful
    // under the one ordering that produced it.
    await waitFor(() =>
      expect(screen.getByLabelText("error")).toHaveTextContent("AdminApiError"),
    );
  });

  it("(1b) can be steered onto the supported sort, and then partial pagination works", async () => {
    const { request } = setup({
      filter: { language: "lang-es" },
      sort: { field: "curriculum_order", order: "ASC" },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("rows")).toHaveTextContent("1"),
    );
    expect(request.mock.calls[0]?.[0]).toBe(
      "/curriculum?language=lang-es&limit=20",
    );
  });

  it("(2) models paging as a page NUMBER, which cannot be a cursor — jumping is refused", async () => {
    const user = userEvent.setup();
    const { request } = setup({
      filter: { language: "lang-es" },
      sort: { field: "curriculum_order", order: "ASC" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("rows")).toHaveTextContent("1"),
    );
    request.mockClear();

    await user.click(screen.getByRole("button", { name: "page 2" }));

    // `ListBase` really did move to page 2 …
    await waitFor(() =>
      expect(screen.getByLabelText("page")).toHaveTextContent("2"),
    );
    // … and the provider could not serve it: no cursor exists for "page 2".
    await waitFor(() =>
      expect(screen.getByLabelText("error")).toHaveTextContent("AdminApiError"),
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("(3) keeps list state in React Admin's router, never in the real URL", async () => {
    window.history.replaceState(null, "", "/admin/curriculum");
    const user = userEvent.setup();
    setup({
      sort: { field: "curriculum_order", order: "ASC" },
      filterDefaultValues: { language: "lang-es" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("rows")).toHaveTextContent("1"),
    );

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "filter" }));
    });

    // The filter landed in the contained MemoryRouter …
    await waitFor(() =>
      expect(screen.getByLabelText("memory-location")).toHaveTextContent(
        /filter=/,
      ),
    );
    // … and the page's real URL — what `?from=`, refresh, and deep links use —
    // never changed. This is the finding that rules `ListBase` out as the
    // controller.
    expect(window.location.pathname).toBe("/admin/curriculum");
    expect(window.location.search).toBe("");
  });
});
