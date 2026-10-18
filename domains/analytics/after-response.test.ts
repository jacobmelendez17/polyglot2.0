import { beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({ after }));

import { runAfterResponse } from "./after-response";

beforeEach(() => {
  after.mockReset();
});

describe("runAfterResponse", () => {
  it("hands the task to Next's after(), so a serverless function stays alive until it ends", () => {
    const task = vi.fn(async () => undefined);

    runAfterResponse(task);

    expect(after).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(task);
    // after() decides when it runs; this function does not run it as well.
    expect(task).not.toHaveBeenCalled();
  });

  it("runs the task itself where there is no request to follow (a script, a test)", async () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const task = vi.fn(async () => undefined);

    expect(() => runAfterResponse(task)).not.toThrow();

    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never lets a failing task reject out of it", async () => {
    after.mockImplementation(() => {
      throw new Error("outside a request");
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      runAfterResponse(async () => {
        throw new Error("the send failed");
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
