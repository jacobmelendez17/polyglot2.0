import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Spec 26 Unit 6: "never touch Clerk credentials or metadata", and no
 * arbitrary mutation of a person's data. The role lives in the database and is
 * read from it on every request, so nothing on the path that assigns one has a
 * reason to call the identity provider — and a future edit that did (to "sync"
 * a role into Clerk metadata, say) would quietly make the database role a
 * second source of truth. These pin the files on that path, the way
 * `lib/client-boundary.test.ts` pins the client/server boundary.
 */

const ROLE_PATH = [
  "domains/admin/user-role-service.ts",
  "domains/users/admin-user-repository.ts",
  "domains/users/admin-user-types.ts",
  "app/api/v1/admin/users/route.ts",
  "app/api/v1/admin/users/[userId]/role/route.ts",
  "components/admin/react-admin/users/change-role-dialog.tsx",
  "components/admin/react-admin/users/users-list-screen.tsx",
];

describe("assigning a role never touches the identity provider", () => {
  it.each(ROLE_PATH)("%s imports nothing from Clerk", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/@clerk\//);
    expect(source).not.toMatch(
      /clerkClient|clerk-sdk|publicMetadata|privateMetadata|unsafeMetadata/i,
    );
  });
});

describe("the account repository writes exactly one thing", () => {
  const source = readFileSync("domains/users/admin-user-repository.ts", "utf8");

  it("has a single write to the users table", () => {
    expect(source.match(/\.(update|insert|delete)\(/g)).toEqual([".update("]);
  });

  it("and what it sets is the role — not a name, a username, a timezone or any progress", () => {
    const sets = [...source.matchAll(/\.set\(\{([^}]*)\}\)/g)].map((match) =>
      match[1]!.trim(),
    );
    expect(sets).toEqual(["role"]);
  });
});
