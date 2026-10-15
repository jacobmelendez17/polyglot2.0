import { beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_AUDIT_ACTIONS, LOG_LIST_PAGE_SIZE } from "@/domains/admin";
import type { AdminAuditEvent, AuditEventsPage } from "@/domains/admin";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getUsersByIds = vi.hoisted(() => vi.fn());
const getAuditEvents = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser, getUsersByIds }));
vi.mock("@/domains/admin/server", () => ({ getAuditEvents }));

import { GET as getLogs } from "./logs/route";

const ORIGIN = "http://localhost";
const ACTOR = "a0000000-0000-4000-8000-000000000001";
const TARGET = "b0000000-0000-4000-8000-000000000002";

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

/** The audit log is for Admin and developer — never a writer, who authors but does not read the trail. */
const MAY_READ = ["admin", "developer"] as const;
const CANNOT_READ = USER_ROLES.filter(
  (role) => !(MAY_READ as readonly string[]).includes(role),
);

function event(
  n: number,
  overrides: Partial<AdminAuditEvent> = {},
): AdminAuditEvent {
  return {
    id: `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    actorUserId: ACTOR,
    action: "USER_ROLE_CHANGED",
    resourceType: "user",
    resourceId: TARGET,
    beforeData: { role: "user" },
    afterData: { role: "writer" },
    reason: "Reviews lessons",
    correlationId: "correlation-1",
    createdAt: new Date("2026-10-14T22:46:21.710Z"),
    ...overrides,
  };
}

function page(
  items: AdminAuditEvent[],
  overrides: Partial<AuditEventsPage> = {},
): AuditEventsPage {
  return {
    items,
    nextCursor: null,
    hasPreviousPage: false,
    previousCursor: null,
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [requireUser, getUsersByIds, getAuditEvents]) {
    mock.mockReset();
  }
  requireUser.mockResolvedValue(userWithRole("admin"));
  getUsersByIds.mockResolvedValue([
    { id: ACTOR, displayName: "Ada Admin", username: "ada" },
  ]);
  getAuditEvents.mockResolvedValue(page([event(1)]));
});

const get = (query: Record<string, string> = {}) =>
  getLogs(
    new Request(
      `${ORIGIN}/api/v1/admin/logs${
        Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""
      }`,
      { method: "GET" },
    ),
  );

describe("GET /api/v1/admin/logs", () => {
  describe("authorization — Admin and developer, from the database role", () => {
    it("answers 401 with no session, and reads nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get()).status).toBe(401);
      expect(getAuditEvents).not.toHaveBeenCalled();
    });

    it.each(CANNOT_READ)(
      "answers 403 for %s — a writer authors but does not read the trail — and reads nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await get();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(getAuditEvents).not.toHaveBeenCalled();
        expect(getUsersByIds).not.toHaveBeenCalled();
      },
    );

    it.each(MAY_READ)("answers 200 for %s", async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      expect((await get()).status).toBe(200);
    });

    it("re-evaluates the role on every call, so a demoted Admin is refused at once", async () => {
      expect((await get()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await get()).status).toBe(403);
      expect(getAuditEvents).toHaveBeenCalledOnce();
    });

    it("does not reveal its parameters to someone who may not read", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await get({ sort: "x" })).status).toBe(403);
    });
  });

  describe("the query — the page's filters, a cursor, and nothing else", () => {
    it("reads the first page at the default size with no filters", async () => {
      await get();
      expect(getAuditEvents).toHaveBeenCalledExactlyOnceWith({
        actorUserId: undefined,
        action: undefined,
        resourceType: undefined,
        resourceId: undefined,
        from: undefined,
        to: undefined,
        limit: LOG_LIST_PAGE_SIZE,
        cursor: undefined,
      });
    });

    it("hands every filter to the service, and the dates as whole UTC days with both ends inclusive", async () => {
      await get({
        actor: ACTOR,
        action: "USER_ROLE_CHANGED",
        resourceType: "user",
        resourceId: TARGET,
        from: "2026-10-01",
        to: "2026-10-14",
        cursor: "opaque",
        limit: "10",
      });
      expect(getAuditEvents).toHaveBeenCalledExactlyOnceWith({
        actorUserId: ACTOR,
        action: "USER_ROLE_CHANGED",
        resourceType: "user",
        resourceId: TARGET,
        from: new Date("2026-10-01T00:00:00.000Z"),
        to: new Date("2026-10-14T23:59:59.999Z"),
        limit: 10,
        cursor: "opaque",
      });
    });

    it.each(ADMIN_AUDIT_ACTIONS)("accepts the action %s", async (action) => {
      expect((await get({ action })).status).toBe(200);
    });

    it.each([
      ["an action nothing records", { action: "SOMETHING_ELSE" }],
      ["an actor that is not an id", { actor: "ada" }],
      ["a date that is not a day", { from: "yesterday" }],
      ["a day that does not exist", { to: "2026-02-30" }],
      ["a resource type of nothing", { resourceType: "   " }],
      ["a resource id that is far too long", { resourceId: "x".repeat(201) }],
      ["a sort", { sort: "action" }],
      ["a language", { language: "5b2eb57d-acb8-4964-8af4-49a417cf227a" }],
      ["a search", { search: "role" }],
      ["a page of nothing", { limit: "0" }],
      ["a page over the bound", { limit: "101" }],
      ["a page size that is not a number", { limit: "many" }],
      ["a cursor that is far too long", { cursor: "x".repeat(513) }],
    ])("answers 422 for %s, reading nothing", async (_name, query) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(getAuditEvents).not.toHaveBeenCalled();
    });

    it("answers 422, in the service's words, for a cursor that is not one of ours", async () => {
      getAuditEvents.mockRejectedValue(
        new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "That page link is not valid. Go back to the first page.",
        ),
      );
      const response = await get({ cursor: "garbage" });
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "That page link is not valid. Go back to the first page.",
      );
    });
  });

  describe("the answer", () => {
    it("is the page, as the contract describes it, uncacheable", async () => {
      getAuditEvents.mockResolvedValue(
        page([event(2), event(1, { reason: null, correlationId: null })], {
          nextCursor: "next",
          hasPreviousPage: true,
          previousCursor: "previous",
        }),
      );
      const response = await get();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({
        data: {
          items: [
            {
              id: "e0000000-0000-4000-8000-000000000002",
              createdAt: "2026-10-14T22:46:21.710Z",
              actorId: ACTOR,
              actorName: "Ada Admin",
              action: "USER_ROLE_CHANGED",
              resourceType: "user",
              resourceId: TARGET,
              reason: "Reviews lessons",
              correlationId: "correlation-1",
              beforeData: { role: "user" },
              afterData: { role: "writer" },
            },
            {
              id: "e0000000-0000-4000-8000-000000000001",
              createdAt: "2026-10-14T22:46:21.710Z",
              actorId: ACTOR,
              actorName: "Ada Admin",
              action: "USER_ROLE_CHANGED",
              resourceType: "user",
              resourceId: TARGET,
              reason: null,
              correlationId: null,
              beforeData: { role: "user" },
              afterData: { role: "writer" },
            },
          ],
          nextCursor: "next",
          hasPreviousPage: true,
          previousCursor: "previous",
        },
      });
    });

    it("looks each actor up once, however many events they made, and not at all for an empty page", async () => {
      getAuditEvents.mockResolvedValue(page([event(1), event(2), event(3)]));
      await get();
      expect(getUsersByIds).toHaveBeenCalledExactlyOnceWith([ACTOR]);

      getUsersByIds.mockClear();
      getAuditEvents.mockResolvedValue(page([]));
      await get();
      expect(getUsersByIds).toHaveBeenCalledExactlyOnceWith([]);
    });

    it("names an actor the lookup does not know by a short id, and never by a sign-in id or an email", async () => {
      getUsersByIds.mockResolvedValue([]);
      const text = await (await get()).text();
      expect(JSON.parse(text).data.items[0].actorName).toBe("a0000000…");
      for (const secret of [
        "clerk_must_never_appear",
        "Private Name",
        "private-username",
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it("is empty, not an error, when nothing matches", async () => {
      getAuditEvents.mockResolvedValue(page([]));
      const { data } = await (await get()).json();
      expect(data).toEqual({
        items: [],
        nextCursor: null,
        hasPreviousPage: false,
        previousCursor: null,
      });
    });
  });

  describe("failures", () => {
    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      getAuditEvents.mockRejectedValue(new Error("select * from secret_table"));
      const response = await get();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("secret_table");
      log.mockRestore();
    });

    it("is a generic 500 — not a 422 that blames the caller — when the service breaks the contract", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      getAuditEvents.mockResolvedValue(
        page([event(1, { action: "NOT_AN_ACTION" as never })]),
      );
      expect((await get()).status).toBe(500);
      log.mockRestore();
    });
  });
});
