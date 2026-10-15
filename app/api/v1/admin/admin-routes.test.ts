import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getAdminCurriculumStatusCounts = vi.hoisted(() => vi.fn());
const getAdminCurriculumItems = vi.hoisted(() => vi.fn());
const getLanguages = vi.hoisted(() => vi.fn());
const getLevelsByLanguage = vi.hoisted(() => vi.fn());
const getVocabularyGroupsByLanguage = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/curriculum/server", () => ({
  getAdminCurriculumStatusCounts,
  getAdminCurriculumItems,
  getLanguages,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
}));

import { GET as getCurriculum } from "./curriculum/route";
import { GET as getMe } from "./me/route";
import { GET as getOverview } from "./overview/route";

const COUNTS = { published: 55, pending: 3, draft: 2, archived: 1 };

function userWithRole(role: UserRole): PolyglotUser {
  return {
    id: `user-${role}`,
    clerkUserId: "clerk_must_never_appear",
    role,
    displayName: "Private Name",
    username: "private-username",
    timezone: "UTC",
    activeLanguageId: "lang-es-mx",
    isSandbox: false,
    sandboxOwnerUserId: null,
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

const request = (path: string) =>
  new Request(`http://localhost${path}`, { method: "GET" });

const ADMIN_AREA_ROLES = ["admin", "writer", "developer"] as const;
const NON_ADMIN_ROLES = USER_ROLES.filter(
  (role) => !(ADMIN_AREA_ROLES as readonly string[]).includes(role),
);

beforeEach(() => {
  requireUser.mockReset();
  getAdminCurriculumStatusCounts.mockReset();
  getAdminCurriculumStatusCounts.mockResolvedValue(COUNTS);
  getAdminCurriculumItems.mockReset();
  getLanguages.mockReset();
  getLevelsByLanguage.mockReset();
  getVocabularyGroupsByLanguage.mockReset();
});

describe.each([
  ["GET /api/v1/admin/me", getMe, "/api/v1/admin/me"],
  ["GET /api/v1/admin/overview", getOverview, "/api/v1/admin/overview"],
] as const)("%s — authentication and authorization", (_name, handler, path) => {
  it("answers 401 with a structured error when there is no session", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));

    const response = await handler(request(path));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "You must be signed in to do that.",
      },
    });
    expect(getAdminCurriculumStatusCounts).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_ROLES)(
    "answers 403 for a signed-in %s, never an empty success",
    async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));

      const response = await handler(request(path));

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toEqual({
        error: {
          code: "FORBIDDEN",
          message: "You don't have access to do that.",
        },
      });
      expect(body).not.toHaveProperty("data");
      expect(getAdminCurriculumStatusCounts).not.toHaveBeenCalled();
    },
  );

  it.each(ADMIN_AREA_ROLES)("answers 200 for %s", async (role) => {
    requireUser.mockResolvedValue(userWithRole(role));
    expect((await handler(request(path))).status).toBe(200);
  });

  it("is never cacheable by a browser or shared cache", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    const response = await handler(request(path));
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("is re-evaluated against the role on every request", async () => {
    // Role revoked while a browser tab stays open: the very next call is denied.
    requireUser.mockResolvedValueOnce(userWithRole("admin"));
    expect((await handler(request(path))).status).toBe(200);

    requireUser.mockResolvedValueOnce(userWithRole("user"));
    expect((await handler(request(path))).status).toBe(403);
  });

  it("answers a generic 500 for an unexpected failure, without leaking its message", async () => {
    requireUser.mockRejectedValue(
      new Error("connection to ep-secret-host.neon.tech refused"),
    );

    const response = await handler(request(path));

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toContain("neon.tech");
  });
});

describe("GET /api/v1/admin/me — payload", () => {
  it("returns the caller's role and effective permissions only", async () => {
    requireUser.mockResolvedValue(userWithRole("writer"));

    const { data } = await (await getMe(request("/api/v1/admin/me"))).json();

    expect(data).toEqual({
      id: "user-writer",
      role: "writer",
      permissions: {
        canAccessAdminArea: true,
        canManageCurriculum: true,
        canPublishCurriculum: false,
        // The account list and role changes are Admin-only: a writer has neither.
        canManageUsers: false,
        canUseDeveloperTools: false,
        resources: {
          overview: ["show"],
          curriculum: ["list"],
          review: ["list"],
          // A writer reads levels and groups; creating and editing them is Admin-only.
          levels: ["list"],
          groups: ["list"],
          // A writer reads the import history; starting and managing imports is Admin-only.
          imports: ["list"],
          // A writer authors dictionary mappings; official decks are not theirs at all.
          dictionary: ["list", "edit"],
        },
      },
    });
  });

  it("never exposes the Clerk id, name, or username", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));

    const text = await (await getMe(request("/api/v1/admin/me"))).text();

    expect(text).not.toContain("clerk_must_never_appear");
    expect(text).not.toContain("Private Name");
    expect(text).not.toContain("private-username");
  });
});

