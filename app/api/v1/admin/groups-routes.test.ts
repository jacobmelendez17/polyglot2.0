import { beforeEach, describe, expect, it, vi } from "vitest";

import { GROUP_LIST_MAX } from "@/domains/admin";
import type {
  CurriculumLevel,
  CurriculumVocabularyGroup,
} from "@/domains/curriculum";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getLanguages = vi.hoisted(() => vi.fn());
const getLevelById = vi.hoisted(() => vi.fn());
const getVocabularyGroupsByLevel = vi.hoisted(() => vi.fn());
const createVocabularyGroup = vi.hoisted(() => vi.fn());
const updateVocabularyGroup = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/curriculum/server", () => ({
  getLanguages,
  getLevelById,
  getVocabularyGroupsByLevel,
}));
vi.mock("@/domains/admin/server", () => ({
  createVocabularyGroup,
  updateVocabularyGroup,
}));

import { GET as getGroups, POST as postGroup } from "./groups/route";
import { PATCH as patchGroup } from "./groups/[groupId]/route";

const LANGUAGE = "5b2eb57d-acb8-4964-8af4-49a417cf227a";
const OTHER_LANGUAGE = "a1111111-1111-4111-8111-111111111111";
const LEVEL = "133c9db4-dc71-4a7c-acf7-d55394ffdb42";
const GROUP = "c4a33b64-90e5-44ef-8eef-0a9f6d6d1d99";
const KEY = "0881836c-de9a-4dc5-84f7-1dd28b8fa439";
const ORIGIN = "http://localhost";

