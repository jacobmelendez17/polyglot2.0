import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_ROLES, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";

const requireUser = vi.hoisted(() => vi.fn());
const reorderVocabularyGroups = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/admin/server", () => ({ reorderVocabularyGroups }));
vi.mock("@/domains/curriculum/server", () => ({}));
vi.mock("@/domains/lexicon/server", () => ({}));

import { reorderVocabularyGroupsAction } from "./actions";

const ORDER = {
  levelId: "level-1",
  orderedGroupIds: ["group-2", "group-1", "group-3"],
  idempotencyKey: "key-1",
};

function signedInAs(role: UserRole) {
  requireUser.mockResolvedValue({ id: `user-${role}`, role });
}

beforeEach(() => {
  requireUser.mockReset();
  reorderVocabularyGroups.mockReset();
  reorderVocabularyGroups.mockResolvedValue(undefined);
});

/**
 * The group reorder tool stays a specialist screen on a Server Action (spec 26
 * Unit 5: no generic list sort may persist `position`), so this action is the
 * one place the reorder's authorization lives — there is no HTTP route to test
 * it through. Structural changes are Admin-only (spec 26 §6); the page hiding
 * the link from a writer is a convenience, and this is what actually refuses.
 */
describe("reorderVocabularyGroupsAction — who may reorder a level's groups", () => {
  it("lets an Admin reorder, as themselves, with exactly what they sent", async () => {
    signedInAs("admin");

    await expect(reorderVocabularyGroupsAction(ORDER)).resolves.toEqual({
      ok: true,
      data: undefined,
    });

    expect(reorderVocabularyGroups).toHaveBeenCalledOnce();
    expect(reorderVocabularyGroups).toHaveBeenCalledWith({
      ...ORDER,
      actorUserId: "user-admin",
    });
  });

  // Not just writers: every other role, including a developer, who is admitted
  // to the admin area but not to curriculum structure.
  it.each(USER_ROLES.filter((role) => role !== "admin"))(
    "refuses a %s, and never reaches the service",
    async (role) => {
      signedInAs(role);

      await expect(reorderVocabularyGroupsAction(ORDER)).resolves.toEqual({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "You don't have access to do that.",
        },
      });

      expect(reorderVocabularyGroups).not.toHaveBeenCalled();
    },
  );

  it("takes who is asking from the session, never from the request", async () => {
    signedInAs("admin");

    await reorderVocabularyGroupsAction({
      ...ORDER,
      // A forged claim: stripped at the boundary, not forwarded.
      actorUserId: "someone-else",
      role: "admin",
    } as never);

    expect(reorderVocabularyGroups).toHaveBeenCalledWith({
      ...ORDER,
      actorUserId: "user-admin",
    });
  });
});

describe("reorderVocabularyGroupsAction — what it refuses to pass on", () => {
  it.each([
    ["an empty order", { ...ORDER, orderedGroupIds: [] }],
    ["an empty group id", { ...ORDER, orderedGroupIds: ["group-1", ""] }],
    ["no level", { ...ORDER, levelId: "" }],
    ["no idempotency key", { ...ORDER, idempotencyKey: "" }],
  ])("refuses %s before it reaches the service", async (_name, input) => {
    signedInAs("admin");

    await expect(reorderVocabularyGroupsAction(input)).resolves.toMatchObject({
      ok: false,
      error: { code: "CURRICULUM_VALIDATION_FAILED" },
    });
    expect(reorderVocabularyGroups).not.toHaveBeenCalled();
  });

  it("reports the service's own refusal in the person's terms", async () => {
    signedInAs("admin");
    reorderVocabularyGroups.mockRejectedValue(
      new AdminError(
        "CURRICULUM_VALIDATION_FAILED",
        "That list is not this level's groups.",
      ),
    );

    await expect(reorderVocabularyGroupsAction(ORDER)).resolves.toMatchObject({
      ok: false,
      error: {
        code: "CURRICULUM_VALIDATION_FAILED",
        message: "That list is not this level's groups.",
      },
    });
  });

  it("never shows an unexpected fault's own text", async () => {
    signedInAs("admin");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    reorderVocabularyGroups.mockRejectedValue(
      new Error('duplicate key value violates "vocabulary_groups_level_pos"'),
    );

    const result = await reorderVocabularyGroupsAction(ORDER);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    });
    quiet.mockRestore();
  });
});
