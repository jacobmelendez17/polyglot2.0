import { describe, expect, it } from "vitest";

import {
  describeMigrationFailure,
  MigrationError,
  mustRunOutsideTransaction,
  quoteIdentifier,
} from "./run-migrations";

describe("mustRunOutsideTransaction", () => {
  it("is false for ordinary DDL", () => {
    expect(
      mustRunOutsideTransaction([
        'CREATE TABLE "a" ("id" integer);',
        'ALTER TABLE "a" ADD COLUMN "b" text;',
      ]),
    ).toBe(false);
  });

  it("is true when any statement creates an index concurrently", () => {
    expect(
      mustRunOutsideTransaction([
        'CREATE UNIQUE INDEX CONCURRENTLY "a_key" ON "a" ("id");',
      ]),
    ).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(
      mustRunOutsideTransaction(['create index concurrently "i" on "a" ("b")']),
    ).toBe(true);
  });

  it("ignores the word inside SQL comments", () => {
    expect(
      mustRunOutsideTransaction([
        '-- not CONCURRENTLY, on purpose\nCREATE INDEX "i" ON "a" ("b");',
        '/* CONCURRENTLY is mentioned here */ CREATE INDEX "j" ON "a" ("c");',
      ]),
    ).toBe(false);
  });
});

describe("quoteIdentifier", () => {
  it("quotes plain identifiers", () => {
    expect(quoteIdentifier("drizzle")).toBe('"drizzle"');
    expect(quoteIdentifier("__drizzle_migrations")).toBe(
      '"__drizzle_migrations"',
    );
  });

  it.each(['a"b', "a b", "1abc", "a;drop", ""])(
    "rejects %j rather than interpolating it into SQL",
    (identifier) => {
      expect(() => quoteIdentifier(identifier)).toThrow(
        /Invalid SQL identifier/,
      );
    },
  );
});

describe("describeMigrationFailure", () => {
  const postgresError = Object.assign(
    new Error(
      "CREATE INDEX CONCURRENTLY cannot run inside a transaction block",
    ),
    { code: "25001", detail: "some detail", hint: "some hint" },
  );

  it("names the migration, statement position, SQLSTATE, detail and hint", () => {
    const message = describeMigrationFailure({
      tag: "0043_add_curriculum_key_unique_indexes",
      statementNumber: 2,
      statementCount: 3,
      statement: 'CREATE UNIQUE INDEX "x"\n  ON "t" ("c");',
      ranInTransaction: true,
      cause: postgresError,
    });

    expect(message).toContain(
      "Migration 0043_add_curriculum_key_unique_indexes failed at statement 2 of 3",
    );
    expect(message).toContain("cannot run inside a transaction block");
    expect(message).toContain("SQLSTATE 25001");
    expect(message).toContain(
      'statement: CREATE UNIQUE INDEX "x" ON "t" ("c");',
    );
    expect(message).toContain("detail: some detail");
    expect(message).toContain("hint: some hint");
    expect(message).toContain("rolled back");
  });

  it("warns that a non-transactional migration may be partially applied", () => {
    const message = describeMigrationFailure({
      tag: "0043_x",
      statementNumber: 1,
      statementCount: 1,
      statement: "CREATE INDEX CONCURRENTLY i ON t (c)",
      ranInTransaction: false,
      cause: new Error("boom"),
    });

    expect(message).toContain("outside a transaction");
    expect(message).toContain("INVALID index");
    expect(message).not.toContain("rolled back");
  });

  it("describes a failure to record the migration as applied", () => {
    const message = describeMigrationFailure({
      tag: "0001_x",
      statementNumber: null,
      statementCount: 2,
      statement: null,
      ranInTransaction: true,
      cause: new Error("connection lost"),
    });

    expect(message).toContain("while recording it as applied");
    expect(message).not.toContain("statement:");
  });

  it("truncates very long statements", () => {
    const message = describeMigrationFailure({
      tag: "0002_x",
      statementNumber: 1,
      statementCount: 1,
      statement: `SELECT ${"x".repeat(500)}`,
      ranInTransaction: true,
      cause: new Error("boom"),
    });

    expect(message).toContain("...");
    expect(message.length).toBeLessThan(700);
  });

  it("exposes the failing tag and original cause on MigrationError", () => {
    const error = new MigrationError({
      tag: "0003_x",
      statementNumber: 1,
      statementCount: 1,
      statement: "SELECT 1",
      ranInTransaction: true,
      cause: postgresError,
    });

    expect(error.tag).toBe("0003_x");
    expect(error.cause).toBe(postgresError);
    expect(error.name).toBe("MigrationError");
  });
});