describe("GET /api/v1/admin/overview — payload", () => {
  it.each(["admin", "writer"] as const)(
    "returns language-scoped counts for %s",
    async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));

      const { data } = await (
        await getOverview(request("/api/v1/admin/overview"))
      ).json();

      expect(getAdminCurriculumStatusCounts).toHaveBeenCalledExactlyOnceWith(
        "lang-es-mx",
      );
      expect(data).toEqual({
        id: "current",
        languageId: "lang-es-mx",
        curriculum: COUNTS,
      });
    },
  );

  it("gives a developer no curriculum data — and never even queries it", async () => {
    requireUser.mockResolvedValue(userWithRole("developer"));

    const { data } = await (
      await getOverview(request("/api/v1/admin/overview"))
    ).json();

    expect(data).toEqual({
      id: "current",
      languageId: "lang-es-mx",
      curriculum: null,
    });
    expect(getAdminCurriculumStatusCounts).not.toHaveBeenCalled();
  });

  it("answers a generic 500 if the counts query fails", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    getAdminCurriculumStatusCounts.mockRejectedValue(
      new Error("relation learning_items does not exist"),
    );

    const response = await getOverview(request("/api/v1/admin/overview"));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("learning_items");
  });
});

describe("GET /api/v1/admin/curriculum", () => {
  const LANGUAGE = "5b2eb57d-acb8-4964-8af4-49a417cf227a";
  const OTHER_LANGUAGE = "6c3fc68e-bdc9-4075-9bf5-5a5b28d1d38b";
  const LEVEL = "133c9db4-dc71-4a7c-acf7-d55394ffdb42";
  const GROUP = "0881836c-de9a-4dc5-84f7-1dd28b8fa439";

  const SERVICE_ROW = {
    id: "item-1",
    type: "vocabulary" as const,
    status: "published" as const,
    languageId: LANGUAGE,
    levelId: LEVEL,
    levelNumber: 1,
    position: 4,
    itemLabel: "el gato",
    meaningLabel: "cat",
    groupId: GROUP,
    groupName: "Animals",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    needsDefinition: true,
    needsExamples: false,
    needsIpa: false,
    needsPronunciation: false,
    needsSynonyms: false,
    needsVariations: false,
  };

  const url = (query: Record<string, string>) =>
    `/api/v1/admin/curriculum?${new URLSearchParams(query)}`;

  beforeEach(() => {
    getLanguages.mockResolvedValue([
      { id: LANGUAGE, name: "Spanish" },
      { id: OTHER_LANGUAGE, name: "Other" },
    ]);
    getLevelsByLanguage.mockResolvedValue([{ id: LEVEL, levelNumber: 1 }]);
    getVocabularyGroupsByLanguage.mockResolvedValue([
      { id: GROUP, name: "Animals", levelId: LEVEL },
    ]);
    getAdminCurriculumItems.mockResolvedValue({
      items: [SERVICE_ROW],
      nextCursor: "next-token",
      hasPreviousPage: true,
      previousCursor: "prev-token",
    });
  });

  it("answers 401 with no session, without touching the read model", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    const response = await getCurriculum(request(url({ language: LANGUAGE })));
    expect(response.status).toBe(401);
    expect(getAdminCurriculumItems).not.toHaveBeenCalled();
  });

  it("does not reveal its parameters to an unauthenticated caller", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    // A request that would be a 422 if it got that far is still a 401.
    const response = await getCurriculum(request(url({ sort: "term" })));
    expect(response.status).toBe(401);
  });

  it.each(["developer", "user", "beta-tester"] as const)(
    "answers 403 for %s, and never queries curriculum",
    async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      const response = await getCurriculum(
        request(url({ language: LANGUAGE })),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).not.toHaveProperty("data");
      expect(getAdminCurriculumItems).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "writer"] as const)("answers 200 for %s", async (role) => {
    requireUser.mockResolvedValue(userWithRole(role));
    const response = await getCurriculum(request(url({ language: LANGUAGE })));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("passes every supported filter through to the existing read model", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    await getCurriculum(
      request(
        url({
          language: LANGUAGE,
          level: LEVEL,
          type: "vocabulary",
          status: "draft",
          group: GROUP,
          search: "gáto",
          needs: "definition",
          cursor: "abc",
          limit: "20",
        }),
      ),
    );
    expect(getAdminCurriculumItems).toHaveBeenCalledExactlyOnceWith({
      languageId: LANGUAGE,
      levelId: LEVEL,
      type: "vocabulary",
      status: "draft",
      groupId: GROUP,
      search: "gáto",
      needs: "definition",
      cursor: "abc",
      limit: 20,
    });
  });

  it("defaults to the Admin page size", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    await getCurriculum(request(url({ language: LANGUAGE })));
    expect(getAdminCurriculumItems.mock.calls[0]![0].limit).toBe(20);
  });

  it("returns a cursor page with no total, and only the fields a row needs", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    const { data } = await (
      await getCurriculum(request(url({ language: LANGUAGE })))
    ).json();

    expect(data).toEqual({
      items: [
        {
          id: "item-1",
          type: "vocabulary",
          status: "published",
          levelId: LEVEL,
          levelNumber: 1,
          itemLabel: "el gato",
          meaningLabel: "cat",
          groupId: GROUP,
          groupName: "Animals",
        },
      ],
      nextCursor: "next-token",
      hasPreviousPage: true,
      previousCursor: "prev-token",
    });
    expect(data).not.toHaveProperty("total");
  });

  describe("rejects what it does not support, explicitly", () => {
    it.each([
      ["a missing language", {}],
      ["a non-UUID language", { language: "spanish" }],
      ["an unsupported sort", { language: LANGUAGE, sort: "term" }],
      ["an unsupported order", { language: LANGUAGE, order: "DESC" }],
      ["a page number", { language: LANGUAGE, page: "3" }],
      ["an unknown status", { language: LANGUAGE, status: "deleted" }],
      ["an unknown needs filter", { language: LANGUAGE, needs: "validation" }],
      ["a limit above the cap", { language: LANGUAGE, limit: "101" }],
      ["a limit of zero", { language: LANGUAGE, limit: "0" }],
      ["a non-numeric limit", { language: LANGUAGE, limit: "lots" }],
    ])("answers 422 for %s", async (_name, query) => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      const response = await getCurriculum(request(url(query)));
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(getAdminCurriculumItems).not.toHaveBeenCalled();
    });
  });

  describe("language isolation", () => {
    it("answers 404 for a language that does not exist", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      const response = await getCurriculum(
        request(url({ language: "9d9d9d9d-9d9d-4d9d-9d9d-9d9d9d9d9d9d" })),
      );
      expect(response.status).toBe(404);
      expect(getAdminCurriculumItems).not.toHaveBeenCalled();
    });

    it("answers 422 for a level that belongs to a different language", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      // The level exists — but not under OTHER_LANGUAGE.
      getLevelsByLanguage.mockResolvedValue([]);
      const response = await getCurriculum(
        request(url({ language: OTHER_LANGUAGE, level: LEVEL })),
      );
      expect(response.status).toBe(422);
      expect(getLevelsByLanguage).toHaveBeenCalledWith(OTHER_LANGUAGE);
      expect(getAdminCurriculumItems).not.toHaveBeenCalled();
    });

    it("answers 422 for a group that belongs to a different language", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      getVocabularyGroupsByLanguage.mockResolvedValue([]);
      const response = await getCurriculum(
        request(url({ language: OTHER_LANGUAGE, group: GROUP })),
      );
      expect(response.status).toBe(422);
      expect(getAdminCurriculumItems).not.toHaveBeenCalled();
    });

    it("never looks up levels or groups it was not asked about", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      await getCurriculum(request(url({ language: LANGUAGE })));
      expect(getLevelsByLanguage).not.toHaveBeenCalled();
      expect(getVocabularyGroupsByLanguage).not.toHaveBeenCalled();
    });
  });

  it("answers 422 for a cursor the read model rejects", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    getAdminCurriculumItems.mockRejectedValue(
      new AppError(
        "CURRICULUM_VALIDATION_FAILED",
        "That page link is not valid.",
      ),
    );
    const response = await getCurriculum(
      request(url({ language: LANGUAGE, cursor: "tampered" })),
    );
    expect(response.status).toBe(422);
  });

  it("answers a generic 500 if the read model fails unexpectedly", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    getAdminCurriculumItems.mockRejectedValue(
      new Error("relation learning_items does not exist"),
    );
    const response = await getCurriculum(request(url({ language: LANGUAGE })));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("learning_items");
  });
});
