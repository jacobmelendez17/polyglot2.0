import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEVEL_LIST_MAX } from "@/domains/admin";
import type { CurriculumLevel, LevelContentCounts } from "@/domains/curriculum";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getLanguages = vi.hoisted(() => vi.fn());
const getLevelsByLanguage = vi.hoisted(() => vi.fn());
const getLevelContentCountsByLanguage = vi.hoisted(() => vi.fn());
const createLevel = vi.hoisted(() => vi.fn());
const updateLevel = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/curriculum/server", () => ({
  getLanguages,
  getLevelsByLanguage,
  getLevelContentCountsByLanguage,
}));
vi.mock("@/domains/admin/server", () => ({ createLevel, updateLevel }));

import { GET as getLevels, POST as postLevel } from "./levels/route";
import { PATCH as patchLevel } from "./levels/[levelId]/route";

const LANGUAGE = "5b2eb57d-acb8-4964-8af4-49a417cf227a";
const LEVEL = "133c9db4-dc71-4a7c-acf7-d55394ffdb42";
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

beforeEach(() => {
  for (const mock of [
    requireUser,
    getLanguages,
    getLevelsByLanguage,
    getLevelContentCountsByLanguage,
    createLevel,
    updateLevel,
  ]) {
    mock.mockReset();
  }
  getLanguages.mockResolvedValue([{ id: LANGUAGE, name: "Spanish" }]);
  getLevelsByLanguage.mockResolvedValue([]);
  getLevelContentCountsByLanguage.mockResolvedValue(new Map());
});

function level(
  levelNumber: number,
  overrides: Partial<CurriculumLevel> = {},
): CurriculumLevel {
  return {
    id: `level-${levelNumber}`,
    languageId: LANGUAGE,
    levelNumber,
    name: null,
    status: "draft",
    cefrLevel: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* GET /api/v1/admin/levels                                                   */
/* -------------------------------------------------------------------------- */

const getUrl = (query: Record<string, string> = { language: LANGUAGE }) =>
  `${ORIGIN}/api/v1/admin/levels?${new URLSearchParams(query)}`;
const get = (query?: Record<string, string>) =>
  getLevels(new Request(getUrl(query), { method: "GET" }));

describe("GET /api/v1/admin/levels", () => {
  beforeEach(() => {
    // Block-bodied on purpose: a function returned from `beforeEach` is run as
    // a cleanup callback, and returning the mock would call it again afterwards.
    requireUser.mockResolvedValue(userWithRole("admin"));
  });

  it("answers 401 with no session, and reads nothing", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    expect((await get()).status).toBe(401);
    expect(getLevelsByLanguage).not.toHaveBeenCalled();
  });

  it.each(CANNOT_READ)(
    "answers 403 for %s, and reads nothing",
    async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      const response = await get();
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(getLevelsByLanguage).not.toHaveBeenCalled();
      expect(getLevelContentCountsByLanguage).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "writer"] as const)("answers 200 for %s", async (role) => {
    requireUser.mockResolvedValue(userWithRole(role));
    expect((await get()).status).toBe(200);
  });

  it("reads the requested language only, counting every level in one query", async () => {
    getLevelsByLanguage.mockResolvedValue([level(1), level(2), level(3)]);
    await get();
    expect(getLevelsByLanguage).toHaveBeenCalledExactlyOnceWith(LANGUAGE);
    // One grouped read for the whole language — never one per level.
    expect(getLevelContentCountsByLanguage).toHaveBeenCalledExactlyOnceWith(
      LANGUAGE,
    );
  });

  it("returns each level with what it holds, a level with no entry holding nothing", async () => {
    getLevelsByLanguage.mockResolvedValue([
      level(1, { name: "Basics", status: "published", cefrLevel: "A1" }),
      level(2),
    ]);
    const counts: LevelContentCounts = {
      vocabularyItems: 45,
      grammarItems: 12,
      vocabularyGroups: 4,
    };
    getLevelContentCountsByLanguage.mockResolvedValue(
      new Map([["level-1", counts]]),
    );

    const response = await get();
    expect((await response.json()).data).toEqual({
      items: [
        {
          id: "level-1",
          levelNumber: 1,
          name: "Basics",
          status: "published",
          cefrLevel: "A1",
          ...counts,
        },
        {
          id: "level-2",
          levelNumber: 2,
          name: null,
          status: "draft",
          cefrLevel: null,
          vocabularyItems: 0,
          grammarItems: 0,
          vocabularyGroups: 0,
        },
      ],
      truncated: false,
    });
  });

  it("answers an empty list — not an error — for a language with no levels yet", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      items: [],
      truncated: false,
    });
  });

  it("is bounded, and says so", async () => {
    getLevelsByLanguage.mockResolvedValue(
      Array.from({ length: LEVEL_LIST_MAX + 3 }, (_, i) => level(i + 1)),
    );
    const { data } = await (await get()).json();
    expect(data.items).toHaveLength(LEVEL_LIST_MAX);
    expect(data.truncated).toBe(true);
  });

  it("is uncacheable, and never exposes who or what is behind a level", async () => {
    getLevelsByLanguage.mockResolvedValue([
      { ...level(1), curriculumKey: "es-MX:level:abc" } as never,
    ]);
    const response = await get();
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text).not.toContain("clerk_must_never_appear");
    expect(text).not.toContain("curriculumKey");
    expect(text).not.toContain("es-MX:level");
  });

  describe("what it refuses", () => {
    it.each([
      ["no language", {}],
      ["a language that is not an id", { language: "lang-es" }],
      ["a sort", { language: LANGUAGE, sort: "name" }],
      ["a page number", { language: LANGUAGE, page: "2" }],
      ["a limit", { language: LANGUAGE, limit: "5" }],
      ["a cursor", { language: LANGUAGE, cursor: "x" }],
      ["a filter it does not have", { language: LANGUAGE, status: "draft" }],
    ])("answers 422 for %s", async (_name, query) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      expect(getLevelsByLanguage).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist, reading no levels", async () => {
      getLanguages.mockResolvedValue([]);
      const response = await get();
      expect(response.status).toBe(404);
      expect(getLevelsByLanguage).not.toHaveBeenCalled();
    });

    it("does not reveal its parameters to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get({ sort: "x" })).status).toBe(401);
    });
  });

  it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
    getLevelsByLanguage.mockRejectedValue(
      new Error("connection to levels_pkey failed"),
    );
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("levels_pkey");
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/v1/admin/levels                                                  */
/* -------------------------------------------------------------------------- */

