import { afterEach, describe, expect, it, vi } from "vitest";

import { captureWaitUntil } from "./wait-until";

const KEY = Symbol.for("@vercel/request-context");
const holder = globalThis as Record<symbol, unknown>;

afterEach(() => {
  delete holder[KEY];
});

describe("captureWaitUntil", () => {
  it("is undefined where the platform provides no request context", () => {
    expect(captureWaitUntil()).toBeUndefined();
  });

  it("hands the promise to the platform's waitUntil, as a method of its own context", () => {
    const context = {
      waitUntil: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    holder[KEY] = { get: () => context };
    const promise = Promise.resolve();

    const waitUntil = captureWaitUntil();
    waitUntil?.(promise);

    expect(waitUntil).toBeTypeOf("function");
    expect(context.waitUntil).toHaveBeenCalledTimes(1);
    expect(context.waitUntil).toHaveBeenCalledWith(promise);
    expect(context.waitUntil.mock.contexts[0]).toBe(context);
  });

  it.each([
    ["the context has not been established for this call", () => undefined],
    ["the context has no waitUntil", () => ({})],
    ["waitUntil is not a function", () => ({ waitUntil: "soon" })],
    [
      "reading the context throws",
      () => {
        throw new Error("no request here");
      },
    ],
  ])("is undefined when %s", (_label, get) => {
    holder[KEY] = { get };
    expect(captureWaitUntil()).toBeUndefined();
  });

  it("is undefined when the registered value is not what Vercel registers", () => {
    holder[KEY] = "nonsense";
    expect(captureWaitUntil()).toBeUndefined();
  });

  it("never lets a failing waitUntil escape", () => {
    holder[KEY] = {
      get: () => ({
        waitUntil: () => {
          throw new Error("function is already ending");
        },
      }),
    };

    expect(() => captureWaitUntil()?.(Promise.resolve())).not.toThrow();
  });
});
