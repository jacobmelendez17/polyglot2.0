import { beforeEach, describe, expect, it, vi } from "vitest";

import { DECK_LIST_MAX } from "@/domains/admin";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getLanguages = vi.hoisted(() => vi.fn());
const listPolyglotDecks = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/curriculum/server", () => ({ getLanguages }));
vi.mock("@/domains/decks/server", () => ({ listPolyglotDecks }));

import { GET as getDecks } from "./decks/route";

const LANGUAGE = "5b2eb57d-acb8-4964-8af4-49a417cf227a";
const ORIGIN = "http://localhost";

function userWithRole(role: UserRole): PolyglotUser {
  return {
    id: `user-${role}`,
    clerkUserId: "clerk_must_never_appear",
    role,
    displayName: "Private Name",
    username: "private-username",
    timezone: "UTC",
    activeLanguageId: LANGUAGE,
    isSandbox: false,
    sandboxOwnerUserId: null,
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

/** Who may *read* the official decks: whoever may author — an Admin, and (since the owner's decision of 2026-10-14) a writer. */
const MAY_READ = ["admin", "writer"] as const;
const CANNOT_READ = USER_ROLES.filter(
  (role) => !(MAY_READ as readonly string[]).includes(role),
);

/** What the service returns: the deck record, with its owner and gate level's id, plus two computed fields. */
function deck(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    languageId: LANGUAGE,
    kind: "polyglot",
    ownerUserId: "owner-must-never-appear",
    name: `Deck ${String(n).padStart(3, "0")}`,
    description: "Colors and shapes",
    availability: "theme",
    gateLevelId: "gate-level-id-must-never-appear",
    gateLevelNumber: null,
    itemCount: 12,
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [requireUser, getLanguages, listPolyglotDecks]) {
    mock.mockReset();
  }
  requireUser.mockResolvedValue(userWithRole("admin"));
  getLanguages.mockResolvedValue([{ id: LANGUAGE, name: "Spanish" }]);
  listPolyglotDecks.mockResolvedValue([deck(1)]);
});

const get = (query: Record<string, string> = { language: LANGUAGE }) =>
  getDecks(
    new Request(
      `${ORIGIN}/api/v1/admin/decks${
        Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""
      }`,
      { method: "GET" },
    ),
  );

describe("GET /api/v1/admin/decks", () => {
  describe("authorization — whoever may author, from the database role", () => {
    it("answers 401 with no session, and reads nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get()).status).toBe(401);
      expect(listPolyglotDecks).not.toHaveBeenCalled();
    });

    it.each(CANNOT_READ)(
      "answers 403 for %s, and reads nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await get();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(listPolyglotDecks).not.toHaveBeenCalled();
      },
    );

    it.each(MAY_READ)("answers 200 for %s", async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      expect((await get()).status).toBe(200);
    });

    it("re-evaluates the role on every call, so a demoted Admin is refused at once", async () => {
      expect((await get()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("developer"));
      expect((await get()).status).toBe(403);
      expect(listPolyglotDecks).toHaveBeenCalledOnce();
    });

    it("gives a writer exactly what it gives an Admin — the list is read-only for both", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      const writer = await (await get()).json();
      requireUser.mockResolvedValue(userWithRole("admin"));
      expect(await (await get()).json()).toEqual(writer);
    });

    it("does not reveal its parameters to someone who may not read", async () => {
      requireUser.mockResolvedValue(userWithRole("developer"));
      expect((await get({ kind: "personal" })).status).toBe(403);
    });
  });

  describe("the query — a language, and nothing else", () => {
    it("asks the service for that language's official decks only", async () => {
      await get();
      expect(listPolyglotDecks).toHaveBeenCalledExactlyOnceWith(LANGUAGE);
    });

    it.each([
      ["no language", {}],
      ["a language that is not an id", { language: "es" }],
      [
        "a way to ask for personal decks",
        { language: LANGUAGE, kind: "personal" },
      ],
      ["an owner", { language: LANGUAGE, owner: "someone" }],
      ["a sort", { language: LANGUAGE, sort: "name" }],
      ["a page size", { language: LANGUAGE, limit: "5" }],
      ["a cursor", { language: LANGUAGE, cursor: "x" }],
    ])("answers 422 for %s", async (_name, query) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(listPolyglotDecks).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist, reading nothing", async () => {
      const response = await get({
        language: "00000000-0000-4000-8000-0000000000ff",
      });
      expect(response.status).toBe(404);
      expect(listPolyglotDecks).not.toHaveBeenCalled();
    });
  });

  describe("the answer", () => {
    it("is the decks, as the contract describes them, uncacheable", async () => {
      listPolyglotDecks.mockResolvedValue([
        deck(1, { name: "Colors", itemCount: 8 }),
        deck(2, {
          name: "Animals",
          description: null,
          availability: "level",
          gateLevelNumber: 3,
          itemCount: 21,
        }),
      ]);
      const response = await get();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({
        data: {
          // By name, whatever order the service returned them in.
          items: [
            {
              id: "d0000000-0000-4000-8000-000000000002",
              name: "Animals",
              description: null,
              itemCount: 21,
              availability: "level",
              gateLevelNumber: 3,
            },
            {
              id: "d0000000-0000-4000-8000-000000000001",
              name: "Colors",
              description: "Colors and shapes",
              itemCount: 8,
              availability: "theme",
              gateLevelNumber: null,
            },
          ],
          truncated: false,
        },
      });
    });

    it("never carries an owner, a gate level's id, or the deck's kind", async () => {
      const text = await (await get()).text();
      for (const secret of [
        "owner-must-never-appear",
        "gate-level-id-must-never-appear",
        "ownerUserId",
        "gateLevelId",
        "kind",
        "clerk_must_never_appear",
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it("is bounded, and says so when there are more decks than it shows", async () => {
      listPolyglotDecks.mockResolvedValue(
        Array.from({ length: DECK_LIST_MAX + 1 }, (_, n) => deck(n + 1)),
      );
      const { data } = await (await get()).json();
      expect(data.items).toHaveLength(DECK_LIST_MAX);
      expect(data.truncated).toBe(true);
    });

    it("is empty, not an error, for a language with no official deck", async () => {
      listPolyglotDecks.mockResolvedValue([]);
      const { data } = await (await get()).json();
      expect(data).toEqual({ items: [], truncated: false });
    });
  });

  describe("failures", () => {
    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      listPolyglotDecks.mockRejectedValue(
        new Error("select * from secret_table"),
      );
      const response = await get();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("secret_table");
      log.mockRestore();
    });

    it("is a generic 500 — not a 422 that blames the caller — when the service breaks the contract", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      listPolyglotDecks.mockResolvedValue([
        deck(1, { availability: "sometimes" }),
      ]);
      expect((await get()).status).toBe(500);
      log.mockRestore();
    });
  });
});
