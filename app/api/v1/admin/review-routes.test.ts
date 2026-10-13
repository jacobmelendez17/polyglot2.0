import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import type { ReviewQueueEntry } from "@/domains/curriculum";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getUsersByIds = vi.hoisted(() => vi.fn());
const getLanguages = vi.hoisted(() => vi.fn());
const getReviewQueuePage = vi.hoisted(() => vi.fn());
const publishItem = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser, getUsersByIds }));
vi.mock("@/domains/curriculum/server", () => ({
  getLanguages,
  getReviewQueuePage,
}));
vi.mock("@/domains/admin/server", () => ({ publishItem }));

import { GET as getReview } from "./review/route";
import { POST as publishReviewItem } from "./review/publish/route";

const LANGUAGE = "5b2eb57d-acb8-4964-8af4-49a417cf227a";
const ITEM = "133c9db4-dc71-4a7c-acf7-d55394ffdb42";
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
const CANNOT_REVIEW = USER_ROLES.filter(
  (role) => role !== "admin" && role !== "writer",
);
const CANNOT_PUBLISH = USER_ROLES.filter((role) => role !== "admin");

beforeEach(() => {
  for (const mock of [
    requireUser,
    getUsersByIds,
    getLanguages,
    getReviewQueuePage,
    publishItem,
  ]) {
    mock.mockReset();
  }
  getLanguages.mockResolvedValue([{ id: LANGUAGE, name: "Spanish" }]);
  getUsersByIds.mockResolvedValue([]);
});

/* -------------------------------------------------------------------------- */
/* GET /api/v1/admin/review                                                   */
/* -------------------------------------------------------------------------- */

function entry(overrides: Partial<ReviewQueueEntry> = {}): ReviewQueueEntry {
  return {
    learningItemId: ITEM,
    kind: "new",
    type: "vocabulary",
    itemLabel: "el gato",
    meaningLabel: "cat",
    levelNumber: 1,
    groupName: "Animals",
    authorUserId: null,
    updatedAt: new Date("2026-03-04T05:06:07.000Z"),
    version: 3,
    ...overrides,
  };
}

const queuePage = (entries: ReviewQueueEntry[], extra = {}) => ({
  entries,
  nextCursor: null,
  hasPreviousPage: false,
  previousCursor: null,
  ...extra,
});

const getUrl = (query: Record<string, string> = { language: LANGUAGE }) =>
  `${ORIGIN}/api/v1/admin/review?${new URLSearchParams(query)}`;
const get = (query?: Record<string, string>) =>
  getReview(new Request(getUrl(query), { method: "GET" }));

