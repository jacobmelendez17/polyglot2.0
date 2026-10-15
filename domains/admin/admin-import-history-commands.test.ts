import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/errors/admin-errors";

/**
 * Spec 26 Unit 8 — how `admin-mutation-service.ts` binds the three import-history
 * commands (archive, restore, permanently delete) to the app database, the
 * write allowance and storage. What each command *does* is proven against a
 * real database elsewhere (`curriculum-import-service.integration.test.ts`,
 * `curriculum-import-history.integration.test.ts`); what only this layer decides
 * is three things a faster test would otherwise never see:
 *
 *  - the command runs **inside a transaction**, and the domain function is
 *    handed that transaction. Each command begins by locking the import's row so
 *    that two requests for one import take turns; a row lock lasts only as long
 *    as the transaction, so a command run on the pool itself takes no lock at
 *    all, and two requests sent together would both act and both write the
 *    audit event;
 *  - the allowance is spent first, and a refusal stops everything;
 *  - deleting the source file is best effort **in full** — it happens only after
 *    the history is gone, and nothing about it (the storage failing, or the
 *    storage not being configured) may fail a command whose work is done.
 */

const mocks = vi.hoisted(() => {
  const events: string[] = [];
  const tx = { name: "the transaction" };
  return {
    events,
    tx,
    db: {
      name: "the app database",
      transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
        events.push("begin");
        try {
          const result = await work(tx);
          events.push("commit");
          return result;
        } catch (error) {
          events.push("rollback");
          throw error;
        }
      }),
    },
    check: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    remove: vi.fn(),
    getById: vi.fn(),
    deleteObject: vi.fn(),
    storage: vi.fn(),
  };
});

vi.mock("@/db/client", () => ({ db: mocks.db }));
vi.mock("@/providers/rate-limit", () => ({
  getRateLimiter: () => ({ check: mocks.check }),
}));
vi.mock("@/providers/storage", () => ({
  getCurriculumImportStorage: mocks.storage,
  curriculumImportObjectKey: vi.fn(),
}));
vi.mock("./curriculum-import-service", () => ({
  archiveCurriculumImport: mocks.archive,
  unarchiveCurriculumImport: mocks.unarchive,
  permanentlyDeleteCurriculumImport: mocks.remove,
}));
vi.mock("./curriculum-import-repository", () => ({
  getCurriculumImportById: mocks.getById,
  listCurriculumImports: vi.fn(),
  listArchivedCurriculumImports: vi.fn(),
  listCurriculumImportRows: vi.fn(),
}));
// Imported by the file under test, never called here: replaced, so loading it
// needs no database, queue or environment.
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/providers/queue", () => ({}));
vi.mock("@/domains/users/admin-user-repository", () => ({}));
vi.mock("./user-role-service", () => ({}));
vi.mock("./publication-service", () => ({}));
vi.mock("./bulk-import-service", () => ({}));
vi.mock("./account-reset-service", () => ({}));

import {
  archiveCurriculumImport,
  permanentlyDeleteCurriculumImport,
  unarchiveCurriculumImport,
} from "./admin-mutation-service";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const IMPORT = "22222222-2222-4222-8222-222222222222";
const input = { importId: IMPORT, actorUserId: ACTOR };
const KEY = "e2e-fixtures/source.csv";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.check.mockImplementation(async () => {
    mocks.events.push("allowance");
    return { allowed: true };
  });
  for (const command of [mocks.archive, mocks.unarchive, mocks.remove]) {
    command.mockImplementation(async () => {
      mocks.events.push("command");
    });
  }
  mocks.getById.mockImplementation(async () => {
    mocks.events.push("read");
    return { id: IMPORT, s3Key: KEY };
  });
  mocks.storage.mockReturnValue({ deleteObject: mocks.deleteObject });
  mocks.deleteObject.mockImplementation(async () => {
    mocks.events.push("delete-file");
  });
});

const refused = (retryAfterSeconds: number) => ({
  allowed: false,
  retryAfterSeconds,
});

