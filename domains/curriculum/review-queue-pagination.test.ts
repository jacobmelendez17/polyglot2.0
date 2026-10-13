import { describe, expect, it } from "vitest";

import type { ReviewQueueEntry } from "./curriculum-admin-types";
import {
  compareReviewKeys,
  paginateReviewQueue,
  sortReviewQueue,
} from "./review-queue-pagination";

function entry(
  id: string,
  overrides: Partial<ReviewQueueEntry> = {},
): ReviewQueueEntry {
  return {
    learningItemId: id,
    kind: "new",
    type: "vocabulary",
    itemLabel: id,
    meaningLabel: `meaning of ${id}`,
    levelNumber: 1,
    groupName: null,
    authorUserId: null,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1,
    ...overrides,
  };
}

/** Labels a..j in level 1 — already in queue order. */
const TEN = "abcdefghij".split("").map((label) => entry(label));
const ids = (entries: ReviewQueueEntry[]) =>
  entries.map((e) => e.learningItemId);

describe("sortReviewQueue", () => {
  it("orders by level, then label, then id", () => {
    const sorted = sortReviewQueue([
      entry("b2", { levelNumber: 2, itemLabel: "b" }),
      entry("z1", { levelNumber: 1, itemLabel: "z" }),
      entry("a1", { levelNumber: 1, itemLabel: "a" }),
    ]);
    expect(ids(sorted)).toEqual(["a1", "z1", "b2"]);
  });

  it("is locale-aware, as the page always sorted: accents do not push a word to the end", () => {
    const sorted = sortReviewQueue([
      entry("zorro", { itemLabel: "zorro" }),
      entry("el", { itemLabel: "él" }),
      entry("ella", { itemLabel: "ella" }),
    ]);
    expect(ids(sorted)).toEqual(["el", "ella", "zorro"]);
  });

  it("breaks a tie between identical labels by id, so the order is total", () => {
    const first = sortReviewQueue([
      entry("y", { itemLabel: "casa" }),
      entry("x", { itemLabel: "casa" }),
    ]);
    const second = sortReviewQueue([
      entry("x", { itemLabel: "casa" }),
      entry("y", { itemLabel: "casa" }),
    ]);
    expect(ids(first)).toEqual(["x", "y"]);
    expect(ids(second)).toEqual(["x", "y"]);
  });

  it("does not mutate its input", () => {
    const input = [entry("b"), entry("a")];
    sortReviewQueue(input);
    expect(ids(input)).toEqual(["b", "a"]);
  });
});

describe("compareReviewKeys", () => {
  it("is zero only for the same key", () => {
    const key = { levelNumber: 1, itemLabel: "a", id: "1" };
    expect(compareReviewKeys(key, { ...key })).toBe(0);
    expect(compareReviewKeys(key, { ...key, id: "2" })).toBeLessThan(0);
  });
});

