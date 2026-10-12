import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getAdminCurriculumStatusCounts = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/curriculum/server", () => ({
  getAdminCurriculumStatusCounts,
}));

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
        canUseDeveloperTools: false,
        resources: { overview: ["show"] },
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