describe("GET /api/v1/admin/review", () => {
  beforeEach(() => {
    getReviewQueuePage.mockResolvedValue(queuePage([entry()]));
  });

  it("answers 401 with no session, without touching the queue", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    expect((await get()).status).toBe(401);
    expect(getReviewQueuePage).not.toHaveBeenCalled();
  });

  it.each(CANNOT_REVIEW)(
    "answers 403 for %s, and never reads the queue",
    async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      const response = await get();
      expect(response.status).toBe(403);
      expect(await response.json()).not.toHaveProperty("data");
      expect(getReviewQueuePage).not.toHaveBeenCalled();
    },
  );

  // Spec: "Keep writer's read visibility".
  it.each(["admin", "writer"] as const)("answers 200 for %s", async (role) => {
    requireUser.mockResolvedValue(userWithRole(role));
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("asks for a bounded page of the requested language, and passes the cursor through", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    await get({ language: LANGUAGE, cursor: "abc", limit: "50" });
    expect(getReviewQueuePage).toHaveBeenCalledExactlyOnceWith({
      languageId: LANGUAGE,
      limit: 50,
      cursor: "abc",
    });
  });

  it("defaults to the Admin page size", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    await get();
    expect(getReviewQueuePage.mock.calls[0]![0].limit).toBe(20);
  });

  it("returns new-vs-edit rows with author names, ISO times, and the version to echo back", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    getReviewQueuePage.mockResolvedValue(
      queuePage(
        [
          entry({ learningItemId: "item-new" }),
          entry({
            learningItemId: "item-edit",
            kind: "edit",
            authorUserId: "author-1",
            version: 7,
          }),
          entry({
            learningItemId: "item-orphan",
            kind: "edit",
            authorUserId: "author-gone",
          }),
        ],
        { nextCursor: "next-token" },
      ),
    );
    getUsersByIds.mockResolvedValue([
      { id: "author-1", displayName: "Ada Lovelace" },
    ]);

    const { data } = await (await get()).json();

    expect(data.items).toEqual([
      {
        id: "item-new",
        kind: "new",
        itemLabel: "el gato",
        meaningLabel: "cat",
        levelNumber: 1,
        groupName: "Animals",
        authorName: null,
        updatedAt: "2026-03-04T05:06:07.000Z",
        version: 3,
      },
      expect.objectContaining({
        id: "item-edit",
        kind: "edit",
        authorName: "Ada Lovelace",
        version: 7,
      }),
      // An author who can no longer be found reads "Unknown", never an id.
      expect.objectContaining({ id: "item-orphan", authorName: "Unknown" }),
    ]);
    expect(data.nextCursor).toBe("next-token");
    expect(data).not.toHaveProperty("total");
  });

  it("looks authors up once, in one batch, for the distinct ids on the page", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    getReviewQueuePage.mockResolvedValue(
      queuePage([
        entry({ learningItemId: "a", kind: "edit", authorUserId: "u1" }),
        entry({ learningItemId: "b", kind: "edit", authorUserId: "u1" }),
        entry({ learningItemId: "c", kind: "edit", authorUserId: "u2" }),
        entry({ learningItemId: "d" }),
      ]),
    );
    await get();
    expect(getUsersByIds).toHaveBeenCalledExactlyOnceWith(["u1", "u2"]);
  });

  it("never exposes an author's id, email, or Clerk identity", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    getReviewQueuePage.mockResolvedValue(
      queuePage([entry({ kind: "edit", authorUserId: "internal-user-id-9" })]),
    );
    getUsersByIds.mockResolvedValue([
      {
        id: "internal-user-id-9",
        displayName: "Ada",
        clerkUserId: "clerk_secret",
        username: "ada-private",
      },
    ]);
    const text = await (await get()).text();
    expect(text).toContain("Ada");
    expect(text).not.toContain("internal-user-id-9");
    expect(text).not.toContain("clerk_secret");
    expect(text).not.toContain("ada-private");
  });

  it("resolves no authors when the page has only new items", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    await get();
    // Still called (the helper batches), but with nothing to look up.
    expect(getUsersByIds).toHaveBeenCalledWith([]);
  });

  describe("what it refuses", () => {
    it.each([
      ["a missing language", {}],
      ["a non-UUID language", { language: "spanish" }],
      ["an unsupported sort", { language: LANGUAGE, sort: "label" }],
      ["a page number", { language: LANGUAGE, page: "2" }],
      ["an unknown filter", { language: LANGUAGE, kind: "new" }],
      ["a limit above the cap", { language: LANGUAGE, limit: "101" }],
      ["a limit of zero", { language: LANGUAGE, limit: "0" }],
    ])("answers 422 for %s", async (_name, query) => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      const response = await get(query);
      expect(response.status).toBe(422);
      expect(getReviewQueuePage).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      const response = await get({
        language: "9d9d9d9d-9d9d-4d9d-9d9d-9d9d9d9d9d9d",
      });
      expect(response.status).toBe(404);
      expect(getReviewQueuePage).not.toHaveBeenCalled();
    });

    it("answers 422 for a cursor the queue rejects", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      getReviewQueuePage.mockRejectedValue(
        new AppError(
          "CURRICULUM_VALIDATION_FAILED",
          "That page link is not valid.",
        ),
      );
      expect(
        (await get({ language: LANGUAGE, cursor: "tampered" })).status,
      ).toBe(422);
    });

    it("does not reveal its parameters to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get({ sort: "x" })).status).toBe(401);
    });
  });

  it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
    requireUser.mockResolvedValue(userWithRole("admin"));
    getReviewQueuePage.mockRejectedValue(
      new Error("relation curriculum_item_drafts is locked"),
    );
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("curriculum_item_drafts");
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/v1/admin/review/publish                                          */
/* -------------------------------------------------------------------------- */

const PUBLISH_URL = `${ORIGIN}/api/v1/admin/review/publish`;
const GOOD_BODY = { itemId: ITEM, expectedVersion: 3, idempotencyKey: KEY };
const BROWSER = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

