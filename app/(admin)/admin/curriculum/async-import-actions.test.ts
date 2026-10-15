import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_ROLES, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";

const requireUser = vi.hoisted(() => vi.fn());
const services = vi.hoisted(() => ({
  confirmCurriculumImport: vi.fn(),
  createCurriculumImportUpload: vi.fn(),
  getCurriculumImportStatus: vi.fn(),
  listCurriculumImportRowsForReview: vi.fn(),
  publishImportedDraftChanges: vi.fn(),
  resolveCurriculumImportRow: vi.fn(),
  reviseCurriculumImportRow: vi.fn(),
  retryCurriculumImport: vi.fn(),
}));

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/admin/server", () => services);

import * as actions from "./async-import-actions";

const IMPORT = "60000000-0000-4000-8000-000000000001";
const ROW = "70000000-0000-4000-8000-000000000002";
const KEY = "0881836c-de9a-4dc5-84f7-1dd28b8fa439";

function signedInAs(role: UserRole, id = `user-${role}`) {
  requireUser.mockResolvedValue({ id, role });
}

beforeEach(() => {
  requireUser.mockReset();
  for (const service of Object.values(services)) {
    service.mockReset();
    service.mockResolvedValue(undefined);
  }
  services.getCurriculumImportStatus.mockResolvedValue({ id: IMPORT });
  services.listCurriculumImportRowsForReview.mockResolvedValue({
    items: [],
    nextCursor: null,
  });
  services.confirmCurriculumImport.mockResolvedValue({
    confirmedPreviewVersion: 1,
  });
  services.createCurriculumImportUpload.mockResolvedValue({
    importId: IMPORT,
    uploadUrl: "https://example.invalid/upload",
  });
  services.publishImportedDraftChanges.mockResolvedValue({
    publishedItemIds: [],
    skippedItemIds: [],
  });
});

/**
 * Every action that works on one import — watching it, reviewing and correcting
 * its rows, confirming, retrying, publishing what it drafted — stays a Server
 * Action: those are the specialist screens, and spec 26 Unit 8 leaves them
 * alone. They are also the only thing standing between a writer and an import
 * (there is no HTTP route for them), so each one is held to the same rule:
 * **Admin only, from the session, on every call** (spec 26 §6: imports are not a
 * writer's). Hiding a button from someone is a convenience; this is the control.
 */
const CALLS: {
  name: string;
  run: () => Promise<{ ok: boolean }>;
  service: keyof typeof services;
}[] = [
  {
    name: "createAsyncCurriculumImportAction",
    run: () =>
      actions.createAsyncCurriculumImportAction({
        languageId: "lang-1",
        originalFilename: "level-2.csv",
        fileExtension: "csv",
      }),
    service: "createCurriculumImportUpload",
  },
  {
    name: "getCurriculumImportStatusAction",
    run: () => actions.getCurriculumImportStatusAction({ importId: IMPORT }),
    service: "getCurriculumImportStatus",
  },
  {
    name: "listCurriculumImportRowsAction",
    run: () => actions.listCurriculumImportRowsAction({ importId: IMPORT }),
    service: "listCurriculumImportRowsForReview",
  },
  {
    name: "resolveCurriculumImportRowAction",
    run: () =>
      actions.resolveCurriculumImportRowAction({
        rowId: ROW,
        disposition: "skip",
      }),
    service: "resolveCurriculumImportRow",
  },
  {
    name: "reviseCurriculumImportRowAction",
    run: () =>
      actions.reviseCurriculumImportRowAction({
        rowId: ROW,
        corrections: { word: "comer" },
      }),
    service: "reviseCurriculumImportRow",
  },
  {
    name: "confirmAsyncCurriculumImportAction",
    run: () => actions.confirmAsyncCurriculumImportAction({ importId: IMPORT }),
    service: "confirmCurriculumImport",
  },
  {
    name: "publishImportedDraftChangesAction",
    run: () =>
      actions.publishImportedDraftChangesAction({
        importId: IMPORT,
        idempotencyKey: KEY,
      }),
    service: "publishImportedDraftChanges",
  },
  {
    name: "retryAsyncCurriculumImportAction",
    run: () => actions.retryAsyncCurriculumImportAction({ importId: IMPORT }),
    service: "retryCurriculumImport",
  },
];

describe.each(CALLS)("$name — who may use it", (call) => {
  it("lets an Admin", async () => {
    signedInAs("admin");
    await expect(call.run()).resolves.toMatchObject({ ok: true });
    expect(services[call.service]).toHaveBeenCalledOnce();
  });

  // Not just learners: a writer works in the console, and a developer is
  // admitted to the admin area — neither may touch an import.
  it.each(USER_ROLES.filter((role) => role !== "admin"))(
    "refuses a %s, and never reaches the service",
    async (role) => {
      signedInAs(role);
      await expect(call.run()).resolves.toEqual({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "You don't have access to do that.",
        },
      });
      expect(services[call.service]).not.toHaveBeenCalled();
    },
  );

  it("refuses a visitor with no session", async () => {
    requireUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const result = await call.run();
    expect(result.ok).toBe(false);
    expect(services[call.service]).not.toHaveBeenCalled();
  });
});

