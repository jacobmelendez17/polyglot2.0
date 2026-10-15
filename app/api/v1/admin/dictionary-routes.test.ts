import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DICTIONARY_LIST_PAGE_SIZE,
  MAPPING_MATCH_STATUSES,
} from "@/domains/admin";
import { getLexicalLanguageProvider } from "@/domains/lexicon";
import type { MappingQueueRow } from "@/domains/lexicon";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getLanguages = vi.hoisted(() => vi.fn());
const getLevelById = vi.hoisted(() => vi.fn());
const getVocabularyGroupsByLanguage = vi.hoisted(() => vi.fn());
const getMappingQueue = vi.hoisted(() => vi.fn());
const getMappingStatusCounts = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/curriculum/server", () => ({
  getLanguages,
  getLevelById,
  getVocabularyGroupsByLanguage,
}));
vi.mock("@/domains/lexicon/server", () => ({
  getMappingQueue,
  getMappingStatusCounts,
}));

import { GET as getDictionary } from "./dictionary/route";

const LANGUAGE = "5b2eb57d-acb8-4964-8af4-49a417cf227a";
const OTHER_LANGUAGE = "6c3fc68e-bdc9-4a75-9bf5-5ab528d338b";
const LEVEL = "70000000-0000-4000-8000-000000000001";
const GROUP = "80000000-0000-4000-8000-000000000001";
const ITEM = "90000000-0000-4000-8000-000000000001";
const ORIGIN = "http://localhost";
/** The Spanish provider's own regions — what the route must default to and accept. */
const REGIONS = getLexicalLanguageProvider("es-MX").regionCodes;

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

/** Who may read the queue: whoever may author. */
const CANNOT_READ = USER_ROLES.filter(
  (role) => role !== "admin" && role !== "writer",
);

function row(overrides: Partial<MappingQueueRow> = {}): MappingQueueRow {
  return {
    vocabularyItemId: ITEM,
    displayWord: "el gato",
    translation: "cat",
    levelNumber: 1,
    groupName: "Animals",
    curriculumPartOfSpeech: "noun",
    lookupForm: "gato",
    matchStatus: "auto_matched",
    confidence: "high",
    reviewReason: null,
    manualLock: false,
    entryId: "a0000000-0000-4000-8000-000000000001",
    entryLemma: "gato",
    entryPartOfSpeech: "noun",
    regionalStatus: "recognized",
    ...overrides,
  };
}

const COUNTS = {
  unmatched: 3,
  source_data_not_imported: 1,
  auto_matched: 20,
  review_required: 4,
  manual: 9,
  no_mapping: 2,
};

beforeEach(() => {
  for (const mock of [
    requireUser,
    getLanguages,
    getLevelById,
    getVocabularyGroupsByLanguage,
    getMappingQueue,
    getMappingStatusCounts,
  ]) {
    mock.mockReset();
  }
  requireUser.mockResolvedValue(userWithRole("admin"));
  getLanguages.mockResolvedValue([
    { id: LANGUAGE, code: "es-MX", name: "Spanish" },
    { id: OTHER_LANGUAGE, code: "fr", name: "French" },
  ]);
  getLevelById.mockResolvedValue({ id: LEVEL, languageId: LANGUAGE });
  getVocabularyGroupsByLanguage.mockResolvedValue([
    { id: GROUP, levelId: LEVEL, name: "Animals" },
  ]);
  getMappingQueue.mockResolvedValue({ rows: [row()], total: 1 });
  getMappingStatusCounts.mockResolvedValue(COUNTS);
});

const get = (query: Record<string, string> = { language: LANGUAGE }) =>
  getDictionary(
    new Request(
      `${ORIGIN}/api/v1/admin/dictionary${
        Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""
      }`,
      { method: "GET" },
    ),
  );

