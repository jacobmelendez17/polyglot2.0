import { describe, expect, it } from "vitest";

import { getAuditEventsInputSchema, recordAuditEventInputSchema } from "./audit-schemas";

const VALID_UUID = "60000000-0000-0000-0000-000000000001";

describe("recordAuditEventInputSchema", () => {
  it("accepts a minimal valid input", () => {
    const result = recordAuditEventInputSchema.parse({
      actorUserId: VALID_UUID,
      action: "CURRICULUM_ITEM_CREATED",
      resourceType: "learning_item",
    });
    expect(result.actorUserId).toBe(VALID_UUID);
  });

  it("accepts a fully populated input", () => {
    const result = recordAuditEventInputSchema.parse({
      actorUserId: VALID_UUID,
      action: "CURRICULUM_ITEM_MOVED",
      resourceType: "learning_item",
      resourceId: "gato",
      beforeData: { level: 2 },
      afterData: { level: 3 },
      reason: "Better thematic fit",
      correlationId: "corr-123",
    });
    expect(result.resourceId).toBe("gato");
    expect(result.reason).toBe("Better thematic fit");
  });

  it("rejects an unknown action rather than silently accepting a typo", () => {
    expect(() =>
      recordAuditEventInputSchema.parse({
        actorUserId: VALID_UUID,
        action: "CURRICULUM_ITEM_CREATD",
        resourceType: "learning_item",
      }),
    ).toThrow();
  });

  it("rejects a non-UUID actorUserId", () => {
    expect(() =>
      recordAuditEventInputSchema.parse({
        actorUserId: "not-a-uuid",
        action: "CURRICULUM_ITEM_CREATED",
        resourceType: "learning_item",
      }),
    ).toThrow();
  });

  it("rejects an empty resourceType", () => {
    expect(() =>
      recordAuditEventInputSchema.parse({
        actorUserId: VALID_UUID,
        action: "CURRICULUM_ITEM_CREATED",
        resourceType: "   ",
      }),
    ).toThrow();
  });
});

describe("getAuditEventsInputSchema", () => {
  it("accepts a plain limit-only query", () => {
    const result = getAuditEventsInputSchema.parse({ limit: 20 });
    expect(result.limit).toBe(20);
  });

  it("rejects a limit above the configured maximum", () => {
    expect(() => getAuditEventsInputSchema.parse({ limit: 500 })).toThrow();
  });

  it("rejects a limit below 1", () => {
    expect(() => getAuditEventsInputSchema.parse({ limit: 0 })).toThrow();
  });

  it("accepts every combinable filter together", () => {
    const result = getAuditEventsInputSchema.parse({
      actorUserId: VALID_UUID,
      action: "GROUP_ARCHIVED",
      resourceType: "vocabulary_group",
      resourceId: "days-of-the-week",
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-02-01T00:00:00Z"),
      limit: 10,
      cursor: "some-opaque-cursor",
    });
    expect(result.action).toBe("GROUP_ARCHIVED");
  });
});
