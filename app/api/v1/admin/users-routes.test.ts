import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_LIST_MAX_PAGE_SIZE, USER_LIST_PAGE_SIZE } from "@/domains/admin";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const listAdminUsers = vi.hoisted(() => vi.fn());
const changeUserRole = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/admin/server", () => ({ listAdminUsers, changeUserRole }));

import { GET as getUsers } from "./users/route";
import { PATCH as patchRole } from "./users/[userId]/role/route";

const USER = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const KEY = "0881836c-de9a-4dc5-84f7-1dd28b8fa439";
const TOKEN = "2026-03-02T09:30:15.123456Z";
const ORIGIN = "http://localhost";

function userWithRole(role: UserRole, id = `user-${role}`): PolyglotUser {
  return {
    id,
    clerkUserId: "clerk_must_never_appear",
    role,
    displayName: "Private Name",
    username: "private-username",
    timezone: "UTC",
    activeLanguageId: "lang-1",
    isSandbox: false,
    sandboxOwnerUserId: null,
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

/** Everyone but an Admin — including the two roles that can already enter the console. */
const NOT_ADMIN = USER_ROLES.filter((role) => role !== "admin");

const BROWSER = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

const record = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  displayName: `Person ${n}`,
  username: `person_${n}`,
  role: "user" as const,
  createdAt: "2026-03-01T12:00:00.000100Z",
  updatedAt: TOKEN,
  ...overrides,
});

const emptyPage = {
  items: [],
  nextCursor: null,
  hasPreviousPage: false,
  previousCursor: null,
};

beforeEach(() => {
  for (const mock of [requireUser, listAdminUsers, changeUserRole]) {
    mock.mockReset();
  }
  listAdminUsers.mockResolvedValue(emptyPage);
});

/* -------------------------------------------------------------------------- */
/* GET /api/v1/admin/users                                                    */
/* -------------------------------------------------------------------------- */

const get = (query: Record<string, string> = {}) =>
  getUsers(
    new Request(
      `${ORIGIN}/api/v1/admin/users${
        Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""
      }`,
      { method: "GET" },
    ),
  );

