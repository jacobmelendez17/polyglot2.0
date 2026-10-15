import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../admin-api-error";
import { navigation } from "../test-support/next-navigation";
import {
  COUNTS,
  GROUPS,
  TWO_LANGUAGES,
  dictionaryPage,
  renderDictionaryList,
  word,
} from "./dictionary-test-harness";

const bulkConfirm = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/admin/dictionary/actions", () => ({
  bulkConfirmVocabularyMappingsAction: bulkConfirm,
}));
// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const PATH = "/admin/dictionary";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  navigation.reset("language=lang-es", PATH);
  bulkConfirm.mockReset();
});

const table = () =>
  screen.findByRole("table", { name: "Dictionary mapping queue" });

/** The row whose Review link names `label`. */
const rowOf = (label: string) =>
  screen.getByRole("link", { name: `Review ${label}` }).closest("tr")!;

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  option: string,
) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const DEBOUNCED = { timeout: 3000 };

/* -------------------------------------------------------------------------- */

describe("DictionaryListScreen — what is shown (parity with the queue it replaces)", () => {
  it("shows each word, where its mapping stands, and the way into its page", async () => {
    renderDictionaryList({
      pages: {
        "0": dictionaryPage([
          word(1),
          word(2, {
            displayWord: "casa",
            matchStatus: "review_required",
            confidence: "low",
            reviewReason: "multiple_candidates",
            manualLock: false,
          }),
          word(3, {
            displayWord: "perro",
            matchStatus: "manual",
            manualLock: true,
            confirmable: false,
          }),
          word(4, {
            displayWord: "agua",
            matchStatus: null,
            confidence: null,
            lookupForm: null,
            entryLemma: null,
            entryPartOfSpeech: null,
            regionalStatus: null,
            confirmable: false,
          }),
        ]),
      },
    });
    await table();

    // The word, what it means, and where it lives in the curriculum.
    expect(rowOf("palabra 1")).toHaveTextContent("palabra 1");
    expect(rowOf("palabra 1")).toHaveTextContent("word 1 · Level 1 · Animals");
    // The lookup form, the candidate entry, and the regional evidence.
    expect(rowOf("palabra 1")).toHaveTextContent("palabra1");
    expect(rowOf("palabra 1")).toHaveTextContent("lema 1 · noun");
    expect(rowOf("palabra 1")).toHaveTextContent("Recognized");
    expect(rowOf("palabra 1")).toHaveTextContent("es-MX");
    expect(rowOf("palabra 1")).toHaveTextContent("Auto-matched");
    expect(rowOf("palabra 1")).toHaveTextContent("High");
    // A match that needs a person, and why.
    expect(rowOf("casa")).toHaveTextContent("Needs review");
    expect(rowOf("casa")).toHaveTextContent("Low");
    expect(rowOf("casa")).toHaveTextContent("Several matching entries");
    // A confirmed match is locked, and says so.
    expect(rowOf("perro")).toHaveTextContent("Manual");
    expect(
      within(rowOf("perro")).getByLabelText(
        "Locked against automatic replacement",
      ),
    ).toBeInTheDocument();
    // A word nothing has looked at is still a row, and still actionable.
    expect(rowOf("agua")).toHaveTextContent("Not imported");
    expect(rowOf("agua")).toHaveTextContent("—");
    // Each row leads to the page where the mapping panel decides.
    expect(
      screen.getByRole("link", { name: "Review palabra 1" }),
    ).toHaveAttribute("href", `/admin/curriculum/items/${word(1).id}`);
  });

  it("shows how many words are in each state — and Never matched only when some are", async () => {
    const { unmount } = renderDictionaryList();
    await table();
    const counts = screen.getByLabelText("Mapping counts");
    expect(counts).toHaveTextContent("No match3");
    expect(counts).toHaveTextContent("Not imported1");
    expect(counts).toHaveTextContent("Auto-matched20");
    expect(counts).toHaveTextContent("Needs review4");
    expect(counts).toHaveTextContent("Manual9");
    expect(counts).not.toHaveTextContent("Never matched");
    unmount();

    renderDictionaryList({
      pages: {
        "0": dictionaryPage([word(1)], {
          counts: { ...COUNTS, no_mapping: 7 },
        }),
      },
    });
    expect(await screen.findByLabelText("Mapping counts")).toHaveTextContent(
      "Never matched7",
    );
  });

  it("asks the endpoint for the URL's language, its first page, at the queue's size", async () => {
    const { listRequests } = renderDictionaryList();
    await table();
    expect(listRequests).toEqual(["/dictionary?language=lang-es&limit=25"]);
  });

  it("reads every filter from the address and sends it, dropping what is not this language's", async () => {
    navigation.reset(
      "language=lang-es&level=level-1&group=group-1a&status=review_required&pos=verb&regional=not_listed&offset=25",
      PATH,
    );
    const { listRequests } = renderDictionaryList({
      pages: { "25": dictionaryPage([word(26)], { total: 40 }) },
    });
    await table();
    expect(listRequests).toEqual([
      "/dictionary?language=lang-es&level=level-1&group=group-1a&status=review_required&pos=verb&regional=not_listed&limit=25&offset=25",
    ]);

    navigation.reset("language=lang-es&level=elsewhere&status=done", PATH);
    const second = renderDictionaryList();
    await screen.findAllByRole("table");
    expect(second.listRequests).toEqual([
      "/dictionary?language=lang-es&limit=25",
    ]);
  });

  it("shows a labelled skeleton while it loads", async () => {
    renderDictionaryList();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the mapping queue",
    );
    await table();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers a way into the page for each row without making the whole row a link", async () => {
    renderDictionaryList();
    await table();
    // One Review link per row, named for the word, so a screen reader can tell them apart.
    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-label")),
    ).toEqual(["Review palabra 1", "Review palabra 2"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("DictionaryListScreen — filters", () => {
  it("pushes a filter into the address, starting again from the first page", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&offset=25", PATH);
    renderDictionaryList({
      pages: {
        "25": dictionaryPage([word(26)], { total: 40 }),
        "0": dictionaryPage([word(1)], { total: 40 }),
      },
    });
    await screen.findByRole("link", { name: "Review palabra 26" });

    await choose(user, /Match state/, "Needs review");

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          // No `offset`: it only means something under the filters that made it.
          "/admin/dictionary?language=lang-es&status=review_required",
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });

  it("lists the states that need a person first, as the page always did", async () => {
    const user = userEvent.setup();
    renderDictionaryList();
    await user.click(
      await screen.findByRole("combobox", { name: /Match state/ }),
    );
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      "All match states",
      "Needs review",
      "No match",
      "Not imported",
      "Auto-matched",
      "Manual",
    ]);
  });

  it("clears the group when the level changes, and scopes the group choices to the level", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&level=level-1&group=group-1a", PATH);
    renderDictionaryList({ groups: GROUPS });
    await table();

    await user.click(await screen.findByRole("combobox", { name: /Group/ }));
    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent,
    );
    expect(options).toContain("Animals");
    expect(options).toContain("Colors");
    expect(options).not.toContain("Travel");
    await user.keyboard("{Escape}");

    await choose(user, /Level/, "Level 2");
    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          "/admin/dictionary?language=lang-es&level=level-2",
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });

  it("clears level and group when the language changes", async () => {
    const user = userEvent.setup();
    navigation.reset(
      "language=lang-es&level=level-1&group=group-1a&status=unmatched",
      PATH,
    );
    renderDictionaryList({ languages: TWO_LANGUAGES });
    await table();

    await choose(user, /Language/, "French");

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          "/admin/dictionary?language=lang-fr&status=unmatched",
          expect.anything(),
        ),
      DEBOUNCED,
    );
  });

  it("offers no language switch when there is only one language", async () => {
    renderDictionaryList();
    await table();
    expect(screen.queryByRole("combobox", { name: /Language/ })).toBeNull();
  });

  it("offers the regional filter by the region it speaks about — and none when the language has no regions", async () => {
    const { unmount } = renderDictionaryList();
    await table();
    expect(
      screen.getByRole("combobox", { name: "Regional status in es-MX" }),
    ).toBeInTheDocument();
    unmount();

    renderDictionaryList({
      regionCodes: [],
      pages: {
        "0": dictionaryPage([word(1, { regionalStatus: null })], {
          regionCode: null,
          regionCodes: [],
        }),
      },
    });
    await table();
    expect(
      screen.queryByRole("combobox", { name: /Regional status/ }),
    ).toBeNull();
    // No region, so no regional column either.
    expect(screen.queryByText("es-MX")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("DictionaryListScreen — paging by offset, with a real total", () => {
  const manyPages = {
    "0": dictionaryPage(
      Array.from({ length: 25 }, (_, n) => word(n + 1)),
      { total: 52 },
    ),
    "25": dictionaryPage(
      Array.from({ length: 25 }, (_, n) => word(n + 26)),
      { total: 52 },
    ),
    "50": dictionaryPage([word(51), word(52)], { total: 52 }),
  };

  it("says where the page is in the queue, and offers only Next on the first page", async () => {
    renderDictionaryList({ pages: manyPages });
    await table();
    expect(screen.getByText("1–25 of 52")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("moves forward by a whole page, in the address, and back again", async () => {
    const user = userEvent.setup();
    renderDictionaryList({ pages: manyPages });
    await table();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByRole("link", { name: "Review palabra 26" });
    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/dictionary?language=lang-es&offset=25",
      expect.anything(),
    );
    expect(screen.getByText("26–50 of 52")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await screen.findByRole("link", { name: "Review palabra 1" });
    // The first page needs no offset.
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/admin/dictionary?language=lang-es",
      expect.anything(),
    );
  });

  it("holds Next and Previous while the page it moved to is still loading — moving on from rows that are no longer the address's would skip or repeat a page", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderDictionaryList({ pages: manyPages, pageGates: { "25": gate } });
    await table();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    // The first page's rows stay on screen while the second is on its way…
    expect(
      screen.getByRole("link", { name: "Review palabra 1" }),
    ).toBeVisible();
    // …and neither button will move on from them.
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();

    release();
    await screen.findByRole("link", { name: "Review palabra 26" });
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("shows a short last page honestly, and offers no Next past it", async () => {
    navigation.reset("language=lang-es&offset=50", PATH);
    renderDictionaryList({ pages: manyPages });
    await screen.findByRole("link", { name: "Review palabra 51" });
    expect(screen.getByText("51–52 of 52")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("offers no paging when everything fits on one page", async () => {
    renderDictionaryList();
    await table();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("DictionaryListScreen — empty states", () => {
  it("says so when nothing matches the filters", async () => {
    navigation.reset("language=lang-es&status=manual", PATH);
    renderDictionaryList({
      pages: { "0": dictionaryPage([], { total: 0 }) },
    });
    expect(
      await screen.findByText("No vocabulary matches these filters"),
    ).toBeVisible();
    expect(
      screen.getByText("Try a different filter, or clear one."),
    ).toBeVisible();
  });

  it("says so, differently, when the language has no vocabulary yet", async () => {
    renderDictionaryList({
      pages: { "0": dictionaryPage([], { total: 0 }) },
    });
    expect(
      await screen.findByText("No vocabulary in this language yet"),
    ).toBeVisible();
  });

  it("does not call a page past the end 'no vocabulary' — it offers the way back", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&offset=50", PATH);
    renderDictionaryList({
      pages: {
        "50": dictionaryPage([], { total: 40 }),
        "25": dictionaryPage([word(26)], { total: 40 }),
      },
    });
    expect(
      await screen.findByText("There is nothing more on this page"),
    ).toBeVisible();
    expect(screen.queryByText("No vocabulary in this language yet")).toBeNull();
    // There is no range to give for an empty page ("0–50 of 40" would be
    // nonsense); it says how many there are in all.
    const pager = screen.getByRole("navigation", { name: "Pagination" });
    expect(pager).toHaveTextContent("40 in all");
    expect(pager).not.toHaveTextContent("0–");

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(
      await screen.findByRole("link", { name: "Review palabra 26" }),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */

describe("DictionaryListScreen — confirming reviewed matches in a batch", () => {
  const pages = {
    "0": dictionaryPage([
      word(1, { displayWord: "gato" }),
      word(2, { displayWord: "perro", matchStatus: "review_required" }),
      word(3, {
        displayWord: "casa",
        matchStatus: "manual",
        manualLock: true,
        confirmable: false,
      }),
      word(4, {
        displayWord: "agua",
        matchStatus: null,
        entryLemma: null,
        confirmable: false,
      }),
    ]),
  };
  const BAR = { name: "Actions for the selected words" };

  /** The checkbox of the row whose Review link names `label`, if it has one. */
  const checkboxOf = (label: string) =>
    within(rowOf(label)).queryByRole("checkbox");

  it("lets only a row that has a candidate to confirm be selected", async () => {
    renderDictionaryList({ pages });
    await table();
    expect(checkboxOf("gato")).toBeEnabled();
    expect(checkboxOf("perro")).toBeEnabled();
    // Confirmed already, and no candidate at all: nothing to confirm, so the
    // box is there — the column stays aligned — and cannot be ticked.
    expect(checkboxOf("casa")).toBeDisabled();
    expect(checkboxOf("agua")).toBeDisabled();
  });

  it("does not carry a selection into another view of the queue — not even one that still lists the same word", async () => {
    const user = userEvent.setup();
    renderDictionaryList({ pages });
    await table();
    await user.click(checkboxOf("gato")!);
    expect(await screen.findByRole("group", BAR)).toHaveTextContent(
      "1 word selected",
    );

    // The scripted API answers every view with the same page, so "gato" is still
    // on screen after the filter changes: only the view's own scope can have
    // cleared what was ticked in the other one.
    await choose(user, /Match state/, "Needs review");
    await waitFor(() =>
      expect(navigation.push).toHaveBeenLastCalledWith(
        expect.stringContaining("status=review_required"),
        expect.anything(),
      ),
    );
    await screen.findByRole("link", { name: "Review gato" });
    expect(screen.queryByRole("group", BAR)).toBeNull();
    expect(checkboxOf("gato")).not.toBeChecked();
  });

  it("offers it to a writer, who authors mappings — and not to anyone whose permissions do not say so", async () => {
    const { unmount } = renderDictionaryList({ pages, role: "writer" });
    await table();
    expect(checkboxOf("gato")).toBeInTheDocument();
    unmount();

    // A role the server does not list the dictionary for: no selection at all.
    renderDictionaryList({ pages, role: "developer" });
    await table();
    expect(checkboxOf("gato")).toBeNull();
  });

  it("shows a bar that counts the selection, and clears it", async () => {
    const user = userEvent.setup();
    renderDictionaryList({ pages });
    await table();

    await user.click(checkboxOf("gato")!);
    const bar = await screen.findByRole("group", BAR);
    expect(bar).toHaveTextContent("1 word selected");
    await user.click(checkboxOf("perro")!);
    expect(bar).toHaveTextContent("2 words selected");

    await user.click(within(bar).getByRole("button", { name: "Unselect" }));
    expect(screen.queryByRole("group", BAR)).toBeNull();
  });

  it("asks first — what it will do to these words, and that it does not re-check them", async () => {
    const user = userEvent.setup();
    renderDictionaryList({ pages });
    await table();
    await user.click(checkboxOf("gato")!);
    await user.click(checkboxOf("perro")!);

    await user.click(
      within(await screen.findByRole("group", BAR)).getByRole("button", {
        name: "Confirm selected",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Confirm 2 mappings?",
    });
    expect(dialog).toHaveTextContent("locked against future automatic changes");
    expect(dialog).toHaveTextContent(
      "a published word is not changed until someone publishes that draft",
    );
    expect(dialog).toHaveTextContent("doesn't re-check them for you");
    expect(
      within(within(dialog).getByLabelText("Words to confirm"))
        .getAllByRole("listitem")
        .map((item) => item.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual(["gato · lema 1", "perro · lema 2"]);
    expect(bulkConfirm).not.toHaveBeenCalled();
  });

  async function confirmTwo(user: ReturnType<typeof userEvent.setup>) {
    await user.click(checkboxOf("gato")!);
    await user.click(checkboxOf("perro")!);
    await user.click(
      within(await screen.findByRole("group", BAR)).getByRole("button", {
        name: "Confirm selected",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Confirm 2 mappings?",
    });
    return dialog;
  }

  it("sends exactly the selected words under one fresh key, then says so, clears the selection and reads the queue again", async () => {
    const user = userEvent.setup();
    bulkConfirm.mockResolvedValue({
      ok: true,
      data: { confirmed: [word(1).id, word(2).id] },
    });
    const { listRequests, invalidate } = renderDictionaryList({ pages });
    await table();
    const reads = listRequests.length;
    const dialog = await confirmTwo(user);

    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Confirmed 2 mappings.")).toBeVisible();
    expect(bulkConfirm).toHaveBeenCalledExactlyOnceWith({
      vocabularyItemIds: [word(1).id, word(2).id],
      idempotencyKey: expect.stringMatching(UUID),
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("group", BAR)).toBeNull();
    expect(
      invalidate.mock.calls.map((call) => call[0]?.queryKey),
    ).toContainEqual(["dictionary"]);
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(reads));
  });

  it("says how many it confirmed when some needed no change", async () => {
    const user = userEvent.setup();
    bulkConfirm.mockResolvedValue({
      ok: true,
      data: { confirmed: [word(1).id] },
    });
    renderDictionaryList({ pages });
    await table();
    const dialog = await confirmTwo(user);

    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText(
        "Confirmed 1 of 2 mappings; the rest needed no change.",
      ),
    ).toBeVisible();
  });

  it("keeps the key when the same request is sent again after a failure that may pass", async () => {
    const user = userEvent.setup();
    bulkConfirm
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "UNKNOWN", message: "Something went wrong." },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { confirmed: [word(1).id, word(2).id] },
      });
    renderDictionaryList({ pages });
    await table();
    const dialog = await confirmTwo(user);

    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await within(dialog).findByText(
      "Something went wrong on our side. Please try again.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));

    await screen.findByText("Confirmed 2 mappings.");
    expect(bulkConfirm).toHaveBeenCalledTimes(2);
    expect(bulkConfirm.mock.calls[1]![0].idempotencyKey).toBe(
      bulkConfirm.mock.calls[0]![0].idempotencyKey,
    );
  });

  it.each([
    ["VOCABULARY_ITEM_NOT_FOUND", "That vocabulary item could not be found."],
    [
      "MAPPING_LOCKED",
      "This mapping was set manually and cannot be replaced automatically.",
    ],
  ])(
    "offers only to reload when the view is stale (%s) — never a blind retry",
    async (code, message) => {
      const user = userEvent.setup();
      bulkConfirm.mockResolvedValue({ ok: false, error: { code, message } });
      const { invalidate } = renderDictionaryList({ pages });
      await table();
      const dialog = await confirmTwo(user);

      await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

      await within(dialog).findByText(message);
      expect(
        within(dialog).queryByRole("button", { name: "Try again" }),
      ).toBeNull();
      await user.click(
        within(dialog).getByRole("button", { name: "Reload the list" }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.queryByRole("group", BAR)).toBeNull();
      expect(
        invalidate.mock.calls.map((call) => call[0]?.queryKey),
      ).toContainEqual(["dictionary"]);
    },
  );

  it("offers only Close, as a warning, when the person is no longer allowed", async () => {
    const user = userEvent.setup();
    bulkConfirm.mockResolvedValue({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "You don't have access to do that.",
      },
    });
    renderDictionaryList({ pages });
    await table();
    const dialog = await confirmTwo(user);

    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await within(dialog).findByText(
      "You don't have access to this part of the admin console.",
    );
    expect(
      within(dialog).queryByRole("button", { name: "Try again" }),
    ).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("clears the selection — and closes the question — when the page changes", async () => {
    const user = userEvent.setup();
    renderDictionaryList({
      pages: {
        ...pages,
        "0": { ...pages["0"], total: 40 },
        "25": dictionaryPage([word(26)], { total: 40 }),
      },
    });
    await table();
    await user.click(checkboxOf("gato")!);
    await screen.findByRole("group", BAR);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByRole("link", { name: "Review palabra 26" });

    expect(screen.queryByRole("group", BAR)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("DictionaryListScreen — failures", () => {
  it("explains a 403 with a route out, instead of an empty queue", async () => {
    renderDictionaryList({
      failList: () => new AdminApiError("FORBIDDEN", 403),
    });
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
    renderDictionaryList({
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
    const { queryClient } = renderDictionaryList({
      failList: () => (revoked ? new AdminApiError("FORBIDDEN", 403) : null),
    });
    await table();

    revoked = true;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["dictionary"] });
    });

    expect(
      await screen.findByText(
        "You don't have access to this part of the admin console.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("does not show the table until it knows the permissions — no checkboxes that flash and vanish", async () => {
    let release!: () => void;
    const meGate = new Promise<void>((resolve) => (release = resolve));
    renderDictionaryList({ meGate });
    // The list has answered; the permission lookup has not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("table")).toBeNull();

    release();
    expect(await table()).toBeVisible();
  });
});