describe.each([
  ["archiveCurriculumImport", archiveCurriculumImport, mocks.archive],
  ["unarchiveCurriculumImport", unarchiveCurriculumImport, mocks.unarchive],
])("%s", (_name, run, command) => {
  it("spends the write allowance of the person asking, then runs the command in a transaction — handing it the transaction, not the pool", async () => {
    command.mockResolvedValue("done");

    await expect(run(input)).resolves.toBe("done");

    expect(mocks.check).toHaveBeenCalledExactlyOnceWith({
      policy: "admin-mutation",
      subject: ACTOR,
    });
    expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
    // The transaction — a command run on `mocks.db` would take no row lock.
    expect(command).toHaveBeenCalledExactlyOnceWith(mocks.tx, input);
    expect(mocks.events).toEqual(["allowance", "begin", "commit"]);
  });

  it("opens no transaction and does nothing once the allowance is spent, and says when to try again", async () => {
    mocks.check.mockResolvedValue(refused(9));

    const failure = await run(input).catch((error) => error);

    expect(failure).toBeInstanceOf(AdminError);
    expect(failure).toMatchObject({
      code: "RATE_LIMITED",
      message: "Please slow down and try again in 9s.",
    });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });

  it("rolls the transaction back when the command is refused, and says why", async () => {
    command.mockRejectedValue(
      new AdminError(
        "CURRICULUM_ITEM_NOT_FOUND",
        "This import no longer exists.",
      ),
    );

    await expect(run(input)).rejects.toMatchObject({
      code: "CURRICULUM_ITEM_NOT_FOUND",
    });
    expect(mocks.events).toEqual(["allowance", "begin", "rollback"]);
  });
});

describe("permanentlyDeleteCurriculumImport", () => {
  it("spends the allowance, reads the file's key, deletes the history in a transaction — and only then the file", async () => {
    await expect(
      permanentlyDeleteCurriculumImport(input),
    ).resolves.toBeUndefined();

    expect(mocks.check).toHaveBeenCalledExactlyOnceWith({
      policy: "admin-mutation",
      subject: ACTOR,
    });
    // The key is read from the pool, before the record is gone.
    expect(mocks.getById).toHaveBeenCalledExactlyOnceWith(mocks.db, IMPORT);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(mocks.tx, input);
    expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith(KEY);
    // The file goes after the history has committed: never before, never inside it.
    expect(mocks.events).toEqual([
      "allowance",
      "read",
      "begin",
      "command",
      "commit",
      "delete-file",
    ]);
  });

  it("opens no transaction, reads nothing and deletes nothing once the allowance is spent", async () => {
    mocks.check.mockResolvedValue(refused(4));

    await expect(
      permanentlyDeleteCurriculumImport(input),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(mocks.getById).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("leaves the file alone when the history could not be deleted", async () => {
    mocks.remove.mockRejectedValue(
      new AdminError(
        "CURRICULUM_VALIDATION_FAILED",
        "Only an archived import can be permanently deleted.",
      ),
    );

    await expect(
      permanentlyDeleteCurriculumImport(input),
    ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
    expect(mocks.events).toContain("rollback");
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("touches no file for an import that was not there to read", async () => {
    mocks.getById.mockResolvedValue(null);

    await expect(
      permanentlyDeleteCurriculumImport(input),
    ).resolves.toBeUndefined();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  // The history is gone and its audit event written: the command has succeeded,
  // whatever the file's fate. The bucket expires it anyway.
  it("succeeds when the storage refuses to delete the file", async () => {
    mocks.deleteObject.mockRejectedValue(new Error("AccessDenied"));

    await expect(
      permanentlyDeleteCurriculumImport(input),
    ).resolves.toBeUndefined();
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("succeeds when no storage is configured — the client cannot even be built", async () => {
    mocks.storage.mockImplementation(() => {
      throw new Error("IMPORT_BUCKET is not configured.");
    });

    await expect(
      permanentlyDeleteCurriculumImport(input),
    ).resolves.toBeUndefined();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.events).toContain("commit");
  });
});