const CREATE_URL = `${ORIGIN}/api/v1/admin/levels`;
const CREATE_BODY = {
  languageId: LANGUAGE,
  levelNumber: 4,
  idempotencyKey: KEY,
};

function post({
  body = CREATE_BODY as unknown,
  headers = BROWSER as Record<string, string>,
  url = CREATE_URL,
}: { body?: unknown; headers?: Record<string, string>; url?: string } = {}) {
  return postLevel(
    new Request(url, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/v1/admin/levels", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue(userWithRole("admin", "the-admin"));
    createLevel.mockResolvedValue({ levelId: LEVEL });
  });

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and creates nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await post()).status).toBe(401);
      expect(createLevel).not.toHaveBeenCalled();
    });

    it.each(CANNOT_CHANGE)(
      "answers 403 for %s, and creates nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await post();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(createLevel).not.toHaveBeenCalled();
      },
    );

    it("refuses a writer who can read the same levels", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await get()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await post()).status).toBe(403);
      expect(createLevel).not.toHaveBeenCalled();
    });

    it("re-evaluates the role on every call", async () => {
      expect((await post()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await post()).status).toBe(403);
      expect(createLevel).toHaveBeenCalledOnce();
    });

    it("does not reveal body validation to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await post({ body: { nonsense: true } })).status).toBe(401);
    });
  });

  describe("the command", () => {
    it("creates the level as the *authenticated* user, with the client's key", async () => {
      const response = await post({
        body: { ...CREATE_BODY, name: "Colors" },
      });
      expect(response.status).toBe(200);
      expect(createLevel).toHaveBeenCalledExactlyOnceWith({
        languageId: LANGUAGE,
        levelNumber: 4,
        name: "Colors",
        idempotencyKey: KEY,
        actorUserId: "the-admin",
      });
    });

    it("sends no name when none was given", async () => {
      await post();
      expect(createLevel.mock.calls[0]![0].name).toBeNull();
    });

    it("answers the new level's id, uncacheable", async () => {
      const response = await post();
      expect(await response.json()).toEqual({ data: { levelId: LEVEL } });
      expect(response.headers.get("cache-control")).toContain("no-store");
    });

    it("never accepts an actor from the request body", async () => {
      const response = await post({
        body: { ...CREATE_BODY, actorUserId: "someone-else" },
      });
      expect(response.status).toBe(422);
      expect(createLevel).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist, creating nothing", async () => {
      getLanguages.mockResolvedValue([]);
      expect((await post()).status).toBe(404);
      expect(createLevel).not.toHaveBeenCalled();
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
      async (_n, headers) => {
        const response = await post({ headers });
        expect(response.status).toBe(403);
        expect(createLevel).not.toHaveBeenCalled();
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
      expect(createLevel).not.toHaveBeenCalled();
    });

    it("answers 422 when the command arrives in the query string", async () => {
      const response = await post({
        url: `${CREATE_URL}?languageId=${LANGUAGE}&levelNumber=4`,
      });
      expect(response.status).toBe(422);
      expect(createLevel).not.toHaveBeenCalled();
    });
  });

  describe("body validation — the rules of the action this replaces", () => {
    it.each([
      ["invalid JSON", "{not json"],
      ["an empty body", ""],
      ["a level number of zero", { ...CREATE_BODY, levelNumber: 0 }],
      ["a negative level number", { ...CREATE_BODY, levelNumber: -1 }],
      ["a fractional level number", { ...CREATE_BODY, levelNumber: 1.5 }],
      ["a text level number", { ...CREATE_BODY, levelNumber: "4" }],
      ["no level number", { languageId: LANGUAGE, idempotencyKey: KEY }],
      ["a name of only spaces", { ...CREATE_BODY, name: "   " }],
      ["a non-UUID language", { ...CREATE_BODY, languageId: "lang-es" }],
      ["a non-UUID key", { ...CREATE_BODY, idempotencyKey: "retry-1" }],
      ["a status", { ...CREATE_BODY, status: "published" }],
    ])("answers 422 for %s, creating nothing", async (_name, body) => {
      const response = await post({ body });
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(createLevel).not.toHaveBeenCalled();
    });

    it("answers 413 for an oversized body, without parsing it", async () => {
      const response = await post({
        body: JSON.stringify({ ...CREATE_BODY, padding: "x".repeat(10_000) }),
      });
      expect(response.status).toBe(413);
      expect(createLevel).not.toHaveBeenCalled();
    });

    it("accepts a level number above the learner-facing range — that is not this endpoint's rule", async () => {
      const response = await post({
        body: { ...CREATE_BODY, levelNumber: 51 },
      });
      expect(response.status).toBe(200);
    });
  });

  describe("what the service says", () => {
    it("answers 422 with the reason when the number is taken", async () => {
      createLevel.mockRejectedValue(
        new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Level 4 already exists for this language.",
        ),
      );
      const response = await post();
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "Level 4 already exists for this language.",
      );
    });

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
      createLevel.mockRejectedValue(failure);
      expect((await post()).status).toBe(409);
    });

    it("answers 429 with a real Retry-After header when rate limited", async () => {
      createLevel.mockRejectedValue(
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
      createLevel.mockRejectedValue(
        new Error("relation levels does not exist"),
      );
      const response = await post();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("relation levels");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH /api/v1/admin/levels/[levelId]                                       */
/* -------------------------------------------------------------------------- */

const PATCH_URL = `${ORIGIN}/api/v1/admin/levels/${LEVEL}`;
const PATCH_BODY = { name: "Renamed", idempotencyKey: KEY };

function patch({
  body = PATCH_BODY as unknown,
  headers = BROWSER as Record<string, string>,
  url = PATCH_URL,
  levelId = LEVEL,
}: {
  body?: unknown;
  headers?: Record<string, string>;
  url?: string;
  levelId?: string;
} = {}) {
  return patchLevel(
    new Request(url, {
      method: "PATCH",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ levelId }) },
  );
}

describe("PATCH /api/v1/admin/levels/[levelId]", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue(userWithRole("admin", "the-admin"));
    updateLevel.mockResolvedValue(undefined);
  });

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and changes nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await patch()).status).toBe(401);
      expect(updateLevel).not.toHaveBeenCalled();
    });

    it.each(CANNOT_CHANGE)(
      "answers 403 for %s, and changes nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await patch();
        expect(response.status).toBe(403);
        expect(updateLevel).not.toHaveBeenCalled();
      },
    );

    it("does not reveal body or path validation to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await patch({ body: { nonsense: true } })).status).toBe(401);
      expect((await patch({ levelId: "not-an-id" })).status).toBe(401);
    });

    it("does not reveal what a valid level id looks like to someone who may not change levels", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await patch({ levelId: "not-an-id" })).status).toBe(403);
    });
  });

  describe("the command", () => {
    it("changes the level in the URL, as the authenticated user", async () => {
      const response = await patch({
        body: { ...PATCH_BODY, status: "published", cefrLevel: "B1" },
      });
      expect(response.status).toBe(200);
      expect(updateLevel).toHaveBeenCalledExactlyOnceWith({
        levelId: LEVEL,
        name: "Renamed",
        status: "published",
        cefrLevel: "B1",
        idempotencyKey: KEY,
        actorUserId: "the-admin",
      });
      expect((await response.json()).data).toEqual({ levelId: LEVEL });
    });

    it("passes a field that was left out as left out, so the service leaves it alone", async () => {
      await patch({ body: { status: "draft", idempotencyKey: KEY } });
      const call = updateLevel.mock.calls[0]![0];
      expect(call.name).toBeUndefined();
      expect(call.cefrLevel).toBeUndefined();
      expect(call.status).toBe("draft");
    });

    it("passes null as null, so the service clears the field", async () => {
      await patch({
        body: { name: null, cefrLevel: null, idempotencyKey: KEY },
      });
      const call = updateLevel.mock.calls[0]![0];
      expect(call.name).toBeNull();
      expect(call.cefrLevel).toBeNull();
    });

    it("is uncacheable", async () => {
      expect((await patch()).headers.get("cache-control")).toContain(
        "no-store",
      );
    });

    it.each([
      ["a different level in the body", { levelId: "other" }],
      ["a language", { languageId: LANGUAGE }],
      ["a level number", { levelNumber: 9 }],
      ["an actor", { actorUserId: "someone-else" }],
    ])("refuses a body that names %s", async (_name, extra) => {
      const response = await patch({ body: { ...PATCH_BODY, ...extra } });
      expect(response.status).toBe(422);
      expect(updateLevel).not.toHaveBeenCalled();
    });

    it("refuses an update that changes nothing", async () => {
      const response = await patch({ body: { idempotencyKey: KEY } });
      expect(response.status).toBe(422);
      expect(updateLevel).not.toHaveBeenCalled();
    });

    it("answers 422 for a path that is not a level id", async () => {
      const response = await patch({
        levelId: "1; drop table levels",
        url: `${ORIGIN}/api/v1/admin/levels/x`,
      });
      expect(response.status).toBe(422);
      expect(updateLevel).not.toHaveBeenCalled();
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
      expect(updateLevel).not.toHaveBeenCalled();
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
      expect(updateLevel).not.toHaveBeenCalled();
    });

    it("answers 413 for an oversized body", async () => {
      const response = await patch({
        body: JSON.stringify({ ...PATCH_BODY, padding: "x".repeat(10_000) }),
      });
      expect(response.status).toBe(413);
    });
  });

  describe("what the service says", () => {
    it("answers 404 for a level that does not exist", async () => {
      updateLevel.mockRejectedValue(
        new AdminError(
          "CURRICULUM_ITEM_NOT_FOUND",
          "That level could not be found.",
        ),
      );
      const response = await patch();
      expect(response.status).toBe(404);
      expect((await response.json()).error.message).toBe(
        "That level could not be found.",
      );
    });

    it("answers 409 for a key reused with different data", async () => {
      updateLevel.mockRejectedValue(
        new AppError("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"),
      );
      expect((await patch()).status).toBe(409);
    });

    it("answers 429 with a real Retry-After header when rate limited", async () => {
      updateLevel.mockRejectedValue(
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
      updateLevel.mockRejectedValue(new Error("deadlock on levels"));
      const response = await patch();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("deadlock");
    });
  });

  it("is a PATCH-only endpoint", async () => {
    const route = await import("./levels/[levelId]/route");
    expect(Object.keys(route).sort()).toEqual(["PATCH"]);
  });
});

describe("the levels collection endpoint answers only GET and POST", () => {
  it("exports exactly those", async () => {
    const route = await import("./levels/route");
    expect(Object.keys(route).sort()).toEqual(["GET", "POST"]);
  });
});

describe("the levels endpoints and the role matrix", () => {
  it.each(ADMIN_AREA_ROLES)(
    "%s: reading follows canManageCurriculum; creating and updating follow canPublishCurriculum",
    async (role) => {
      const as = () => requireUser.mockResolvedValue(userWithRole(role));
      createLevel.mockResolvedValue({ levelId: LEVEL });
      updateLevel.mockResolvedValue(undefined);

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