describe("GET /api/v1/admin/users", () => {
  beforeEach(() => {
    // Block-bodied: a function returned from `beforeEach` is run as a cleanup
    // callback, and returning the mock would call it again afterwards.
    requireUser.mockResolvedValue(userWithRole("admin", ADMIN_ID));
  });

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and lists nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get()).status).toBe(401);
      expect(listAdminUsers).not.toHaveBeenCalled();
    });

    // The spec's matrix: only an Admin has any part of this.
    it.each(NOT_ADMIN)(
      "answers 403 for %s, and lists nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await get();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(listAdminUsers).not.toHaveBeenCalled();
      },
    );

    it("answers 200 for an Admin", async () => {
      expect((await get()).status).toBe(200);
    });

    it("re-evaluates the role on every call", async () => {
      expect((await get()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await get()).status).toBe(403);
      expect(listAdminUsers).toHaveBeenCalledOnce();
    });

    it("does not reveal its parameters to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get({ sort: "x" })).status).toBe(401);
    });

    it("does not reveal them to someone who may not list accounts either", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await get({ includeSandbox: "true" })).status).toBe(403);
    });
  });

  describe("the query", () => {
    it("lists the first page at the default size, as the signed-in Admin", async () => {
      await get();
      expect(listAdminUsers).toHaveBeenCalledExactlyOnceWith({
        actorUserId: ADMIN_ID,
        search: undefined,
        cursor: undefined,
        limit: USER_LIST_PAGE_SIZE,
      });
    });

    it("passes the search, the cursor and the limit on, trimmed and as numbers", async () => {
      await get({ search: "  ana  ", cursor: "abc", limit: "5" });
      expect(listAdminUsers).toHaveBeenCalledExactlyOnceWith({
        actorUserId: ADMIN_ID,
        search: "ana",
        cursor: "abc",
        limit: 5,
      });
    });

    it.each([
      ["a sort", { sort: "name" }],
      ["a page number", { page: "2" }],
      ["a role filter", { role: "admin" }],
      // There is no way to ask for them — not "off by default", but not offered.
      ["a request for sandbox personas", { includeSandbox: "true" }],
      ["a language", { language: "lang-es" }],
      ["an empty search", { search: "" }],
      ["a search of only spaces", { search: "   " }],
      ["an over-long search", { search: "x".repeat(101) }],
      ["an over-long cursor", { cursor: "x".repeat(513) }],
      ["a limit of zero", { limit: "0" }],
      ["a limit over the cap", { limit: String(USER_LIST_MAX_PAGE_SIZE + 1) }],
      ["a fractional limit", { limit: "2.5" }],
    ])("answers 422 for %s, listing nothing", async (_name, query) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(listAdminUsers).not.toHaveBeenCalled();
    });
  });

  describe("the answer", () => {
    it("is the page, with the cursors the service gave", async () => {
      listAdminUsers.mockResolvedValue({
        items: [record(1, { role: "writer" }), record(2)],
        nextCursor: "next",
        hasPreviousPage: true,
        previousCursor: "prev",
      });
      const { data } = await (await get()).json();
      expect(data).toEqual({
        items: [record(1, { role: "writer" }), record(2)],
        nextCursor: "next",
        hasPreviousPage: true,
        previousCursor: "prev",
      });
    });

    it("answers an empty list — not an error — when nobody matches", async () => {
      const response = await get({ search: "nobody" });
      expect(response.status).toBe(200);
      expect((await response.json()).data.items).toEqual([]);
    });

    it("is uncacheable", async () => {
      const response = await get();
      expect(response.headers.get("cache-control")).toContain("no-store");
    });

    it("never carries a Clerk id, an email, a timezone or a sandbox flag — even if the service handed one over", async () => {
      listAdminUsers.mockResolvedValue({
        ...emptyPage,
        items: [
          {
            ...record(1),
            clerkUserId: "user_must_never_appear",
            email: "private@example.com",
            timezone: "Europe/Madrid",
            isSandbox: false,
          },
        ],
      });
      const response = await get();
      const text = await response.text();
      expect(text).not.toContain("user_must_never_appear");
      expect(text).not.toContain("private@example.com");
      expect(text).not.toContain("Europe/Madrid");
      expect(text).not.toContain("isSandbox");
      expect(text).not.toContain("clerk_must_never_appear");
    });

    it("answers a generic 500 — not a 422 blaming the caller — when the service breaks its own contract", async () => {
      listAdminUsers.mockResolvedValue({
        ...emptyPage,
        items: [record(1, { role: "superuser" })],
      });
      const response = await get();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("superuser");
    });
  });

  describe("what the service says", () => {
    it("answers 422 for a cursor it does not recognise, in words that help", async () => {
      listAdminUsers.mockRejectedValue(
        new AppError(
          "CURRICULUM_VALIDATION_FAILED",
          "That page link is not valid. Go back to the first page.",
        ),
      );
      const response = await get({ cursor: "tampered" });
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "That page link is not valid. Go back to the first page.",
      );
    });

    it("answers 429 with a real Retry-After header when the Admin is searching too fast", async () => {
      listAdminUsers.mockRejectedValue(
        new AdminError(
          "RATE_LIMITED",
          "Please slow down and try again in 12s.",
          { retryAfterSeconds: 12 },
        ),
      );
      const response = await get();
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("12");
    });

    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      listAdminUsers.mockRejectedValue(
        new Error("connection to users_clerk_user_id_key failed"),
      );
      const response = await get();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("users_clerk_user_id_key");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH /api/v1/admin/users/[userId]/role                                    */
/* -------------------------------------------------------------------------- */

const PATCH_URL = `${ORIGIN}/api/v1/admin/users/${USER}/role`;
const BODY = { role: "writer", expectedUpdatedAt: TOKEN, idempotencyKey: KEY };

function patch({
  body = BODY as unknown,
  headers = BROWSER as Record<string, string>,
  url = PATCH_URL,
  userId = USER,
}: {
  body?: unknown;
  headers?: Record<string, string>;
  url?: string;
  userId?: string;
} = {}) {
  return patchRole(
    new Request(url, {
      method: "PATCH",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ userId }) },
  );
}