function post({
  body = GOOD_BODY as unknown,
  headers = BROWSER as Record<string, string>,
  url = PUBLISH_URL,
}: { body?: unknown; headers?: Record<string, string>; url?: string } = {}) {
  return publishReviewItem(
    new Request(url, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/v1/admin/review/publish", () => {
  beforeEach(() => {
    publishItem.mockResolvedValue(undefined);
  });

  describe("authorization — Admin only, from the database role", () => {
    it("answers 401 with no session, and publishes nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await post()).status).toBe(401);
      expect(publishItem).not.toHaveBeenCalled();
    });

    it.each(CANNOT_PUBLISH)(
      "answers 403 for %s, and publishes nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await post();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(publishItem).not.toHaveBeenCalled();
      },
    );

    // A writer may *see* the queue (GET), and still cannot publish from it.
    it("refuses a writer who can read the same queue", async () => {
      requireUser.mockResolvedValue(userWithRole("writer"));
      getReviewQueuePage.mockResolvedValue(queuePage([]));
      expect((await get()).status).toBe(200);
      expect((await post()).status).toBe(403);
      expect(publishItem).not.toHaveBeenCalled();
    });

    it("re-evaluates the role on every call", async () => {
      requireUser.mockResolvedValueOnce(userWithRole("admin"));
      expect((await post()).status).toBe(200);
      requireUser.mockResolvedValueOnce(userWithRole("writer"));
      expect((await post()).status).toBe(403);
      expect(publishItem).toHaveBeenCalledTimes(1);
    });

    it("does not reveal body validation to an unauthenticated caller", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await post({ body: { nonsense: true } })).status).toBe(401);
    });
  });

  describe("the command", () => {
    it("publishes the item as the *authenticated* user, with the client's version and key", async () => {
      requireUser.mockResolvedValue(userWithRole("admin", "admin-session-id"));
      await post();
      expect(publishItem).toHaveBeenCalledExactlyOnceWith({
        learningItemId: ITEM,
        expectedVersion: 3,
        idempotencyKey: KEY,
        actorUserId: "admin-session-id",
      });
    });

    it("never accepts an actor from the request body", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      const response = await post({
        body: { ...GOOD_BODY, actorUserId: "someone-else" },
      });
      expect(response.status).toBe(422);
      expect(publishItem).not.toHaveBeenCalled();
    });

    it("answers 200 with the item id, uncacheable", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      const response = await post();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { itemId: ITEM } });
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
    });

    it("answers a replay of the same key the same way (the service answers from its stored result)", async () => {
      requireUser.mockResolvedValue(userWithRole("admin"));
      const first = await (await post()).json();
      const second = await (await post()).json();
      expect(second).toEqual(first);
      // Both reached the service with the *same* key; de-duplication is its job.
      expect(publishItem.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
        KEY,
        KEY,
      ]);
    });
  });

  describe("CSRF — only this app's own pages may act as a signed-in Admin", () => {
    beforeEach(() => requireUser.mockResolvedValue(userWithRole("admin")));

    it.each([
      [
        "a cross-site fetch",
        {
          ...BROWSER,
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
      ],
      ["a same-site sibling", { ...BROWSER, "sec-fetch-site": "same-site" }],
      [
        "a wrong Origin alone",
        { "content-type": "application/json", origin: "https://evil.example" },
      ],
      [
        "Origin: null (sandboxed frame)",
        { "content-type": "application/json", origin: "null" },
      ],
      ["a request with neither header", { "content-type": "application/json" }],
    ])(
      "answers 403 for %s, before authenticating or publishing",
      async (_name, headers) => {
        const response = await post({ headers });
        expect(response.status).toBe(403);
        expect(publishItem).not.toHaveBeenCalled();
        // It was refused before the session was even looked at.
        expect(requireUser).not.toHaveBeenCalled();
      },
    );

    it("accepts a same-origin request that sends only Origin", async () => {
      const response = await post({
        headers: { "content-type": "application/json", origin: ORIGIN },
      });
      expect(response.status).toBe(200);
    });

    it("accepts a same-origin request that sends only Sec-Fetch-Site", async () => {
      const response = await post({
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
      });
      expect(response.status).toBe(200);
    });

    it.each([
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "text/plain",
    ])(
      "answers 415 for a %s body (what a cross-site <form> can send)",
      async (type) => {
        const response = await post({
          headers: { ...BROWSER, "content-type": type },
        });
        expect(response.status).toBe(415);
        expect(publishItem).not.toHaveBeenCalled();
      },
    );

    it("accepts application/json with a charset parameter", async () => {
      const response = await post({
        headers: {
          ...BROWSER,
          "content-type": "application/json; charset=utf-8",
        },
      });
      expect(response.status).toBe(200);
    });

    it("answers 422 when the command arrives in the query string", async () => {
      const response = await post({
        url: `${PUBLISH_URL}?itemId=${ITEM}&expectedVersion=3&idempotencyKey=${KEY}`,
      });
      expect(response.status).toBe(422);
      expect(publishItem).not.toHaveBeenCalled();
    });
  });

  describe("body validation", () => {
    beforeEach(() => requireUser.mockResolvedValue(userWithRole("admin")));

    it.each([
      ["invalid JSON", "{not json"],
      ["an empty body", ""],
      ["an array", "[]"],
      ["null", "null"],
      ["a missing item id", { expectedVersion: 3, idempotencyKey: KEY }],
      ["a missing version", { itemId: ITEM, idempotencyKey: KEY }],
      ["a missing key", { itemId: ITEM, expectedVersion: 3 }],
      ["a non-UUID item id", { ...GOOD_BODY, itemId: "1; drop table" }],
      [
        "a non-UUID idempotency key",
        { ...GOOD_BODY, idempotencyKey: "retry-1" },
      ],
      ["a version of zero", { ...GOOD_BODY, expectedVersion: 0 }],
      ["a negative version", { ...GOOD_BODY, expectedVersion: -1 }],
      ["a fractional version", { ...GOOD_BODY, expectedVersion: 1.5 }],
      ["a string version", { ...GOOD_BODY, expectedVersion: "3" }],
      ["an unknown field", { ...GOOD_BODY, publishAll: true }],
    ])("answers 422 for %s, publishing nothing", async (_name, body) => {
      const response = await post({ body });
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(publishItem).not.toHaveBeenCalled();
    });

    it("answers 413 for an oversized body, without parsing it", async () => {
      const response = await post({
        body: JSON.stringify({ ...GOOD_BODY, padding: "x".repeat(10_000) }),
      });
      expect(response.status).toBe(413);
      expect(publishItem).not.toHaveBeenCalled();
    });
  });

  describe("what the publish service says", () => {
    beforeEach(() => requireUser.mockResolvedValue(userWithRole("admin")));

    it("answers 409 with the service's own words when the version is stale", async () => {
      publishItem.mockRejectedValue(new AdminError("ADMIN_EDIT_CONFLICT"));
      const response = await post();
      expect(response.status).toBe(409);
      const { error } = await response.json();
      expect(error.code).toBe("CONFLICT");
      expect(error.message).toContain("changed after you opened it");
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
      publishItem.mockRejectedValue(failure);
      expect((await post()).status).toBe(409);
    });

    it("answers 404 when the item no longer exists", async () => {
      publishItem.mockRejectedValue(
        new AdminError("CURRICULUM_ITEM_NOT_FOUND"),
      );
      expect((await post()).status).toBe(404);
    });

    it.each([
      "Archived items cannot be published.",
      "There are no unpublished changes to publish.",
    ])("answers 422 with the reason: %s", async (message) => {
      publishItem.mockRejectedValue(
        new AdminError("CURRICULUM_VALIDATION_FAILED", message),
      );
      const response = await post();
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(message);
    });

    it("answers 429 with a real Retry-After header when rate limited", async () => {
      publishItem.mockRejectedValue(
        new AdminError(
          "RATE_LIMITED",
          "Please slow down and try again in 17s.",
          {
            retryAfterSeconds: 17,
          },
        ),
      );
      const response = await post();
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("17");
      expect((await response.json()).error.code).toBe("RATE_LIMITED");
    });

    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      publishItem.mockRejectedValue(
        new Error("deadlock detected on learning_items"),
      );
      const response = await post();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("learning_items");
    });
  });

  it("is a POST-only endpoint", async () => {
    const route = await import("./review/publish/route");
    expect(Object.keys(route).sort()).toEqual(["POST"]);
  });
});

describe("the review endpoints and the role matrix", () => {
  it.each(ADMIN_AREA_ROLES)(
    "%s: read access follows canManageCurriculum, publish follows canPublishCurriculum",
    async (role) => {
      requireUser.mockResolvedValue(userWithRole(role));
      getReviewQueuePage.mockResolvedValue(queuePage([]));
      publishItem.mockResolvedValue(undefined);

      const read = (await get()).status;
      requireUser.mockResolvedValue(userWithRole(role));
      const write = (await post()).status;

      expect({ read, write }).toEqual(
        {
          admin: { read: 200, write: 200 },
          writer: { read: 200, write: 403 },
          developer: { read: 403, write: 403 },
        }[role],
      );
    },
  );
});