describe("confirming an import is an Admin's alone (spec 26 §6)", () => {
  it("refuses a writer — the confirmation is what applies the import to the curriculum", async () => {
    signedInAs("writer");

    const result = await actions.confirmAsyncCurriculumImportAction({
      importId: IMPORT,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.confirmCurriculumImport).not.toHaveBeenCalled();
  });

  it("confirms as the signed-in Admin, for the import named", async () => {
    signedInAs("admin", "the-admin");

    await actions.confirmAsyncCurriculumImportAction({ importId: IMPORT });

    expect(services.confirmCurriculumImport).toHaveBeenCalledExactlyOnceWith({
      importId: IMPORT,
      actorUserId: "the-admin",
    });
  });

  it("publishing what an import drafted is a separate, explicit command — confirming does not publish", async () => {
    signedInAs("admin");

    await actions.confirmAsyncCurriculumImportAction({ importId: IMPORT });

    expect(services.publishImportedDraftChanges).not.toHaveBeenCalled();
  });

  it("publishes the drafted changes only when asked, with the key it was given, as the Admin", async () => {
    signedInAs("admin", "the-admin");

    await actions.publishImportedDraftChangesAction({
      importId: IMPORT,
      idempotencyKey: KEY,
    });

    expect(
      services.publishImportedDraftChanges,
    ).toHaveBeenCalledExactlyOnceWith({
      importId: IMPORT,
      idempotencyKey: KEY,
      actorUserId: "the-admin",
    });
  });
});

describe("the actions take who is asking from the session, never from the request", () => {
  it("ignores an actor in the input", async () => {
    signedInAs("admin", "the-admin");

    await actions.retryAsyncCurriculumImportAction({
      importId: IMPORT,
      actorUserId: "someone-else",
    } as never);

    expect(services.retryCurriculumImport).toHaveBeenCalledExactlyOnceWith({
      importId: IMPORT,
      actorUserId: "the-admin",
    });
  });
});

describe("input is validated at the boundary", () => {
  it.each([
    [
      "an import id that is not a UUID",
      () => actions.confirmAsyncCurriculumImportAction({ importId: "nope" }),
    ],
    [
      "a row id that is not a UUID",
      () =>
        actions.resolveCurriculumImportRowAction({
          rowId: "nope",
          disposition: "skip",
        }),
    ],
    [
      "a disposition that does not exist",
      () =>
        actions.resolveCurriculumImportRowAction({
          rowId: ROW,
          disposition: "delete" as never,
        }),
    ],
    [
      "a file that is not csv or tsv",
      () =>
        actions.createAsyncCurriculumImportAction({
          languageId: "lang-1",
          originalFilename: "level-2.xlsx",
          fileExtension: "xlsx" as never,
        }),
    ],
    [
      "an empty file name",
      () =>
        actions.createAsyncCurriculumImportAction({
          languageId: "lang-1",
          originalFilename: "   ",
          fileExtension: "csv",
        }),
    ],
    [
      "a correction to a column that does not exist",
      () =>
        actions.reviseCurriculumImportRowAction({
          rowId: ROW,
          corrections: { not_a_column: "x" } as never,
        }),
    ],
    [
      "an empty idempotency key",
      () =>
        actions.publishImportedDraftChangesAction({
          importId: IMPORT,
          idempotencyKey: "",
        }),
    ],
  ])("refuses %s, in words, reaching nothing", async (_name, run) => {
    signedInAs("admin");

    await expect(run()).resolves.toEqual({
      ok: false,
      error: {
        code: "CURRICULUM_VALIDATION_FAILED",
        message: "That request could not be understood.",
      },
    });
    for (const service of Object.values(services)) {
      expect(service).not.toHaveBeenCalled();
    }
  });
});

describe("what the services say reaches the screen as words", () => {
  it("passes a domain refusal on with its code and message", async () => {
    signedInAs("admin");
    services.retryCurriculumImport.mockRejectedValue(
      new AdminError(
        "CURRICULUM_VALIDATION_FAILED",
        "Only a failed import can be retried.",
      ),
    );

    await expect(
      actions.retryAsyncCurriculumImportAction({ importId: IMPORT }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "CURRICULUM_VALIDATION_FAILED",
        message: "Only a failed import can be retried.",
      },
    });
  });

  it("answers an unexpected failure with a safe message, and logs it", async () => {
    signedInAs("admin");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    services.confirmCurriculumImport.mockRejectedValue(
      new Error("SQS: queue url arn:aws:sqs:private"),
    );

    const result = await actions.confirmAsyncCurriculumImportAction({
      importId: IMPORT,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("arn:aws");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("the import history is not a Server Action any more (spec 26 Unit 8)", () => {
  it("exports only the actions that work on one import — the history is the React Admin list's", () => {
    expect(Object.keys(actions).sort()).toEqual(
      [
        "confirmAsyncCurriculumImportAction",
        "createAsyncCurriculumImportAction",
        "getCurriculumImportStatusAction",
        "listCurriculumImportRowsAction",
        "publishImportedDraftChangesAction",
        "resolveCurriculumImportRowAction",
        "retryAsyncCurriculumImportAction",
        "reviseCurriculumImportRowAction",
      ].sort(),
    );
    for (const gone of [
      "listCurriculumImportsAction",
      "listArchivedCurriculumImportsAction",
      "archiveCurriculumImportAction",
      "unarchiveCurriculumImportAction",
      "permanentlyDeleteCurriculumImportAction",
    ]) {
      expect(actions, gone).not.toHaveProperty(gone);
    }
  });
});
