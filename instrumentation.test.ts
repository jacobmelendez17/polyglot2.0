import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootObservability = vi.hoisted(() => vi.fn());

vi.mock("./providers/observability/boot", () => ({ bootObservability }));

import { register } from "./instrumentation";

beforeEach(() => {
  bootObservability.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("register", () => {
  it("starts observability for the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    await register();

    expect(bootObservability).toHaveBeenCalledTimes(1);
  });

  it.each(["edge", "", undefined])(
    "does nothing, and loads nothing, for the %j runtime",
    async (runtime) => {
      if (runtime === undefined) vi.stubEnv("NEXT_RUNTIME", undefined as never);
      else vi.stubEnv("NEXT_RUNTIME", runtime);

      await register();

      expect(bootObservability).not.toHaveBeenCalled();
    },
  );

  it("never throws, so telemetry cannot stop the server from starting", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    bootObservability.mockImplementation(() => {
      throw new Error("could not start");
    });
    await expect(register()).resolves.toBeUndefined();

    bootObservability.mockRejectedValue(new Error("could not start, later"));
    await expect(register()).resolves.toBeUndefined();
  });

  it("waits for observability to finish starting before the server takes a request", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    let started = false;
    bootObservability.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      started = true;
    });

    await register();

    expect(started).toBe(true);
  });
});
