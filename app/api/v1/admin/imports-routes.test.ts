import { beforeEach, describe, expect, it, vi } from "vitest";

import { IMPORT_LIST_PAGE_SIZE } from "@/domains/admin";
import type { CurriculumImportRecord } from "@/domains/admin/curriculum-import-types";
import { USER_ROLES, type PolyglotUser, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const getLanguages = vi.hoisted(() => vi.fn());
const listActiveCurriculumImports = vi.hoisted(() => vi.fn());
const listArchivedCurriculumImportsForHistory = vi.hoisted(() => vi.fn());
const archiveCurriculumImport = vi.hoisted(() => vi.fn());
const unarchiveCurriculumImport = vi.hoisted(() => vi.fn());
const permanentlyDeleteCurriculumImport = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/curriculum/server", () => ({ getLanguages }));
vi.mock("@/domains/admin/server", () => ({
  listActiveCurriculumImports,
  listArchivedCurriculumImportsForHistory,
  archiveCurriculumImport,
  unarchiveCurriculumImport,
  permanentlyDeleteCurriculumImport,
}));

import { GET as getImports } from "./imports/route";
import { POST as postArchive } from "./imports/[importId]/archive/route";
import { POST as postDelete } from "./imports/[importId]/delete/route";
import { POST as postRestore } from "./imports/[importId]/restore/route";

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const LANGUAGE = "5b2eb57d-acb8-4964-8af4-49a417cf227a";
const IMPORT = "60000000-0000-4000-8000-000000000001";
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

/**
 * Who may read the history, and who may act on it: an Admin, and nobody else — a
 * writer included. (A writer could read the history until the owner's decision of
 * 2026-10-14 made imports an Admin's end to end.)
 */
const NOT_ADMIN = USER_ROLES.filter((role) => role !== "admin");

const BROWSER = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

function record(
  overrides: Partial<CurriculumImportRecord> = {},
): CurriculumImportRecord {
  return {
    id: IMPORT,
    environment: "development",
    languageId: LANGUAGE,
    originalFilename: "spanish-level-2.csv",
    fileExtension: "csv",
    s3Bucket: "polyglot-private-bucket",
    s3Key: "imports/private-key/source.csv",
    sourceSha256: "deadbeef".repeat(8),
    uploadedByUserId: "00000000-0000-4000-8000-0000000000bb",
    status: "completed",
    totalRows: 61,
    createCount: 43,
    updateCount: 8,
    moveCount: 2,
    unchangedCount: 6,
    reviewCount: 0,
    skippedCount: 0,
    previewVersion: 1,
    confirmedPreviewVersion: 1,
    draftedItemIds: null,
    attemptCount: 1,
    lastErrorCode: null,
    lastErrorSummary: null,
    sourceImportId: null,
    uploadedAt: null,
    previewStartedAt: null,
    previewCompletedAt: null,
    confirmedAt: null,
    importStartedAt: null,
    completedAt: null,
    archivedAt: null,
    archivedByUserId: null,
    createdAt: new Date("2026-09-10T11:59:00.123Z"),
    updatedAt: new Date("2026-09-10T12:05:00.000Z"),
    ...overrides,
  };
}

const page = (items: CurriculumImportRecord[] = [record()]) => ({
  items,
  nextCursor: null,
  hasPreviousPage: false,
  previousCursor: null,
});

beforeEach(() => {
  for (const mock of [
    requireUser,
    getLanguages,
    listActiveCurriculumImports,
    listArchivedCurriculumImportsForHistory,
    archiveCurriculumImport,
    unarchiveCurriculumImport,
    permanentlyDeleteCurriculumImport,
  ]) {
    mock.mockReset();
  }
  requireUser.mockResolvedValue(userWithRole("admin", ADMIN_ID));
  getLanguages.mockResolvedValue([{ id: LANGUAGE, name: "Spanish" }]);
  listActiveCurriculumImports.mockResolvedValue(page());
  listArchivedCurriculumImportsForHistory.mockResolvedValue(page());
  archiveCurriculumImport.mockResolvedValue(undefined);
  unarchiveCurriculumImport.mockResolvedValue(undefined);
  permanentlyDeleteCurriculumImport.mockResolvedValue(undefined);
});

/* -------------------------------------------------------------------------- */
/* GET /api/v1/admin/imports                                                  */
/* -------------------------------------------------------------------------- */

const get = (query: Record<string, string> = { language: LANGUAGE }) =>
  getImports(
    new Request(
      `${ORIGIN}/api/v1/admin/imports${
        Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""
      }`,
      { method: "GET" },
    ),
  );

describe("GET /api/v1/admin/imports", () => {
  describe("authorization — an Admin's alone, from the database role", () => {
    it("answers 401 with no session, and reads nothing", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get()).status).toBe(401);
      expect(listActiveCurriculumImports).not.toHaveBeenCalled();
    });

    it.each(NOT_ADMIN)(
      "answers 403 for %s, and reads nothing",
      async (role) => {
        requireUser.mockResolvedValue(userWithRole(role));
        const response = await get();
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(listActiveCurriculumImports).not.toHaveBeenCalled();
        expect(listArchivedCurriculumImportsForHistory).not.toHaveBeenCalled();
      },
    );

    it("answers 200 for an Admin", async () => {
      expect((await get()).status).toBe(200);
    });

    it("re-evaluates the role on every call, so a demoted Admin is refused at once", async () => {
      expect((await get()).status).toBe(200);
      requireUser.mockResolvedValue(userWithRole("writer"));
      expect((await get()).status).toBe(403);
      expect(listActiveCurriculumImports).toHaveBeenCalledOnce();
    });

    it("does not reveal its parameters to someone who may not read", async () => {
      requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
      expect((await get({ sort: "x" })).status).toBe(401);
      requireUser.mockResolvedValue(userWithRole("developer"));
      expect((await get({ sort: "x" })).status).toBe(403);
    });
  });

  describe("the query", () => {
    it("reads the first page of the normal history at the default size", async () => {
      await get();
      expect(listActiveCurriculumImports).toHaveBeenCalledExactlyOnceWith({
        languageId: LANGUAGE,
        cursor: undefined,
        limit: IMPORT_LIST_PAGE_SIZE,
      });
      expect(listArchivedCurriculumImportsForHistory).not.toHaveBeenCalled();
    });

    it("reads the archived history only when asked for it", async () => {
      await get({ language: LANGUAGE, archived: "true" });
      expect(
        listArchivedCurriculumImportsForHistory,
      ).toHaveBeenCalledExactlyOnceWith({
        languageId: LANGUAGE,
        cursor: undefined,
        limit: IMPORT_LIST_PAGE_SIZE,
      });
      expect(listActiveCurriculumImports).not.toHaveBeenCalled();
    });

    it("treats `archived=false` as the normal history", async () => {
      await get({ language: LANGUAGE, archived: "false" });
      expect(listActiveCurriculumImports).toHaveBeenCalledOnce();
      expect(listArchivedCurriculumImportsForHistory).not.toHaveBeenCalled();
    });

    it("hands the cursor and the size to the service untouched", async () => {
      await get({ language: LANGUAGE, cursor: "opaque-cursor", limit: "50" });
      expect(listActiveCurriculumImports).toHaveBeenCalledExactlyOnceWith({
        languageId: LANGUAGE,
        cursor: "opaque-cursor",
        limit: 50,
      });
    });

    it.each([
      ["no language", {}],
      ["a language that is not an id", { language: "es" }],
      [
        "a status filter, which nothing here honours",
        { language: LANGUAGE, status: "failed" },
      ],
      ["a sort", { language: LANGUAGE, sort: "status" }],
      ["a page number", { language: LANGUAGE, page: "2" }],
      [
        "`archived` as anything but true or false",
        { language: LANGUAGE, archived: "1" },
      ],
      ["a size over the cap", { language: LANGUAGE, limit: "101" }],
      ["a size of zero", { language: LANGUAGE, limit: "0" }],
    ])("answers 422 for %s", async (_name, query) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(listActiveCurriculumImports).not.toHaveBeenCalled();
    });

    it("answers 404 for a language that does not exist, reading nothing", async () => {
      const response = await get({
        language: "00000000-0000-4000-8000-0000000000ff",
      });
      expect(response.status).toBe(404);
      expect(listActiveCurriculumImports).not.toHaveBeenCalled();
    });

    it("answers 422, in the service's words, for a cursor that is not one of ours", async () => {
      listActiveCurriculumImports.mockRejectedValue(
        new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "That page link is not valid. Go back to the first page.",
        ),
      );
      const response = await get({ language: LANGUAGE, cursor: "garbage" });
      expect(response.status).toBe(422);
      expect((await response.json()).error.message).toBe(
        "That page link is not valid. Go back to the first page.",
      );
    });
  });

  describe("the answer", () => {
    it("is the page, as the contract describes it, uncacheable", async () => {
      listActiveCurriculumImports.mockResolvedValue({
        items: [record()],
        nextCursor: "next",
        hasPreviousPage: true,
        previousCursor: "previous",
      });
      const response = await get();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({
        data: {
          items: [
            {
              id: IMPORT,
              originalFilename: "spanish-level-2.csv",
              status: "completed",
              totalRows: 61,
              createCount: 43,
              updateCount: 8,
              moveCount: 2,
              unchangedCount: 6,
              reviewCount: 0,
              skippedCount: 0,
              attemptCount: 1,
              createdAt: "2026-09-10T11:59:00.123Z",
              archivedAt: null,
            },
          ],
          nextCursor: "next",
          hasPreviousPage: true,
          previousCursor: "previous",
        },
      });
    });

    it("never carries a storage location, checksum, uploader, language id or error text", async () => {
      listActiveCurriculumImports.mockResolvedValue(
        page([
          record({
            status: "failed",
            lastErrorCode: "S3_READ_FAILED",
            lastErrorSummary: "private failure detail",
          }),
        ]),
      );
      const text = await (await get()).text();
      for (const secret of [
        "polyglot-private-bucket",
        "private-key",
        "deadbeef",
        "S3_READ_FAILED",
        "private failure detail",
        "00000000-0000-4000-8000-0000000000bb",
        "clerk_must_never_appear",
        "Private Name",
      ]) {
        expect(text, secret).not.toContain(secret);
      }
    });

    it("is a generic 500 — not a 422 that blames the caller — when the service's page breaks the contract", async () => {
      listActiveCurriculumImports.mockResolvedValue(
        page([record({ status: "teleporting" as never })]),
      );
      const response = await get();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("teleporting");
    });

    it("answers a generic 500 for an unexpected failure, leaking nothing", async () => {
      listActiveCurriculumImports.mockRejectedValue(
        new Error("connection reset by curriculum_imports_pkey"),
      );
      const response = await get();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("curriculum_imports_pkey");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/v1/admin/imports/[importId]/{archive,restore,delete}             */
/* -------------------------------------------------------------------------- */

const COMMANDS = [
  {
    name: "archive",
    post: postArchive,
    service: archiveCurriculumImport,
    body: {} as Record<string, unknown>,
    // What, besides the right body, would be refused.
    notTheBody: [
      ["an import in the body", { importId: IMPORT }],
      ["a state in the body", { archived: true }],
    ] as [string, Record<string, unknown>][],
  },
  {
    name: "restore",
    post: postRestore,
    service: unarchiveCurriculumImport,
    body: {} as Record<string, unknown>,
    notTheBody: [
      ["an import in the body", { importId: IMPORT }],
      ["a state in the body", { archived: false }],
    ] as [string, Record<string, unknown>][],
  },
  {
    name: "delete",
    post: postDelete,
    service: permanentlyDeleteCurriculumImport,
    body: { confirmation: "DELETE" } as Record<string, unknown>,
    notTheBody: [
      ["no confirmation", {}],
      ["a confirmation in the wrong case", { confirmation: "delete" }],
      ["a confirmation with a space", { confirmation: "DELETE " }],
      ["a confirmation that is not the word", { confirmation: "yes" }],
      ["a confirmation that is not text", { confirmation: true }],
      ["an import in the body", { confirmation: "DELETE", importId: IMPORT }],
    ] as [string, Record<string, unknown>][],
  },
] as const;

function send(
  command: (typeof COMMANDS)[number],
  {
    importId = IMPORT,
    body = command.body as unknown,
    headers = BROWSER as Record<string, string>,
    query = "",
  }: {
    importId?: string;
    body?: unknown;
    headers?: Record<string, string>;
    query?: string;
  } = {},
) {
  return command.post(
    new Request(
      `${ORIGIN}/api/v1/admin/imports/${importId}/${command.name}${query}`,
      {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ importId }) },
  );
}

describe.each(COMMANDS)(
  "POST /api/v1/admin/imports/[importId]/$name",
  (command) => {
    const go = (options?: Parameters<typeof send>[1]) => send(command, options);

    describe("authorization — Admin only, from the database role", () => {
      it("answers 401 with no session, and does nothing", async () => {
        requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
        expect((await go()).status).toBe(401);
        expect(command.service).not.toHaveBeenCalled();
      });

      it.each(NOT_ADMIN)(
        "answers 403 for %s, and does nothing",
        async (role) => {
          requireUser.mockResolvedValue(userWithRole(role));
          const response = await go();
          expect(response.status).toBe(403);
          expect((await response.json()).error.code).toBe("FORBIDDEN");
          expect(command.service).not.toHaveBeenCalled();
        },
      );

      it("answers 200 for an Admin", async () => {
        expect((await go()).status).toBe(200);
      });

      it("re-evaluates the role on every call, so a demoted Admin is refused at once", async () => {
        expect((await go()).status).toBe(200);
        requireUser.mockResolvedValue(userWithRole("writer"));
        expect((await go()).status).toBe(403);
        expect(command.service).toHaveBeenCalledOnce();
      });

      it("does not reveal body or path validation to someone who may not act", async () => {
        requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));
        expect((await go({ body: { nonsense: true } })).status).toBe(401);
        expect((await go({ importId: "not-an-id" })).status).toBe(401);
        requireUser.mockResolvedValue(userWithRole("writer"));
        expect((await go({ body: { nonsense: true } })).status).toBe(403);
        expect((await go({ importId: "not-an-id" })).status).toBe(403);
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
        [
          "a request with neither header",
          { "content-type": "application/json" },
        ],
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
        const response = await go({ query: "?confirmation=DELETE" });
        expect(response.status).toBe(422);
        expect(command.service).not.toHaveBeenCalled();
      });
    });

    describe("the command", () => {
      it("acts on the import named in the path, as the *authenticated* Admin", async () => {
        const response = await go();
        expect(response.status).toBe(200);
        expect(command.service).toHaveBeenCalledExactlyOnceWith({
          importId: IMPORT,
          actorUserId: ADMIN_ID,
        });
      });

      it("takes the actor from the session, whoever the body claims to be", async () => {
        requireUser.mockResolvedValue(userWithRole("admin", "another-admin"));
        await go();
        expect(command.service.mock.calls[0]![0].actorUserId).toBe(
          "another-admin",
        );
        const claimed = await go({
          body: { ...command.body, actorUserId: "someone-else" },
        });
        expect(claimed.status).toBe(422);
      });

      it("answers the import it acted on, uncacheable — and nothing the service might return", async () => {
        command.service.mockResolvedValue({
          importId: "ignored",
          s3Key: "imports/private-key/source.csv",
        });
        const response = await go();
        const text = await response.text();
        expect(response.status).toBe(200);
        expect(JSON.parse(text)).toEqual({ data: { importId: IMPORT } });
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(text).not.toContain("private-key");
      });
    });

    describe("body and path validation", () => {
      it.each([
        ["invalid JSON", "{not json"],
        ["an empty body", ""],
        ["a list", [command.body]],
        ["a Clerk id", { ...command.body, clerkUserId: "user_123" }],
        ["a role", { ...command.body, role: "admin" }],
        [
          "an idempotency key, which this command has no use for",
          {
            ...command.body,
            idempotencyKey: "0881836c-de9a-4dc5-84f7-1dd28b8fa439",
          },
        ],
        ...command.notTheBody,
      ])("answers 422 for %s, doing nothing", async (_name, body) => {
        const response = await go({ body });
        expect(response.status).toBe(422);
        expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
        expect(command.service).not.toHaveBeenCalled();
      });

      it.each(["not-an-id", "1", "../admin", " "])(
        "answers 422 for %j where the import's id should be",
        async (importId) => {
          const response = await go({ importId });
          expect(response.status).toBe(422);
          expect(command.service).not.toHaveBeenCalled();
        },
      );

      it("answers 413 for an oversized body, without parsing it", async () => {
        const response = await go({
          body: JSON.stringify({
            ...command.body,
            padding: "x".repeat(10_000),
          }),
        });
        expect(response.status).toBe(413);
        expect(command.service).not.toHaveBeenCalled();
      });
    });

    describe("what the service says — each refusal in its own words", () => {
      it("answers 404 for an import that no longer exists", async () => {
        command.service.mockRejectedValue(
          new AdminError(
            "CURRICULUM_ITEM_NOT_FOUND",
            "This import no longer exists.",
          ),
        );
        const response = await go();
        expect(response.status).toBe(404);
        expect((await response.json()).error).toEqual({
          code: "NOT_FOUND",
          message: "This import no longer exists.",
        });
      });

      it("answers 422, in the service's words, for an import that cannot be deleted yet", async () => {
        command.service.mockRejectedValue(
          new AdminError(
            "CURRICULUM_VALIDATION_FAILED",
            "Only an archived import can be permanently deleted.",
          ),
        );
        const response = await go();
        expect(response.status).toBe(422);
        expect((await response.json()).error).toEqual({
          code: "VALIDATION_FAILED",
          message: "Only an archived import can be permanently deleted.",
        });
      });

      it("answers 403 for an Admin who was demoted after the route checked", async () => {
        command.service.mockRejectedValue(new AppError("FORBIDDEN"));
        expect((await go()).status).toBe(403);
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
          new Error("relation curriculum_import_rows locked"),
        );
        const response = await go();
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain("curriculum_import_rows");
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
  },
);
