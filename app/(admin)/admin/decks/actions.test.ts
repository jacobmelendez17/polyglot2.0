import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_ROLES, type UserRole } from "@/domains/users";

const requireUser = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const services = vi.hoisted(() => ({
  addPolyglotDeckItems: vi.fn(),
  createPolyglotDeck: vi.fn(),
  deletePolyglotDeck: vi.fn(),
  listPublishedItemsForAdmin: vi.fn(),
  removePolyglotDeckItem: vi.fn(),
  reorderPolyglotDeckItems: vi.fn(),
  updatePolyglotDeck: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/decks/server", () => services);

import * as actions from "./actions";

const DECK = "80000000-0000-4000-8000-000000000001";
const ITEM = "90000000-0000-4000-8000-000000000002";

function signedInAs(role: UserRole, id = `user-${role}`) {
  requireUser.mockResolvedValue({ id, role });
}

beforeEach(() => {
  requireUser.mockReset();
  revalidatePath.mockReset();
  for (const service of Object.values(services)) {
    service.mockReset();
    service.mockResolvedValue(undefined);
  }
  services.createPolyglotDeck.mockResolvedValue({ deckId: DECK });
  services.addPolyglotDeckItems.mockResolvedValue({ addedCount: 1 });
  services.listPublishedItemsForAdmin.mockResolvedValue([]);
});

/**
 * A writer may now *see* the official decks (the list and a read-only deck
 * page), so these Server Actions — the deck editor's only way to change
 * anything, with no HTTP route beside them — are the control that keeps a writer
 * from changing one. Hiding the editor from a writer is a convenience; this is
 * the rule: **Admin only, from the session, on every call.**
 */
const CALLS: {
  name: string;
  run: () => Promise<{ ok: boolean }>;
  service: keyof typeof services;
}[] = [
  {
    name: "createPolyglotDeckAction",
    run: () =>
      actions.createPolyglotDeckAction({
        languageId: "lang-1",
        name: "Food",
        description: null,
        learningItemIds: [ITEM],
        availability: "theme",
        gateLevelId: null,
      }),
    service: "createPolyglotDeck",
  },
  {
    name: "updatePolyglotDeckAction",
    run: () =>
      actions.updatePolyglotDeckAction({
        deckId: DECK,
        name: "Food",
        description: "Words for the table",
        availability: "theme",
        gateLevelId: null,
      }),
    service: "updatePolyglotDeck",
  },
  {
    name: "addPolyglotDeckItemsAction",
    run: () =>
      actions.addPolyglotDeckItemsAction({
        deckId: DECK,
        learningItemIds: [ITEM],
      }),
    service: "addPolyglotDeckItems",
  },
  {
    name: "removePolyglotDeckItemAction",
    run: () =>
      actions.removePolyglotDeckItemAction({
        deckId: DECK,
        learningItemId: ITEM,
      }),
    service: "removePolyglotDeckItem",
  },
  {
    name: "reorderPolyglotDeckItemsAction",
    run: () =>
      actions.reorderPolyglotDeckItemsAction({
        deckId: DECK,
        orderedLearningItemIds: [ITEM],
      }),
    service: "reorderPolyglotDeckItems",
  },
  {
    name: "deletePolyglotDeckAction",
    run: () => actions.deletePolyglotDeckAction({ deckId: DECK }),
    service: "deletePolyglotDeck",
  },
  {
    name: "searchPublishedItemsAction",
    run: () =>
      actions.searchPublishedItemsAction({
        languageId: "lang-1",
        search: "co",
      }),
    service: "listPublishedItemsForAdmin",
  },
];

describe.each(CALLS)("$name — who may use it", (call) => {
  it("lets an Admin", async () => {
    signedInAs("admin");
    await expect(call.run()).resolves.toMatchObject({ ok: true });
    expect(services[call.service]).toHaveBeenCalledOnce();
  });

  // Not just learners: a writer reads the decks now, and a developer is admitted
  // to the admin area — neither may change a deck, or even search the picker.
  it.each(USER_ROLES.filter((role) => role !== "admin"))(
    "refuses a %s, and never reaches the service",
    async (role) => {
      signedInAs(role);
      await expect(call.run()).resolves.toEqual({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "You don't have access to do that.",
        },
      });
      expect(services[call.service]).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("refuses a visitor with no session", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    requireUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const result = await call.run();
    quiet.mockRestore();
    expect(result.ok).toBe(false);
    expect(services[call.service]).not.toHaveBeenCalled();
  });
});

describe("the actions take who is asking from the session, never from the request", () => {
  it.each([
    [
      "create",
      () =>
        actions.createPolyglotDeckAction({
          languageId: "lang-1",
          name: "Food",
          description: null,
          learningItemIds: [ITEM],
          availability: "theme",
          gateLevelId: null,
          actorUserId: "someone-else",
        } as never),
      "createPolyglotDeck",
    ],
    [
      "update",
      () =>
        actions.updatePolyglotDeckAction({
          deckId: DECK,
          name: "Food",
          description: null,
          availability: "theme",
          gateLevelId: null,
          actorUserId: "someone-else",
        } as never),
      "updatePolyglotDeck",
    ],
    [
      "delete",
      () =>
        actions.deletePolyglotDeckAction({
          deckId: DECK,
          actorUserId: "someone-else",
        } as never),
      "deletePolyglotDeck",
    ],
  ] as const)(
    "%s ignores an actor in the input",
    async (_name, run, service) => {
      signedInAs("admin", "the-admin");

      await run();

      expect(services[service]).toHaveBeenCalledOnce();
      expect(services[service].mock.calls[0]![0]).toMatchObject({
        actorUserId: "the-admin",
      });
    },
  );
});

describe("input is validated at the boundary", () => {
  it.each([
    [
      "a deck id that is not a UUID",
      () => actions.deletePolyglotDeckAction({ deckId: "nope" }),
      "deletePolyglotDeck",
    ],
    [
      "a deck with no items",
      () =>
        actions.addPolyglotDeckItemsAction({
          deckId: DECK,
          learningItemIds: [],
        }),
      "addPolyglotDeckItems",
    ],
    [
      "a level deck that names no level",
      () =>
        actions.updatePolyglotDeckAction({
          deckId: DECK,
          name: "Food",
          description: null,
          availability: "level",
        } as never),
      "updatePolyglotDeck",
    ],
  ] as const)(
    "refuses %s without reaching the service",
    async (_what, run, service) => {
      signedInAs("admin");

      await expect(run()).resolves.toMatchObject({
        ok: false,
        error: { code: "DECK_VALIDATION_FAILED" },
      });
      expect(services[service]).not.toHaveBeenCalled();
    },
  );
});