describe("PATCH /api/v1/admin/users/[userId]/role", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue(userWithRole("admin", ADMIN_ID));
    changeUserRole.mockResolvedValue({
      userId: USER,
      role: "writer",
      updatedAt: "2026-03-02T09:31:00.000001Z",
    });
  });

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and changes nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await patch()).status).toBe(401);
      expect(changeUserRole).not.toHaveBeenCalled();
    });

    // Not just learners: a writer and a developer already work in the console.
    it.each(NOT_ADMIN)(
      "answers 403 for %s, and changes nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await patch();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(changeUserRole).not.toHaveBeenCalled();
      },
    );

    it("re-evaluates the role on every call, so a demoted Admin is refused at once", async () => {
      expect((await patch()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await patch()).status).toBe(403);
      expect(changeUserRole).toHaveBeenCalledOnce();
    });

    it("does not reveal body or path validation to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await patch({ body: { nonsense: true } })).status).toBe(401);
      expect((await patch({ userId: "not-an-id" })).status).toBe(401);
    });

    it("does not reveal them to someone who may not change roles either", async () => {
      requireUser.mockResolvedValue(userWithRole("developer"));
      expect((await patch({ body: { nonsense: true } })).status).toBe(403);
      expect((await patch({ userId: "not-an-id" })).status).toBe(403);
    });
  });

  describe("the command", () => {
    it("changes the account named in the path, as the *authenticated* Admin, with everything the body said", async () => {
      const response = await patch({
        body: { ...BODY, reason: "Joined the content team" },
      });
      expect(response.status).toBe(200);
      expect(changeUserRole).toHaveBeenCalledExactlyOnceWith({
        actorUserId: ADMIN_ID,
        targetUserId: USER,
        role: "writer",
        expectedUpdatedAt: TOKEN,
        reason: "Joined the content team",
        idempotencyKey: KEY,
      });
    });

    it("sends no reason when none was given, and trims one that was", async () => {
      await patch();
      expect(changeUserRole.mock.calls[0]![0].reason).toBeUndefined();
      await patch({ body: { ...BODY, reason: "  Because  " } });
      expect(changeUserRole.mock.calls[1]![0].reason).toBe("Because");
    });

    it.each(USER_ROLES)("accepts the %s role", async (role) => {
      const response = await patch({ body: { ...BODY, role } });
      expect(response.status).toBe(200);
      expect(changeUserRole.mock.calls[0]![0].role).toBe(role);
    });

    it("answers the new role and the account's next version token, uncacheable", async () => {
      const response = await patch();
      expect(await response.json()).toEqual({
        data: {
          userId: USER,
          role: "writer",
          updatedAt: "2026-03-02T09:31:00.000001Z",
        },
      });
      expect(response.headers.get("cache-control")).toContain("no-store");
    });

    it("answers only the contract's three fields — whatever else the service handed over", async () => {
      changeUserRole.mockResolvedValue({
        userId: USER,
        role: "writer",
        updatedAt: "2026-03-02T09:31:00.000001Z",
        clerkUserId: "user_must_never_appear",
        email: "private@example.com",
        previousRole: "user",
      });
      const response = await patch();
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(JSON.parse(text)).toEqual({
        data: {
          userId: USER,
          role: "writer",
          updatedAt: "2026-03-02T09:31:00.000001Z",
        },
      });
      expect(text).not.toContain("user_must_never_appear");
      expect(text).not.toContain("private@example.com");
    });

    it("sends nothing the contract does not describe: a result with a role that does not exist is a generic 500", async () => {
      changeUserRole.mockResolvedValue({
        userId: USER,
        role: "superuser",
        updatedAt: "2026-03-02T09:31:00.000001Z",
      });
      const response = await patch();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("superuser");
    });

    it.each([
      ["an actor", { actorUserId: "someone-else" }],
      ["another account", { userId: "someone-else" }],
      ["a target", { targetUserId: "someone-else" }],
      ["a Clerk id", { clerkUserId: "user_123" }],
      ["a sandbox flag", { isSandbox: true }],
      ["a second role", { roles: ["admin", "writer"] }],
      ["a progress value", { srsStage: 5 }],
      ["a bulk list", { userIds: [USER] }],
    ])("answers 422 for a body that carries %s", async (_name, extra) => {
      const response = await patch({ body: { ...BODY, ...extra } });
      expect(response.status).toBe(422);
      expect(changeUserRole).not.toHaveBeenCalled();
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
      ["a same-site sibling", { ...BROWSER, "sec-fetch-site": "same-site" }],
    ])(
      "answers 403 for %s, before authenticating or changing anything",
      async (_name, headers) => {
        const response = await patch({ headers });
        expect(response.status).toBe(403);
        expect(changeUserRole).not.toHaveBeenCalled();
        expect(requireUser).not.toHaveBeenCalled();
      },
    );

    it.each([
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "text/plain",
    ])("answers 415 for a %s body", async (type) => {
      const response = await patch({
        headers: { ...BROWSER, "content-type": type },
      });
      expect(response.status).toBe(415);
      expect(changeUserRole).not.toHaveBeenCalled();
    });

    it("answers 422 when the command arrives in the query string", async () => {
      const response = await patch({ url: `${PATCH_URL}?role=admin` });
      expect(response.status).toBe(422);
      expect(changeUserRole).not.toHaveBeenCalled();
    });
  });

  describe("body validation", () => {
    it.each([
      ["invalid JSON", "{not json"],
      ["an empty body", ""],
      ["no role", { expectedUpdatedAt: TOKEN, idempotencyKey: KEY }],
      ["a role that is not one of the five", { ...BODY, role: "superadmin" }],
      ["a role in the wrong case", { ...BODY, role: "ADMIN" }],
      ["a list of roles", { ...BODY, role: ["admin"] }],
      [
        "no version token — there is no unconditional change",
        { role: "writer", idempotencyKey: KEY },
      ],
      [
        "a version token that is not an instant",
        { ...BODY, expectedUpdatedAt: "now" },
      ],
      ["no key", { role: "writer", expectedUpdatedAt: TOKEN }],
      ["a key that is not a UUID", { ...BODY, idempotencyKey: "retry-1" }],
      ["an empty reason", { ...BODY, reason: "" }],
      ["an over-long reason", { ...BODY, reason: "x".repeat(201) }],
    ])("answers 422 for %s, changing nothing", async (_name, body) => {
      const response = await patch({ body });
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(changeUserRole).not.toHaveBeenCalled();
    });

    it("answers 422 for an id in the path that is not an id", async () => {
      for (const userId of ["not-an-id", "1", "../admin"]) {
        expect((await patch({ userId })).status).toBe(422);
      }
      expect(changeUserRole).not.toHaveBeenCalled();
    });

    it("answers 413 for an oversized body, without parsing it", async () => {
      const response = await patch({
        body: JSON.stringify({ ...BODY, padding: "x".repeat(10_000) }),
      });
      expect(response.status).toBe(413);
      expect(changeUserRole).not.toHaveBeenCalled();
    });
  });

  describe("what the service says — each refusal in its own words", () => {
    it("answers 404 for an account that does not exist", async () => {
      changeUserRole.mockRejectedValue(new AdminError("USER_NOT_FOUND"));
      const response = await patch();
      expect(response.status).toBe(404);
      expect((await response.json()).error.message).toBe(
        "That user could not be found.",
      );
    });

    it.each([
      "You can't change your own role. Ask another Admin.",
      "Only real, signed-up accounts can be given a role here.",
      "That person already has that role.",
    ])("answers 422, in the service's words, for: %s", async (message) => {
      changeUserRole.mockRejectedValue(
        new AdminError("USER_ROLE_CHANGE_NOT_ALLOWED", message),
      );
      const response = await patch();
      expect(response.status).toBe(422);
      expect((await response.json()).error).toEqual({
        code: "VALIDATION_FAILED",
        message,
      });
    });

    it("answers 409, saying to reload, for an account that changed after the Admin looked", async () => {
      changeUserRole.mockRejectedValue(
        new AdminError(
          "ADMIN_EDIT_CONFLICT",
          "This account changed after you opened the list. Reload to see its current role, then try again.",
        ),
      );
      const response = await patch();
      expect(response.status).toBe(409);
      expect((await response.json()).error.message).toContain("Reload");
    });

    it("answers 409 for a change that would leave no Admin", async () => {
      changeUserRole.mockRejectedValue(new AdminError("LAST_ADMIN"));
      const response = await patch();
      expect(response.status).toBe(409);
      expect((await response.json()).error.message).toContain(
        "without an Admin",
      );
    });

    it("answers 403 for an Admin who was demoted after the route checked", async () => {
      changeUserRole.mockRejectedValue(new AppError("FORBIDDEN"));
      expect((await patch()).status).toBe(403);
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
      changeUserRole.mockRejectedValue(failure);
      expect((await patch()).status).toBe(409);
    });

    it("answers 429 with a real Retry-After header when role changes come too fast", async () => {
      changeUserRole.mockRejectedValue(
        new AdminError(
          "RATE_LIMITED",
          "Please slow down and try again in 9s.",
          { retryAfterSeconds: 9 },
        ),
      );
      const response = await patch();
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("9");
    });

    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      changeUserRole.mockRejectedValue(
        new Error("deadlock detected on users_clerk_user_id_key"),
      );
      const response = await patch();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("users_clerk_user_id_key");
    });

    it("never puts a Clerk id in any answer, success or refusal", async () => {
      const texts = [await (await patch()).text()];
      changeUserRole.mockRejectedValue(new AdminError("USER_NOT_FOUND"));
      texts.push(await (await patch()).text());
      for (const text of texts) {
        expect(text).not.toContain("clerk_must_never_appear");
        expect(text).not.toContain("Private Name");
      }
    });
  });
});