describe("paginateReviewQueue", () => {
  it("returns the first page with no previous page", () => {
    const page = paginateReviewQueue(TEN, { limit: 4 });
    expect(ids(page.entries)).toEqual(["a", "b", "c", "d"]);
    expect(page.nextCursor).not.toBeNull();
    expect(page.hasPreviousPage).toBe(false);
    expect(page.previousCursor).toBeNull();
  });

  it("accepts entries in any order", () => {
    const shuffled = [...TEN].reverse();
    expect(ids(paginateReviewQueue(shuffled, { limit: 3 }).entries)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("walks forward over every entry exactly once", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = paginateReviewQueue(TEN, { limit: 3, cursor });
      seen.push(...ids(page.entries));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(ids(TEN));
  });

  it("has no next cursor when the last page is exactly full", () => {
    const page = paginateReviewQueue(TEN.slice(0, 6), {
      limit: 3,
      cursor: null,
    });
    const second = paginateReviewQueue(TEN.slice(0, 6), {
      limit: 3,
      cursor: page.nextCursor,
    });
    expect(ids(second.entries)).toEqual(["d", "e", "f"]);
    expect(second.nextCursor).toBeNull();
  });

  it("walks backwards over exactly the pages it walked forwards", () => {
    const p1 = paginateReviewQueue(TEN, { limit: 3 });
    const p2 = paginateReviewQueue(TEN, { limit: 3, cursor: p1.nextCursor });
    const p3 = paginateReviewQueue(TEN, { limit: 3, cursor: p2.nextCursor });
    const p4 = paginateReviewQueue(TEN, { limit: 3, cursor: p3.nextCursor });
    expect(ids(p4.entries)).toEqual(["j"]);

    const backTo3 = paginateReviewQueue(TEN, {
      limit: 3,
      cursor: p4.previousCursor,
    });
    expect(ids(backTo3.entries)).toEqual(ids(p3.entries));
    const backTo2 = paginateReviewQueue(TEN, {
      limit: 3,
      cursor: backTo3.previousCursor,
    });
    expect(ids(backTo2.entries)).toEqual(ids(p2.entries));
    const backTo1 = paginateReviewQueue(TEN, {
      limit: 3,
      cursor: backTo2.previousCursor,
    });
    expect(ids(backTo1.entries)).toEqual(ids(p1.entries));

    // The first page needs no cursor, and has nothing before it.
    expect(backTo2.previousCursor).toBeNull();
    expect(backTo2.hasPreviousPage).toBe(true);
    expect(backTo1.hasPreviousPage).toBe(false);
  });

  describe("a queue that shrinks as it is worked", () => {
    it("keeps paging correctly when the row a cursor came from has been published", () => {
      const p1 = paginateReviewQueue(TEN, { limit: 3 });
      // "c" — the row the cursor was taken from — is published and leaves the queue.
      const withoutC = TEN.filter((e) => e.learningItemId !== "c");

      const next = paginateReviewQueue(withoutC, {
        limit: 3,
        cursor: p1.nextCursor,
      });
      // Nothing skipped, nothing repeated: d, e, f follow.
      expect(ids(next.entries)).toEqual(["d", "e", "f"]);
    });

    it("keeps paging correctly when a whole page was published", () => {
      const p1 = paginateReviewQueue(TEN, { limit: 3 });
      const withoutFirstPage = TEN.slice(3);
      const next = paginateReviewQueue(withoutFirstPage, {
        limit: 3,
        cursor: p1.nextCursor,
      });
      expect(ids(next.entries)).toEqual(["d", "e", "f"]);
      expect(next.hasPreviousPage).toBe(false);
    });

    it("returns an empty page, with a way back, when everything after the cursor is gone", () => {
      const p3 = paginateReviewQueue(TEN, {
        limit: 3,
        cursor: paginateReviewQueue(TEN, {
          limit: 3,
          cursor: paginateReviewQueue(TEN, { limit: 3 }).nextCursor,
        }).nextCursor,
      });
      expect(ids(p3.entries)).toEqual(["g", "h", "i"]);
      const cursorToLast = p3.nextCursor;

      // The last row (j) is published; the page the cursor points at is now empty.
      const onlyNine = TEN.filter((e) => e.learningItemId !== "j");
      const emptied = paginateReviewQueue(onlyNine, {
        limit: 3,
        cursor: cursorToLast,
      });
      expect(emptied.entries).toEqual([]);
      expect(emptied.nextCursor).toBeNull();
      expect(emptied.hasPreviousPage).toBe(true);
    });
  });

  describe("pages never straddle a tie unpredictably", () => {
    it("splits identical labels deterministically across a page boundary", () => {
      const twins = [
        entry("c", { itemLabel: "casa" }),
        entry("b", { itemLabel: "casa" }),
        entry("a", { itemLabel: "casa" }),
      ];
      const p1 = paginateReviewQueue(twins, { limit: 2 });
      const p2 = paginateReviewQueue(twins, {
        limit: 2,
        cursor: p1.nextCursor,
      });
      expect([...ids(p1.entries), ...ids(p2.entries)]).toEqual(["a", "b", "c"]);
    });
  });

  it("clamps an out-of-range limit instead of returning everything or nothing", () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      entry(String(i).padStart(3, "0")),
    );
    expect(paginateReviewQueue(many, { limit: 1000 }).entries).toHaveLength(
      100,
    );
    expect(paginateReviewQueue(many, { limit: 0 }).entries).toHaveLength(1);
    expect(paginateReviewQueue(many, { limit: -5 }).entries).toHaveLength(1);
  });

  it("handles an empty queue", () => {
    expect(paginateReviewQueue([], { limit: 20 })).toEqual({
      entries: [],
      nextCursor: null,
      hasPreviousPage: false,
      previousCursor: null,
    });
  });

  describe("a tampered cursor is a validation failure, not a crash", () => {
    const wrongShape = Buffer.from(JSON.stringify({ id: 7 })).toString(
      "base64url",
    );
    it.each([
      ["not base64 json", "%%%"],
      ["garbage", Buffer.from("definitely not json").toString("base64url")],
      ["the wrong shape", wrongShape],
    ])("rejects %s", (_name, cursor) => {
      expect(() => paginateReviewQueue(TEN, { limit: 3, cursor })).toThrowError(
        expect.objectContaining({ code: "CURRICULUM_VALIDATION_FAILED" }),
      );
    });
  });
});