function userWithRole(role: UserRole, id = `user-${role}`): PolyglotUser {
  return {
    id,
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

const ADMIN_AREA_ROLES = ["admin", "writer", "developer"] as const;
const CANNOT_READ = USER_ROLES.filter(
  (role) => role !== "admin" && role !== "writer",
);
const CANNOT_CHANGE = USER_ROLES.filter((role) => role !== "admin");

const BROWSER = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

function level(overrides: Partial<CurriculumLevel> = {}): CurriculumLevel {
  return {
    id: LEVEL,
    languageId: LANGUAGE,
    levelNumber: 3,
    name: null,
    status: "published",
    cefrLevel: null,
    ...overrides,
  };
}

function group(
  position: number,
  overrides: Partial<CurriculumVocabularyGroup> = {},
): CurriculumVocabularyGroup {
  return {
    id: `group-${position}`,
    levelId: LEVEL,
    languageId: LANGUAGE,
    name: `Group ${position}`,
    position,
    status: "draft",
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [
    requireUser,
    getLanguages,
    getLevelById,
    getVocabularyGroupsByLevel,
    createVocabularyGroup,
    updateVocabularyGroup,
  ]) {
    mock.mockReset();
  }
  getLanguages.mockResolvedValue([
    { id: LANGUAGE, name: "Spanish" },
    { id: OTHER_LANGUAGE, name: "French" },
  ]);
  getLevelById.mockResolvedValue(level());
  getVocabularyGroupsByLevel.mockResolvedValue([]);
});

/* -------------------------------------------------------------------------- */
/* GET /api/v1/admin/groups                                                   */
/* -------------------------------------------------------------------------- */

const getUrl = (
  query: Record<string, string> = { language: LANGUAGE, level: LEVEL },
) => `${ORIGIN}/api/v1/admin/groups?${new URLSearchParams(query)}`;
const get = (query?: Record<string, string>) =>
  getGroups(new Request(getUrl(query), { method: "GET" }));

describe("GET /api/v1/admin/groups", () => {
  beforeEach(() => {
    // Block-bodied: a function returned from `beforeEach` is run as a cleanup
    // callback, and returning the mock would call it again afterwards.
    requireUser.mockResolvedValue(userWithRole("admin"));
  });

  it("answers 401 with no session, and reads nothing", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    expect((await get()).status).toBe(401);
    expect(getVocabularyGroupsByLevel).not.toHaveBeenCalled();
  });

  it.each(CANNOT_READ)(
    "answers 403 for %s, and reads nothing",
    async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      const response = await get();
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(getVocabularyGroupsByLevel).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "writer"] as const)("answers 200 for %s", async (role) => {
    requireUser.mockResolvedValue(userWithRole(role));
    expect((await get()).status).toBe(200);
  });

  it("reads exactly the requested level's groups, in one query", async () => {
    await get();
    expect(getVocabularyGroupsByLevel).toHaveBeenCalledExactlyOnceWith(LEVEL);
  });

  it("returns the level's groups by position, in every status", async () => {
    getVocabularyGroupsByLevel.mockResolvedValue([
      group(3, { name: "Colors", status: "published" }),
      group(1, { name: "Numbers", status: "archived" }),
      group(2, { name: "Animals", status: "pending" }),
    ]);
    const { data } = await (await get()).json();
    expect(data).toEqual({
      items: [
        {
          id: "group-1",
          levelId: LEVEL,
          name: "Numbers",
          status: "archived",
          position: 1,
        },
        {
          id: "group-2",
          levelId: LEVEL,
          name: "Animals",
          status: "pending",
          position: 2,
        },
        {
          id: "group-3",
          levelId: LEVEL,
          name: "Colors",
          status: "published",
          position: 3,
        },
      ],
      truncated: false,
    });
  });

  it("answers an empty list — not an error — for a level with no groups yet", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      items: [],
      truncated: false,
    });
  });

  it("is bounded, and says so", async () => {
    getVocabularyGroupsByLevel.mockResolvedValue(
      Array.from({ length: GROUP_LIST_MAX + 2 }, (_, i) => group(i + 1)),
    );
    const { data } = await (await get()).json();
    expect(data.items).toHaveLength(GROUP_LIST_MAX);
    expect(data.truncated).toBe(true);
  });

  it("is uncacheable, and never exposes who or what is behind a group", async () => {
    getVocabularyGroupsByLevel.mockResolvedValue([
      { ...group(1), curriculumKey: "es-MX:group:abc" } as never,
    ]);
    const response = await get();
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text).not.toContain("clerk_must_never_appear");
    expect(text).not.toContain("curriculumKey");
    expect(text).not.toContain("languageId");
  });

  describe("what it refuses", () => {
    it.each([
      ["no language", { level: LEVEL }],
      [
        "no level — groups are read one level at a time",
        { language: LANGUAGE },
      ],
      ["a language that is not an id", { language: "lang-es", level: LEVEL }],
      ["a level that is not an id", { language: LANGUAGE, level: "level-1" }],
      ["a sort", { language: LANGUAGE, level: LEVEL, sort: "name" }],
      ["a page number", { language: LANGUAGE, level: LEVEL, page: "2" }],
      ["a limit", { language: LANGUAGE, level: LEVEL, limit: "5" }],
      ["a cursor", { language: LANGUAGE, level: LEVEL, cursor: "x" }],
      [
        "a filter it does not have",
        { language: LANGUAGE, level: LEVEL, status: "draft" },
      ],
    ])("answers 422 for %s", async (_name, query) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      expect(getVocabularyGroupsByLevel).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist, reading no groups", async () => {
      getLanguages.mockResolvedValue([]);
      expect((await get()).status).toBe(404);
      expect(getVocabularyGroupsByLevel).not.toHaveBeenCalled();
    });

    it("answers 422 for a level in another language, reading no groups", async () => {
      getLevelById.mockResolvedValue(level({ languageId: OTHER_LANGUAGE }));
      const response = await get();
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "That level doesn't belong to the selected language.",
      );
      expect(getVocabularyGroupsByLevel).not.toHaveBeenCalled();
    });

    it("answers the same 422 for a level that does not exist at all", async () => {
      getLevelById.mockResolvedValue(null);
      const response = await get();
      expect(response.status).toBe(422);
      expect(getVocabularyGroupsByLevel).not.toHaveBeenCalled();
    });

    it("does not reveal its parameters to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get({ sort: "x" })).status).toBe(401);
    });
  });

  it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
    getVocabularyGroupsByLevel.mockRejectedValue(
      new Error("connection to vocabulary_groups_pkey failed"),
    );
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("vocabulary_groups_pkey");
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/v1/admin/groups                                                  */
/* -------------------------------------------------------------------------- */

const CREATE_URL = `${ORIGIN}/api/v1/admin/groups`;
const CREATE_BODY = {
  languageId: LANGUAGE,
  levelId: LEVEL,
  name: "Colors",
  idempotencyKey: KEY,
};

