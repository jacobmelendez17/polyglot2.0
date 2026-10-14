import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRICULUM_BULK_ITEM_LIMIT } from "@/domains/admin";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const bulkPublishPendingItems = vi.hoisted(() => vi.fn());
const bulkArchiveItems = vi.hoisted(() => vi.fn());
const bulkMoveItems = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/admin/server", () => ({
  bulkPublishPendingItems,
  bulkArchiveItems,
  bulkMoveItems,
}));

import { POST as postArchive } from "./curriculum/bulk-archive/route";
import { POST as postMove } from "./curriculum/bulk-move/route";
import { POST as postPublish } from "./curriculum/bulk-publish/route";

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const LANGUAGE = "10000000-0000-4000-8000-000000000001";
const KEY = "0881836c-de9a-4dc5-84f7-1dd28b8fa439";
const LEVEL = "30000000-0000-4000-8000-000000000003";
const GROUP = "50000000-0000-4000-8000-000000000005";
const ITEM_A = "40000000-0000-4000-8000-00000000000a";
const ITEM_B = "40000000-0000-4000-8000-00000000000b";
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

/** Everyone but an Admin — including the two roles that already work in the console. */
const NOT_ADMIN = USER_ROLES.filter((role) => role !== "admin");

const BROWSER = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

function itemIds(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      `40000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
  );
}

/**
 * The three commands share a pipeline and a body shape; each has its own
 * service and result. Everything in `describe.each` below is therefore stated
 * once for all of them, and the per-command wiring (what the service is called
 * with) once each.
 */
const COMMANDS = [
  {
    name: "bulk-publish",
    post: postPublish,
    service: bulkPublishPendingItems,
    body: {
      languageId: LANGUAGE,
      itemIds: [ITEM_A, ITEM_B],
      idempotencyKey: KEY,
    },
    result: { publishedItemIds: [ITEM_A, ITEM_B] },
  },
  {
    name: "bulk-archive",
    post: postArchive,
    service: bulkArchiveItems,
    body: {
      languageId: LANGUAGE,
      itemIds: [ITEM_A, ITEM_B],
      idempotencyKey: KEY,
    },
    result: { archivedItemIds: [ITEM_A], alreadyArchivedItemIds: [ITEM_B] },
  },
  {
    name: "bulk-move",
    post: postMove,
    service: bulkMoveItems,
    body: {
      languageId: LANGUAGE,
      itemIds: [ITEM_A, ITEM_B],
      levelId: LEVEL,
      idempotencyKey: KEY,
    },
    result: { movedItemIds: [ITEM_A], unchangedItemIds: [ITEM_B] },
  },
] as const;

const SERVICES = [bulkPublishPendingItems, bulkArchiveItems, bulkMoveItems];

beforeEach(() => {
  for (const mock of [requireUser, ...SERVICES]) mock.mockReset();
  requireUser.mockResolvedValue(userWithRole("admin", ADMIN_ID));
  bulkPublishPendingItems.mockResolvedValue(COMMANDS[0].result);
  bulkArchiveItems.mockResolvedValue(COMMANDS[1].result);
  bulkMoveItems.mockResolvedValue(COMMANDS[2].result);
});

function send(
  command: (typeof COMMANDS)[number],
  {
    body = command.body as unknown,
    headers = BROWSER as Record<string, string>,
    query = "",
  }: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: string;
  } = {},
) {
  return command.post(
    new Request(`${ORIGIN}/api/v1/admin/curriculum/${command.name}${query}`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe.each(COMMANDS)("POST /api/v1/admin/curriculum/$name", (command) => {
  const go = (options?: Parameters<typeof send>[1]) => send(command, options);

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and does nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await go()).status).toBe(401);
      expect(command.service).not.toHaveBeenCalled();
    });

    // A writer already works in the console, and may reorder and edit; none of
    // that is any part of publishing, archiving or moving in bulk.
    it.each(NOT_ADMIN)("answers 403 for %s, and does nothing", async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      const response = await go();
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(command.service).not.toHaveBeenCalled();
    });

    it("answers 200 for an Admin", async () => {
      expect((await go()).status).toBe(200);
    });

    it("re-evaluates the role on every call, so a demoted Admin is refused at once", async () => {
      expect((await go()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await go()).status).toBe(403);
      expect(command.service).toHaveBeenCalledOnce();
    });

    it("does not reveal body validation to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await go({ body: { nonsense: true } })).status).toBe(401);
    });

    it("does not reveal it to someone who may not use bulk commands either", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await go({ body: { nonsense: true } })).status).toBe(403);
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
      "answers 403 for %s, before authenticating or doing anything",
      async (_name, headers) => {
        const response = await go({ headers });
        expect(response.status).toBe(403);
        expect(command.service).not.toHaveBeenCalled();
        expect(requireUser).not.toHaveBeenCalled();
      },
    );

    it.each([
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "text/plain",
    ])("answers 415 for a %s body", async (type) => {
      const response = await go({
        headers: { ...BROWSER, "content-type": type },
      });
      expect(response.status).toBe(415);
      expect(command.service).not.toHaveBeenCalled();
    });

    it("answers 422 when anything arrives in the query string", async () => {
      const response = await go({ query: `?languageId=${LANGUAGE}` });
      expect(response.status).toBe(422);
      expect(command.service).not.toHaveBeenCalled();
    });
  });

  describe("the body", () => {
    it.each([
      ["invalid JSON", "{not json"],
      ["an empty body", ""],
      ["an array", [command.body]],
      ["no language", { ...command.body, languageId: undefined }],
      ["a language that is not an id", { ...command.body, languageId: "es" }],
      ["no items", { ...command.body, itemIds: undefined }],
      ["an empty list of items", { ...command.body, itemIds: [] }],
      ["items that are not a list", { ...command.body, itemIds: ITEM_A }],
      [
        "an item that is not an id",
        { ...command.body, itemIds: [ITEM_A, "x"] },
      ],
      ["the same item twice", { ...command.body, itemIds: [ITEM_A, ITEM_A] }],
      [
        "the same item twice in another letter case",
        { ...command.body, itemIds: [ITEM_A, ITEM_A.toUpperCase()] },
      ],
      ["no key", { ...command.body, idempotencyKey: undefined }],
      [
        "a key that is not a UUID",
        { ...command.body, idempotencyKey: "retry-1" },
      ],
    ])("answers 422 for %s, doing nothing", async (_name, body) => {
      const response = await go({ body });
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(command.service).not.toHaveBeenCalled();
    });

    it.each([
      ["an actor", { actorUserId: "someone-else" }],
      ["a role", { role: "admin" }],
      ["a status", { status: "published" }],
      ["the old field name for items", { learningItemIds: [ITEM_A] }],
      ["a Clerk id", { clerkUserId: "user_123" }],
    ])("answers 422 for a body that carries %s", async (_name, extra) => {
      const response = await go({ body: { ...command.body, ...extra } });
      expect(response.status).toBe(422);
      expect(command.service).not.toHaveBeenCalled();
    });

    it(`accepts exactly ${CURRICULUM_BULK_ITEM_LIMIT} items`, async () => {
      const response = await go({
        body: { ...command.body, itemIds: itemIds(CURRICULUM_BULK_ITEM_LIMIT) },
      });
      expect(response.status).toBe(200);
      expect(command.service).toHaveBeenCalledOnce();
      expect(command.service.mock.calls[0]![0].learningItemIds).toHaveLength(
        CURRICULUM_BULK_ITEM_LIMIT,
      );
    });

    it("accepts the bound even when the body is indented, which an ordinary command's cap would refuse", async () => {
      const body = JSON.stringify(
        { ...command.body, itemIds: itemIds(CURRICULUM_BULK_ITEM_LIMIT) },
        null,
        1,
      );
      expect(body.length).toBeGreaterThan(4096);
      const response = await go({ body });
      expect(response.status).toBe(200);
      expect(command.service).toHaveBeenCalledOnce();
    });

    it(`answers 422 for ${CURRICULUM_BULK_ITEM_LIMIT + 1} items, doing nothing`, async () => {
      const response = await go({
        body: {
          ...command.body,
          itemIds: itemIds(CURRICULUM_BULK_ITEM_LIMIT + 1),
        },
      });
      expect(response.status).toBe(422);
      expect(command.service).not.toHaveBeenCalled();
    });

    it("answers 413 for a body past the bulk cap, without parsing it", async () => {
      const response = await go({
        body: JSON.stringify({ ...command.body, padding: "x".repeat(9_000) }),
      });
      expect(response.status).toBe(413);
      expect(command.service).not.toHaveBeenCalled();
    });
  });

  describe("what the service says — each refusal in its own words", () => {
    it("answers 404, in the service's words, for an item that no longer exists", async () => {
      command.service.mockRejectedValue(
        new AdminError(
          "CURRICULUM_ITEM_NOT_FOUND",
          "One of the selected items no longer exists. Reload the list and try again.",
        ),
      );
      const response = await go();
      expect(response.status).toBe(404);
      expect((await response.json()).error).toEqual({
        code: "NOT_FOUND",
        message:
          "One of the selected items no longer exists. Reload the list and try again.",
      });
    });

    it("answers 422, in the service's words, for items or a target in another language", async () => {
      const message =
        "Some of the selected items aren't in this language. Reload the list and try again.";
      command.service.mockRejectedValue(
        new AdminError("CURRICULUM_VALIDATION_FAILED", message),
      );
      const response = await go();
      expect(response.status).toBe(422);
      expect((await response.json()).error).toEqual({
        code: "VALIDATION_FAILED",
        message,
      });
    });

    it("answers 409, saying to reload, when the items changed after the Admin looked", async () => {
      command.service.mockRejectedValue(
        new AdminError(
          "ADMIN_EDIT_CONFLICT",
          "Some of the selected items are no longer Pending — someone else may have published, archived or changed them. Reload the list and try again.",
        ),
      );
      const response = await go();
      expect(response.status).toBe(409);
      expect((await response.json()).error.message).toContain("Reload");
    });

    it("answers 403 for an Admin who was demoted after the route checked", async () => {
      command.service.mockRejectedValue(new AppError("FORBIDDEN"));
      expect((await go()).status).toBe(403);
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
      command.service.mockRejectedValue(failure);
      expect((await go()).status).toBe(409);
    });

    it("answers 429 with a real Retry-After header when commands come too fast", async () => {
      command.service.mockRejectedValue(
        new AdminError(
          "RATE_LIMITED",
          "Please slow down and try again in 9s.",
          { retryAfterSeconds: 9 },
        ),
      );
      const response = await go();
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("9");
    });

    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      command.service.mockRejectedValue(
        new Error("deadlock detected on learning_items_pkey"),
      );
      const response = await go();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("learning_items_pkey");
    });
  });

  describe("the answer", () => {
    it("is the service's result under `data`, uncacheable", async () => {
      const response = await go();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: command.result });
      expect(response.headers.get("cache-control")).toContain("no-store");
    });

    it("carries only the contract's fields — whatever else the service handed over", async () => {
      command.service.mockResolvedValue({
        ...command.result,
        actorUserId: "user_must_never_appear",
        audit: ["private"],
      });
      const response = await go();
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(JSON.parse(text)).toEqual({ data: command.result });
      expect(text).not.toContain("user_must_never_appear");
    });

    it("is a generic 500 — not a 422 that blames the caller — when the service's result does not match the contract", async () => {
      command.service.mockResolvedValue({ unexpected: "shape" });
      const response = await go();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("unexpected");
    });

    it("never puts a Clerk id in any answer, success or refusal", async () => {
      const texts = [await (await go()).text()];
      command.service.mockRejectedValue(
        new AdminError("CURRICULUM_ITEM_NOT_FOUND"),
      );
      texts.push(await (await go()).text());
      for (const text of texts) {
        expect(text).not.toContain("clerk_must_never_appear");
        expect(text).not.toContain("Private Name");
      }
    });
  });
});

describe("what each command asks of its service", () => {
  it("publishes the named items in the named language, as the authenticated Admin", async () => {
    await send(COMMANDS[0]);
    expect(bulkPublishPendingItems).toHaveBeenCalledExactlyOnceWith({
      languageId: LANGUAGE,
      learningItemIds: [ITEM_A, ITEM_B],
      idempotencyKey: KEY,
      actorUserId: ADMIN_ID,
    });
  });

  it("archives the named items in the named language, as the authenticated Admin", async () => {
    await send(COMMANDS[1]);
    expect(bulkArchiveItems).toHaveBeenCalledExactlyOnceWith({
      languageId: LANGUAGE,
      learningItemIds: [ITEM_A, ITEM_B],
      idempotencyKey: KEY,
      actorUserId: ADMIN_ID,
    });
  });

  it("moves to a level, as the authenticated Admin, naming no group", async () => {
    await send(COMMANDS[2]);
    expect(bulkMoveItems).toHaveBeenCalledExactlyOnceWith({
      languageId: LANGUAGE,
      learningItemIds: [ITEM_A, ITEM_B],
      levelId: LEVEL,
      idempotencyKey: KEY,
      actorUserId: ADMIN_ID,
    });
    expect(bulkMoveItems.mock.calls[0]![0].vocabularyGroupId).toBeUndefined();
  });

  it("moves to a group — the contract's groupId is the service's vocabularyGroupId", async () => {
    const body = {
      languageId: LANGUAGE,
      itemIds: [ITEM_A],
      groupId: GROUP,
      idempotencyKey: KEY,
    };
    expect((await send(COMMANDS[2], { body })).status).toBe(200);
    expect(bulkMoveItems).toHaveBeenCalledExactlyOnceWith({
      languageId: LANGUAGE,
      learningItemIds: [ITEM_A],
      vocabularyGroupId: GROUP,
      idempotencyKey: KEY,
      actorUserId: ADMIN_ID,
    });
    expect(bulkMoveItems.mock.calls[0]![0].levelId).toBeUndefined();
  });

  it("moves to a level and a group together", async () => {
    const body = {
      languageId: LANGUAGE,
      itemIds: [ITEM_A],
      levelId: LEVEL,
      groupId: GROUP,
      idempotencyKey: KEY,
    };
    expect((await send(COMMANDS[2], { body })).status).toBe(200);
    const call = bulkMoveItems.mock.calls[0]![0];
    expect(call.levelId).toBe(LEVEL);
    expect(call.vocabularyGroupId).toBe(GROUP);
  });

  it("answers 422 for a move that names neither a level nor a group, doing nothing", async () => {
    const body = {
      languageId: LANGUAGE,
      itemIds: [ITEM_A],
      idempotencyKey: KEY,
    };
    const response = await send(COMMANDS[2], { body });
    expect(response.status).toBe(422);
    expect(bulkMoveItems).not.toHaveBeenCalled();
  });

  it("takes the actor from the session, whoever the body claims to be", async () => {
    requireUser.mockResolvedValue(userWithRole("admin", "another-admin"));
    await send(COMMANDS[1]);
    expect(bulkArchiveItems.mock.calls[0]![0].actorUserId).toBe(
      "another-admin",
    );
  });
});
