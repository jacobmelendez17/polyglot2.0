import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/errors/admin-errors";

/**
 * Spec 26 Unit 6 — how `admin-mutation-service.ts` binds the two user-management
 * commands to the app database and to their *own* rate limits. The rules of a
 * role change are proven against a real database elsewhere
 * (`user-role-service.integration.test.ts`); what only this layer decides is
 * which allowance each call spends and that a refusal stops the call before it
 * does anything. Without these, a wrong or missing limit would pass every other
 * fast test and only show in the slow end-to-end tier.
 */

const mocks = vi.hoisted(() => ({
  db: { name: "the app database" },
  check: vi.fn(),
  changeUserRole: vi.fn(),
  listAdminUsers: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: mocks.db }));
vi.mock("@/providers/rate-limit", () => ({
  getRateLimiter: () => ({ check: mocks.check }),
}));
vi.mock("./user-role-service", () => ({
  changeUserRole: mocks.changeUserRole,
}));
vi.mock("@/domains/users/admin-user-repository", () => ({
  listAdminUsers: mocks.listAdminUsers,
}));
// Imported by the file under test, never called here: replaced, so loading it
// needs no database, queue, storage or environment.
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/providers/storage", () => ({}));
vi.mock("@/providers/queue", () => ({}));
vi.mock("./publication-service", () => ({}));
vi.mock("./bulk-import-service", () => ({}));
vi.mock("./account-reset-service", () => ({}));
vi.mock("./curriculum-import-service", () => ({}));
vi.mock("./curriculum-import-repository", () => ({}));

import { changeUserRole, listAdminUsers } from "./admin-mutation-service";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

const change = {
  actorUserId: ACTOR,
  targetUserId: TARGET,
  role: "writer" as const,
  expectedUpdatedAt: "2026-10-13T10:00:00.123456Z",
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
};

const refused = (retryAfterSeconds: number) => ({
  allowed: false,
  retryAfterSeconds,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.check.mockResolvedValue({ allowed: true });
});

describe("changeUserRole", () => {
  it("spends the role-change allowance of the person asking, then makes the change in the app database", async () => {
    const done = { userId: TARGET, role: "writer", updatedAt: "x" };
    mocks.changeUserRole.mockResolvedValue(done);

    await expect(changeUserRole(change)).resolves.toBe(done);

    // Its own policy — not the general mutation allowance, which is 3x more generous.
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.check).toHaveBeenCalledWith({
      policy: "admin-role-change",
      subject: ACTOR,
    });
    expect(mocks.changeUserRole).toHaveBeenCalledTimes(1);
    expect(mocks.changeUserRole).toHaveBeenCalledWith(mocks.db, change);
  });

  it("checks the allowance before it does anything else", async () => {
    mocks.changeUserRole.mockResolvedValue({});
    await changeUserRole(change);

    expect(mocks.check.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.changeUserRole.mock.invocationCallOrder[0]!,
    );
  });

  it("makes no change at all once the allowance is spent, and says when to try again", async () => {
    mocks.check.mockResolvedValue(refused(12));

    const failure = await changeUserRole(change).catch((error) => error);

    expect(failure).toBeInstanceOf(AdminError);
    expect(failure).toMatchObject({
      code: "RATE_LIMITED",
      message: "Please slow down and try again in 12s.",
      details: { retryAfterSeconds: 12 },
    });
    expect(mocks.changeUserRole).not.toHaveBeenCalled();
  });

  it("does not hide a limiter that is down: the change is not made", async () => {
    mocks.check.mockRejectedValue(new Error("limiter unavailable"));

    await expect(changeUserRole(change)).rejects.toThrow("limiter unavailable");
    expect(mocks.changeUserRole).not.toHaveBeenCalled();
  });
});

describe("listAdminUsers", () => {
  it("spends the account-search allowance of the person asking, then reads with the query alone — the actor is whose budget it is, never a filter", async () => {
    const page = { items: [], nextCursor: null };
    mocks.listAdminUsers.mockResolvedValue(page);

    await expect(
      listAdminUsers({ actorUserId: ACTOR, search: "ana", limit: 20 }),
    ).resolves.toBe(page);

    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.check).toHaveBeenCalledWith({
      policy: "admin-user-search",
      subject: ACTOR,
    });
    expect(mocks.listAdminUsers).toHaveBeenCalledTimes(1);
    const [db, query] = mocks.listAdminUsers.mock.calls[0]!;
    expect(db).toBe(mocks.db);
    expect(query).toEqual({ search: "ana", limit: 20 });
    expect(query).not.toHaveProperty("actorUserId");
  });

  it("reads nothing once the allowance is spent — a refused enumeration learns nothing", async () => {
    mocks.check.mockResolvedValue(refused(30));

    const failure = await listAdminUsers({
      actorUserId: ACTOR,
      limit: 20,
    }).catch((error) => error);

    expect(failure).toMatchObject({
      code: "RATE_LIMITED",
      details: { retryAfterSeconds: 30 },
    });
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
  });

  it("counts every read, including one for the first page with no search", async () => {
    mocks.listAdminUsers.mockResolvedValue({ items: [] });

    await listAdminUsers({ actorUserId: ACTOR, limit: 20 });
    await listAdminUsers({ actorUserId: ACTOR, limit: 20, cursor: "next" });

    expect(mocks.check).toHaveBeenCalledTimes(2);
  });
});