function post({
  body = CREATE_BODY as unknown,
  headers = BROWSER as Record<string, string>,
  url = CREATE_URL,
}: { body?: unknown; headers?: Record<string, string>; url?: string } = {}) {
  return postGroup(
    new Request(url, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/v1/admin/groups", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue(userWithRole("admin", "the-admin"));
    createVocabularyGroup.mockResolvedValue({ groupId: GROUP });
  });

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and creates nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await post()).status).toBe(401);
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });

    it.each(CANNOT_CHANGE)(
      "answers 403 for %s, and creates nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await post();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(createVocabularyGroup).not.toHaveBeenCalled();
      },
    );

    it("refuses a writer who can read the same groups", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await get()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await post()).status).toBe(403);
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });

    it("re-evaluates the role on every call", async () => {
      expect((await post()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await post()).status).toBe(403);
      expect(createVocabularyGroup).toHaveBeenCalledOnce();
    });

    it("does not reveal body validation to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await post({ body: { nonsense: true } })).status).toBe(401);
    });
  });

  describe("the command", () => {
    it("creates the group as the *authenticated* user, in the named level, with the client's key", async () => {
      const response = await post();
      expect(response.status).toBe(200);
      expect(createVocabularyGroup).toHaveBeenCalledExactlyOnceWith({
        levelId: LEVEL,
        languageId: LANGUAGE,
        name: "Colors",
        idempotencyKey: KEY,
        actorUserId: "the-admin",
      });
    });

    it("trims the name before it reaches the service", async () => {
      await post({ body: { ...CREATE_BODY, name: "  Colors  " } });
      expect(createVocabularyGroup.mock.calls[0]![0].name).toBe("Colors");
    });

    it("answers the new group's id, uncacheable", async () => {
      const response = await post();
      expect(await response.json()).toEqual({ data: { groupId: GROUP } });
      expect(response.headers.get("cache-control")).toContain("no-store");
    });

    it("never accepts a position — the server appends — or an actor, from the body", async () => {
      for (const extra of [{ position: 1 }, { actorUserId: "someone-else" }]) {
        const response = await post({ body: { ...CREATE_BODY, ...extra } });
        expect(response.status).toBe(422);
      }
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist, creating nothing", async () => {
      getLanguages.mockResolvedValue([]);
      expect((await post()).status).toBe(404);
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 422 for a level in another language, creating nothing", async () => {
      getLevelById.mockResolvedValue(level({ languageId: OTHER_LANGUAGE }));
      const response = await post();
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "That level doesn't belong to the selected language.",
      );
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 422 for a level that does not exist, creating nothing", async () => {
      getLevelById.mockResolvedValue(null);
      expect((await post()).status).toBe(422);
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });
  });

  describe("CSRF — only this app's own pages may act as a signed-in Admin", () => {
    it.each([
      [
        "a cross-site fetch",
        {
          ...BROWSER,
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
      ],
      ["a request with neither header", { "content-type": "application/json" }],
    ])(
      "answers 403 for %s, before authenticating or creating",
      async (_name, headers) => {
        const response = await post({ headers });
        expect(response.status).toBe(403);
        expect(createVocabularyGroup).not.toHaveBeenCalled();
        expect(requireUser).not.toHaveBeenCalled();
      },
    );

    it.each([
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "text/plain",
    ])("answers 415 for a %s body", async (type) => {
      const response = await post({
        headers: { ...BROWSER, "content-type": type },
      });
      expect(response.status).toBe(415);
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 422 when the command arrives in the query string", async () => {
      const response = await post({
        url: `${CREATE_URL}?levelId=${LEVEL}&name=Colors`,
      });
      expect(response.status).toBe(422);
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });
  });

  describe("body validation — the rules of the action this replaces", () => {
    it.each([
      ["invalid JSON", "{not json"],
      ["an empty body", ""],
      [
        "no name",
        { languageId: LANGUAGE, levelId: LEVEL, idempotencyKey: KEY },
      ],
      ["an empty name", { ...CREATE_BODY, name: "" }],
      ["a name of only spaces", { ...CREATE_BODY, name: "   " }],
      ["a null name", { ...CREATE_BODY, name: null }],
      ["no level", { languageId: LANGUAGE, name: "x", idempotencyKey: KEY }],
      ["a non-UUID level", { ...CREATE_BODY, levelId: "level-1" }],
      ["a non-UUID language", { ...CREATE_BODY, languageId: "lang-es" }],
      ["a non-UUID key", { ...CREATE_BODY, idempotencyKey: "retry-1" }],
      ["a status", { ...CREATE_BODY, status: "published" }],
    ])("answers 422 for %s, creating nothing", async (_name, body) => {
      const response = await post({ body });
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 413 for an oversized body, without parsing it", async () => {
      const response = await post({
        body: JSON.stringify({ ...CREATE_BODY, padding: "x".repeat(10_000) }),
      });
      expect(response.status).toBe(413);
      expect(createVocabularyGroup).not.toHaveBeenCalled();
    });
  });

  describe("what the service says", () => {
    it.each([
      [
        "a key reused with different data",
        new AppError("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"),
      ],
      [
        "the same command already in flight",
        new AppError("IDEMPOTENCY_OPERATION_IN_PROGRESS"),
      ],
    ])("answers 409 for %s", async (_name, failure) => {
      createVocabularyGroup.mockRejectedValue(failure);
      expect((await post()).status).toBe(409);
    });

    it("answers 429 with a real Retry-After header when rate limited", async () => {
      createVocabularyGroup.mockRejectedValue(
        new AdminError(
          "RATE_LIMITED",
          "Please slow down and try again in 9s.",
          {
            retryAfterSeconds: 9,
          },
        ),
      );
      const response = await post();
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("9");
    });

    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      createVocabularyGroup.mockRejectedValue(
        new Error(
          "unique violation on vocabulary_groups_level_id_position_key",
        ),
      );
      const response = await post();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("position_key");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH /api/v1/admin/groups/[groupId]                                       */
/* -------------------------------------------------------------------------- */

const PATCH_URL = `${ORIGIN}/api/v1/admin/groups/${GROUP}`;
const PATCH_BODY = { name: "Renamed", idempotencyKey: KEY };

function patch({
  body = PATCH_BODY as unknown,
  headers = BROWSER as Record<string, string>,
  url = PATCH_URL,
  groupId = GROUP,
}: {
  body?: unknown;
  headers?: Record<string, string>;
  url?: string;
  groupId?: string;
} = {}) {
  return patchGroup(
    new Request(url, {
      method: "PATCH",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ groupId }) },
  );
}

describe("PATCH /api/v1/admin/groups/[groupId]", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue(userWithRole("admin", "the-admin"));
    updateVocabularyGroup.mockResolvedValue(undefined);
  });

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and changes nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await patch()).status).toBe(401);
      expect(updateVocabularyGroup).not.toHaveBeenCalled();
    });

    it.each(CANNOT_CHANGE)(
      "answers 403 for %s, and changes nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await patch();
        expect(response.status).toBe(403);
        expect(updateVocabularyGroup).not.toHaveBeenCalled();
      },
    );

    it("does not reveal body or path validation to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await patch({ body: { nonsense: true } })).status).toBe(401);
      expect((await patch({ groupId: "not-an-id" })).status).toBe(401);
    });

    it("does not reveal what a valid group id looks like to someone who may not change groups", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await patch({ groupId: "not-an-id" })).status).toBe(403);
    });
  });

  describe("the command", () => {
    it("changes the group in the URL, as the authenticated user", async () => {
      const response = await patch({
        body: { ...PATCH_BODY, status: "archived" },
      });
      expect(response.status).toBe(200);
      expect(updateVocabularyGroup).toHaveBeenCalledExactlyOnceWith({
        groupId: GROUP,
        name: "Renamed",
        status: "archived",
        idempotencyKey: KEY,
        actorUserId: "the-admin",
      });
      expect((await response.json()).data).toEqual({ groupId: GROUP });
    });

    it("passes a field that was left out as left out, so the service leaves it alone", async () => {
      await patch({ body: { status: "published", idempotencyKey: KEY } });
      const call = updateVocabularyGroup.mock.calls[0]![0];
      expect(call.name).toBeUndefined();
      expect(call.status).toBe("published");

      updateVocabularyGroup.mockClear();
      await patch({ body: { name: "Only the name", idempotencyKey: KEY } });
      expect(updateVocabularyGroup.mock.calls[0]![0].status).toBeUndefined();
    });

    it("is uncacheable", async () => {
      expect((await patch()).headers.get("cache-control")).toContain(
        "no-store",
      );
    });

    it.each([
      ["a different group in the body", { groupId: "other" }],
      ["a level", { levelId: LEVEL }],
      ["a language", { languageId: LANGUAGE }],
      ["a position — ordering is the reorder tool's", { position: 2 }],
      ["an actor", { actorUserId: "someone-else" }],
    ])("refuses a body that names %s", async (_name, extra) => {
      const response = await patch({ body: { ...PATCH_BODY, ...extra } });
      expect(response.status).toBe(422);
      expect(updateVocabularyGroup).not.toHaveBeenCalled();
    });

    it.each([
      ["an update that changes nothing", { idempotencyKey: KEY }],
      [
        "a null name — a group always has one",
        { name: null, idempotencyKey: KEY },
      ],
      ["an empty name", { name: "", idempotencyKey: KEY }],
      ["an unknown status", { status: "live", idempotencyKey: KEY }],
    ])("refuses %s", async (_name, body) => {
      const response = await patch({ body });
      expect(response.status).toBe(422);
      expect(updateVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 422 for a path that is not a group id", async () => {
      const response = await patch({
        groupId: "1; drop table vocabulary_groups",
        url: `${ORIGIN}/api/v1/admin/groups/x`,
      });
      expect(response.status).toBe(422);
      expect(updateVocabularyGroup).not.toHaveBeenCalled();
    });
  });

  describe("CSRF and request shape", () => {
    it("answers 403 for a cross-site request, before authenticating", async () => {
      const response = await patch({
        headers: {
          ...BROWSER,
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
      });
      expect(response.status).toBe(403);
      expect(requireUser).not.toHaveBeenCalled();
      expect(updateVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 415 for a form body", async () => {
      const response = await patch({
        headers: {
          ...BROWSER,
          "content-type": "application/x-www-form-urlencoded",
        },
      });
      expect(response.status).toBe(415);
    });

    it("answers 422 when the command arrives in the query string", async () => {
      const response = await patch({ url: `${PATCH_URL}?name=Renamed` });
      expect(response.status).toBe(422);
      expect(updateVocabularyGroup).not.toHaveBeenCalled();
    });

    it("answers 413 for an oversized body", async () => {
      const response = await patch({
        body: JSON.stringify({ ...PATCH_BODY, padding: "x".repeat(10_000) }),
      });
      expect(response.status).toBe(413);
    });
  });

  describe("what the service says", () => {
    it("answers 404 for a group that does not exist", async () => {
      updateVocabularyGroup.mockRejectedValue(
        new AdminError(
          "CURRICULUM_ITEM_NOT_FOUND",
          "That group could not be found.",
        ),
      );
      const response = await patch();
      expect(response.status).toBe(404);
      expect((await response.json()).error.message).toBe(
        "That group could not be found.",
      );
    });

    it("answers 409 for a key reused with different data", async () => {
      updateVocabularyGroup.mockRejectedValue(
        new AppError("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"),
      );
      expect((await patch()).status).toBe(409);
    });

    it("answers 429 with a real Retry-After header when rate limited", async () => {
      updateVocabularyGroup.mockRejectedValue(
        new AdminError(
          "RATE_LIMITED",
          "Please slow down and try again in 21s.",
          {
            retryAfterSeconds: 21,
          },
        ),
      );
      const response = await patch();
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("21");
    });

    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      updateVocabularyGroup.mockRejectedValue(new Error("deadlock on groups"));
      const response = await patch();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("deadlock");
    });
  });

  it("is a PATCH-only endpoint", async () => {
    const route = await import("./groups/[groupId]/route");
    expect(Object.keys(route).sort()).toEqual(["PATCH"]);
  });
});

describe("the groups collection endpoint answers only GET and POST", () => {
  it("exports exactly those", async () => {
    const route = await import("./groups/route");
    expect(Object.keys(route).sort()).toEqual(["GET", "POST"]);
  });
});

describe("the groups endpoints and the role matrix", () => {
  it.each(ADMIN_AREA_ROLES)(
    "%s: reading follows canManageCurriculum; creating and updating follow canPublishCurriculum",
    async (role) => {
      const as = () => requireUser.mockResolvedValue(userWithRole(role));
      createVocabularyGroup.mockResolvedValue({ groupId: GROUP });
      updateVocabularyGroup.mockResolvedValue(undefined);

      as();
      const read = (await get()).status;
      as();
      const create = (await post()).status;
      as();
      const update = (await patch()).status;

      expect({ read, create, update }).toEqual(
        {
          admin: { read: 200, create: 200, update: 200 },
          writer: { read: 200, create: 403, update: 403 },
          developer: { read: 403, create: 403, update: 403 },
        }[role],
      );
    },
  );
});