describe("GET /api/v1/admin/dictionary", () => {
  describe("authorization — whoever may author, from the database role", () => {
    it("answers 401 with no session, and reads nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get()).status).toBe(401);
      expect(getMappingQueue).not.toHaveBeenCalled();
    });

    it.each(CANNOT_READ)(
      "answers 403 for %s, and reads nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await get();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(getMappingQueue).not.toHaveBeenCalled();
        expect(getMappingStatusCounts).not.toHaveBeenCalled();
      },
    );

    it.each(["admin", "writer"] as const)(
      "answers 200 for %s — a writer finds and confirms mappings",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        expect((await get()).status).toBe(200);
      },
    );

    it("re-evaluates the role on every call", async () => {
      expect((await get()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("developer"));
      expect((await get()).status).toBe(403);
      expect(getMappingQueue).toHaveBeenCalledOnce();
    });

    it("does not reveal its parameters to someone who may not read", async () => {
      requireUser.mockResolvedValue(userWithRole("developer"));
      expect((await get({ sort: "x" })).status).toBe(403);
    });
  });

  describe("the query", () => {
    it("reads the first page at the default size, in the language's first region", async () => {
      await get();
      expect(getMappingQueue).toHaveBeenCalledExactlyOnceWith({
        languageId: LANGUAGE,
        levelId: undefined,
        vocabularyGroupId: undefined,
        matchStatus: undefined,
        partOfSpeech: undefined,
        regionCode: REGIONS[0],
        regionalStatus: undefined,
        limit: DICTIONARY_LIST_PAGE_SIZE,
        offset: 0,
      });
      expect(getMappingStatusCounts).toHaveBeenCalledExactlyOnceWith(LANGUAGE);
    });

    it("hands every filter, the offset and the size to the service", async () => {
      await get({
        language: LANGUAGE,
        level: LEVEL,
        group: GROUP,
        status: "review_required",
        pos: "verb",
        region: REGIONS[1]!,
        regional: "not_listed",
        offset: "50",
        limit: "10",
      });
      expect(getMappingQueue).toHaveBeenCalledExactlyOnceWith({
        languageId: LANGUAGE,
        levelId: LEVEL,
        vocabularyGroupId: GROUP,
        matchStatus: "review_required",
        partOfSpeech: "verb",
        regionCode: REGIONS[1],
        regionalStatus: "not_listed",
        limit: 10,
        offset: 50,
      });
    });

    it.each(MAPPING_MATCH_STATUSES)(
      "accepts the %s match state",
      async (status) => {
        expect((await get({ language: LANGUAGE, status })).status).toBe(200);
      },
    );

    it.each([
      ["no language", {}],
      ["a language that is not an id", { language: "es" }],
      ["a sort", { language: LANGUAGE, sort: "word" }],
      ["a search", { language: LANGUAGE, search: "gato" }],
      [
        "a cursor — this queue pages by offset",
        { language: LANGUAGE, cursor: "x" },
      ],
      [
        "a match state that does not exist",
        { language: LANGUAGE, status: "done" },
      ],
      [
        "a part of speech outside the offered set",
        { language: LANGUAGE, pos: "interjection" },
      ],
      [
        "a regional status that does not exist",
        { language: LANGUAGE, regional: "maybe" },
      ],
      ["an offset below zero", { language: LANGUAGE, offset: "-1" }],
      [
        "an offset that is not a number",
        { language: LANGUAGE, offset: "lots" },
      ],
      ["a size over the cap", { language: LANGUAGE, limit: "101" }],
      ["a size of zero", { language: LANGUAGE, limit: "0" }],
    ])("answers 422 for %s", async (_name, query) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(getMappingQueue).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist, reading nothing", async () => {
      const response = await get({
        language: "00000000-0000-4000-8000-0000000000ff",
      });
      expect(response.status).toBe(404);
      expect(getMappingQueue).not.toHaveBeenCalled();
    });

    it("answers 422 for a level that belongs to another language — never an empty queue", async () => {
      getLevelById.mockResolvedValue({ id: LEVEL, languageId: OTHER_LANGUAGE });
      const response = await get({ language: LANGUAGE, level: LEVEL });
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "That level doesn't belong to the selected language.",
      );
      expect(getMappingQueue).not.toHaveBeenCalled();
    });

    it("answers 422 for a level that does not exist, in the same words", async () => {
      getLevelById.mockResolvedValue(null);
      const response = await get({ language: LANGUAGE, level: LEVEL });
      expect(response.status).toBe(422);
      expect(getMappingQueue).not.toHaveBeenCalled();
    });

    it("answers 422 for a group that is not one of this language's", async () => {
      getVocabularyGroupsByLanguage.mockResolvedValue([]);
      const response = await get({ language: LANGUAGE, group: GROUP });
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "That group doesn't belong to the selected language.",
      );
      expect(getVocabularyGroupsByLanguage).toHaveBeenCalledWith(LANGUAGE);
      expect(getMappingQueue).not.toHaveBeenCalled();
    });

    it("answers 422 for a region the language's dictionary does not cover", async () => {
      const response = await get({ language: LANGUAGE, region: "xx-YY" });
      expect(response.status).toBe(422);
      expect(getMappingQueue).not.toHaveBeenCalled();
    });

    it("has no region at all for a language whose dictionary covers none, and asks the queue for none", async () => {
      getLanguages.mockResolvedValue([
        { id: LANGUAGE, code: "xx", name: "Elsewhere" },
      ]);
      const response = await get();
      const { data } = await response.json();
      expect(data.regionCode).toBeNull();
      expect(data.regionCodes).toEqual([]);
      expect(getMappingQueue).toHaveBeenCalledWith(
        expect.objectContaining({ regionCode: undefined }),
      );
    });

    it("never looks for a level or a group nobody named", async () => {
      await get();
      expect(getLevelById).not.toHaveBeenCalled();
      expect(getVocabularyGroupsByLanguage).not.toHaveBeenCalled();
    });
  });

  describe("the answer", () => {
    it("is the queue, as the contract describes it, uncacheable", async () => {
      getMappingQueue.mockResolvedValue({
        rows: [
          row(),
          row({
            vocabularyItemId: "90000000-0000-4000-8000-000000000002",
            displayWord: "casa",
            matchStatus: null,
            confidence: null,
            lookupForm: null,
            entryId: null,
            entryLemma: null,
            entryPartOfSpeech: null,
            regionalStatus: null,
          }),
        ],
        total: 52,
      });
      const response = await get();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const { data } = await response.json();
      expect(data.total).toBe(52);
      expect(data.counts).toEqual(COUNTS);
      expect(data.regionCode).toBe(REGIONS[0]);
      expect(data.regionCodes).toEqual([...REGIONS]);
      expect(data.items).toEqual([
        {
          id: ITEM,
          displayWord: "el gato",
          translation: "cat",
          levelNumber: 1,
          groupName: "Animals",
          lookupForm: "gato",
          matchStatus: "auto_matched",
          confidence: "high",
          reviewReason: null,
          manualLock: false,
          entryLemma: "gato",
          entryPartOfSpeech: "noun",
          confirmable: true,
          regionalStatus: "recognized",
        },
        {
          id: "90000000-0000-4000-8000-000000000002",
          displayWord: "casa",
          translation: "cat",
          levelNumber: 1,
          groupName: "Animals",
          lookupForm: null,
          matchStatus: null,
          confidence: null,
          reviewReason: null,
          manualLock: false,
          entryLemma: null,
          entryPartOfSpeech: null,
          // Nothing matched, so nothing to confirm.
          confirmable: false,
          regionalStatus: null,
        },
      ]);
    });

    it("says a confirmed (manual) match is not confirmable again, and a candidate that is not confirmed is", async () => {
      getMappingQueue.mockResolvedValue({
        rows: [
          row({ matchStatus: "manual", manualLock: true }),
          row({
            vocabularyItemId: "90000000-0000-4000-8000-000000000003",
            matchStatus: "review_required",
            reviewReason: "multiple_candidates",
          }),
        ],
        total: 2,
      });
      const { data } = await (await get()).json();
      expect(
        data.items.map((item: { confirmable: boolean }) => item.confirmable),
      ).toEqual([false, true]);
      expect(data.items[1].reviewReason).toBe("multiple_candidates");
    });

    it("never carries the dictionary entry's id, the curriculum's part of speech, or anything private", async () => {
      const text = await (await get()).text();
      for (const secret of [
        "a0000000-0000-4000-8000-000000000001",
        "entryId",
        "curriculumPartOfSpeech",
        "clerk_must_never_appear",
        "Private Name",
        "private-username",
      ]) {
        expect(text).not.toContain(secret);
      }
    });
  });

  describe("failures", () => {
    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      getMappingQueue.mockRejectedValue(
        new Error("select * from secret_table"),
      );
      const response = await get();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("secret_table");
      log.mockRestore();
    });

    it("is a generic 500 — not a 422 that blames the caller — when the service's page breaks the contract", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      getMappingQueue.mockResolvedValue({
        rows: [row({ matchStatus: "invented" as never })],
        total: 1,
      });
      expect((await get()).status).toBe(500);
      log.mockRestore();
    });
  });
});
