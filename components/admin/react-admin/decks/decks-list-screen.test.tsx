import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminDeckList, AdminDeckRow } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { navigation } from "../test-support/next-navigation";
import { renderAdminScreen } from "../test-support/render-admin-screen";
import { DecksListScreen } from "./decks-list-screen";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const PATH = "/admin/decks";
const ONE_LANGUAGE = [{ id: "lang-es", name: "Spanish" }];
const TWO_LANGUAGES = [
  { id: "lang-es", name: "Spanish" },
  { id: "lang-fr", name: "French" },
];

beforeEach(() => {
  navigation.reset("language=lang-es", PATH);
});

function deck(n: number, overrides: Partial<AdminDeckRow> = {}): AdminDeckRow {
  return {
    id: `deck-${n}`,
    name: `Deck ${n}`,
    description: `About deck ${n}`,
    itemCount: 10 + n,
    availability: "theme",
    gateLevelNumber: null,
    ...overrides,
  };
}

function render({
  decks = { "lang-es": { items: [deck(1), deck(2)], truncated: false } },
  languages = ONE_LANGUAGE,
  failList = () => null,
}: {
  decks?: Record<string, AdminDeckList>;
  languages?: { id: string; name: string }[];
  failList?: () => Error | null;
} = {}) {
  const listRequests: string[] = [];
  const view = renderAdminScreen({
    ui: () => <DecksListScreen languages={languages} />,
    role: "admin",
    respond: async ({ path }) => {
      const failure = failList();
      if (failure) throw failure;
      listRequests.push(path);
      const language = new URLSearchParams(path.split("?")[1]).get("language");
      const found = decks[language ?? ""];
      if (!found) throw new Error(`no scripted decks for "${language}"`);
      return found;
    },
  });
  return { ...view, listRequests };
}

const table = () => screen.findByRole("table", { name: "Polyglot decks" });

describe("DecksListScreen — what is shown (parity with the list it replaces)", () => {
  it("shows each deck, how many items it holds, and when learners see it", async () => {
    render({
      decks: {
        "lang-es": {
          items: [
            deck(1, { name: "Colors", itemCount: 8 }),
            deck(2, {
              name: "Animals",
              availability: "level",
              gateLevelNumber: 3,
              itemCount: 21,
            }),
            deck(3, { name: "Bare", description: null }),
          ],
          truncated: false,
        },
      },
    });
    await table();

    const colors = screen.getByRole("link", { name: "Colors" }).closest("tr")!;
    expect(colors).toHaveTextContent("About deck 1");
    expect(colors).toHaveTextContent("8");
    expect(colors).toHaveTextContent("Theme — reveals learned items");

    const animals = screen
      .getByRole("link", { name: "Animals" })
      .closest("tr")!;
    expect(animals).toHaveTextContent("21");
    expect(animals).toHaveTextContent("Hidden until Level 3");

    // No description is a dash, not an empty cell.
    expect(
      within(
        screen.getByRole("link", { name: "Bare" }).closest("tr")!,
      ).getAllByText("—"),
    ).toHaveLength(1);
  });

  it("links each deck to its own page, where its items and order are edited", async () => {
    render();
    await table();
    expect(screen.getByRole("link", { name: "Deck 1" })).toHaveAttribute(
      "href",
      "/admin/decks/deck-1",
    );
  });

  it("asks the endpoint for the URL's language, and nothing else", async () => {
    const { listRequests } = render();
    await table();
    expect(listRequests).toEqual(["/decks?language=lang-es"]);
  });

  it("shows no checkboxes and no sorting — nothing here acts on several decks at once", async () => {
    render();
    await table();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /sort/i })).toHaveLength(0);
  });

  it("shows a labelled skeleton while it loads", async () => {
    render();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the decks");
    await table();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says so when the list was cut at its bound", async () => {
    render({
      decks: { "lang-es": { items: [deck(1)], truncated: true } },
    });
    await table();
    expect(screen.getByText("Showing the first 100 decks.")).toBeVisible();
  });

  it("says so, and says what to do, when the language has no official deck", async () => {
    render({ decks: { "lang-es": { items: [], truncated: false } } });
    expect(
      await screen.findByText("No Polyglot decks yet for this language"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Add one to give learners a curated set of published items to practice.",
      ),
    ).toBeVisible();
  });
});

describe("DecksListScreen — the language", () => {
  it("offers no language switch when there is only one language", async () => {
    render();
    await table();
    expect(screen.queryByRole("combobox", { name: /Language/ })).toBeNull();
  });

  it("offers one when there are several, and switching asks for that language's decks", async () => {
    const user = userEvent.setup();
    render({
      languages: TWO_LANGUAGES,
      decks: {
        "lang-es": { items: [deck(1)], truncated: false },
        "lang-fr": { items: [deck(2)], truncated: false },
      },
    });
    await table();

    await user.click(await screen.findByRole("combobox", { name: /Language/ }));
    await user.click(await screen.findByRole("option", { name: "French" }));

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          "/admin/decks?language=lang-fr",
          expect.anything(),
        ),
      { timeout: 3000 },
    );
  });
});

describe("DecksListScreen — failures", () => {
  it("explains a 403 with a route out, instead of an empty list", async () => {
    render({ failList: () => new AdminApiError("FORBIDDEN", 403) });
    expect(
      await screen.findByText(
        "You don't have access to this part of the admin console.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    render({
      failList: () =>
        failing ? new AdminApiError("INTERNAL_ERROR", 500) : null,
    });
    const retry = await screen.findByRole("button", { name: "Try again" });
    failing = false;

    await user.click(retry);

    expect(await table()).toBeVisible();
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    const { queryClient } = render({
      failList: () => (revoked ? new AdminApiError("FORBIDDEN", 403) : null),
    });
    await table();

    revoked = true;
    await queryClient.invalidateQueries({ queryKey: ["decks"] });

    expect(
      await screen.findByText(
        "You don't have access to this part of the admin console.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
