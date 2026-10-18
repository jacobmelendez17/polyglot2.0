import { describe, expect, it } from "vitest";

import {
  collectAnalyticsEvents,
  queueAnalyticsEvent,
} from "./analytics-event-collector";
import type { PendingAnalyticsEvent } from "./analytics-events";

function event(dedupeKey: string): PendingAnalyticsEvent {
  return {
    event: "level_unlocked",
    languageId: "language-1",
    properties: { level: 2 },
    dedupeKey,
    occurredAt: new Date("2026-10-17T20:00:00Z"),
    source: "server",
  };
}

const keys = (events: PendingAnalyticsEvent[]) =>
  events.map((queued) => queued.dedupeKey);

describe("queueAnalyticsEvent", () => {
  it("does nothing, and does not throw, outside a collection scope", () => {
    expect(() => queueAnalyticsEvent(event("a"))).not.toThrow();
  });
});

describe("collectAnalyticsEvents", () => {
  it("returns what the work returned and what it queued, in order", async () => {
    const { result, events } = await collectAnalyticsEvents(async () => {
      queueAnalyticsEvent(event("a"));
      queueAnalyticsEvent(event("b"));
      return "the result";
    });

    expect(result).toBe("the result");
    expect(keys(events)).toEqual(["a", "b"]);
  });

  it("follows the work across awaits, as a transaction callback needs", async () => {
    const { events } = await collectAnalyticsEvents(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 5));
      queueAnalyticsEvent(event("after-awaits"));
      await Promise.all([
        (async () => {
          await Promise.resolve();
          queueAnalyticsEvent(event("from-a-branch"));
        })(),
      ]);
    });

    expect(keys(events).sort()).toEqual(["after-awaits", "from-a-branch"]);
  });

  it("discards everything, and rethrows, when the work fails — a rolled-back call reports nothing", async () => {
    const boom = new Error("the transaction was refused");

    await expect(
      collectAnalyticsEvents(async () => {
        queueAnalyticsEvent(event("queued-before-the-failure"));
        throw boom;
      }),
    ).rejects.toBe(boom);

    // The next scope starts empty: nothing leaked out of the failed one.
    const { events } = await collectAnalyticsEvents(async () => undefined);
    expect(events).toEqual([]);
  });

  it("keeps simultaneous scopes apart", async () => {
    const run = (label: string, delay: number) =>
      collectAnalyticsEvents(async () => {
        queueAnalyticsEvent(event(`${label}-1`));
        await new Promise((resolve) => setTimeout(resolve, delay));
        queueAnalyticsEvent(event(`${label}-2`));
      });

    const [first, second] = await Promise.all([run("a", 15), run("b", 1)]);

    expect(keys(first.events)).toEqual(["a-1", "a-2"]);
    expect(keys(second.events)).toEqual(["b-1", "b-2"]);
  });

  it("keeps a nested scope's events out of the outer one", async () => {
    const outer = await collectAnalyticsEvents(async () => {
      queueAnalyticsEvent(event("outer-1"));
      const inner = await collectAnalyticsEvents(async () => {
        queueAnalyticsEvent(event("inner"));
      });
      queueAnalyticsEvent(event("outer-2"));
      return keys(inner.events);
    });

    expect(outer.result).toEqual(["inner"]);
    expect(keys(outer.events)).toEqual(["outer-1", "outer-2"]);
  });

  it("stops queueing past a safety bound rather than growing without limit", async () => {
    const { events } = await collectAnalyticsEvents(async () => {
      for (let i = 0; i < 200; i++) queueAnalyticsEvent(event(`e${i}`));
    });

    expect(events.length).toBeLessThanOrEqual(20);
    expect(events.length).toBeGreaterThan(0);
    expect(keys(events)[0]).toBe("e0");
  });

  it("hands out a copy, so a caller cannot change what a later reader sees", async () => {
    const { events } = await collectAnalyticsEvents(async () => {
      queueAnalyticsEvent(event("a"));
    });
    events.length = 0;

    const again = await collectAnalyticsEvents(async () => {
      queueAnalyticsEvent(event("a"));
    });
    expect(again.events).toHaveLength(1);
  });
});
