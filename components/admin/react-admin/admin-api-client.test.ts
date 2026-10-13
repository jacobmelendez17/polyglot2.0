import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { requestAdminApi } from "./admin-api-client";
import { AdminApiError } from "./admin-api-error";

const schema = z.object({ answer: z.number() });

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => Response.json(body, { status })) as never;
}

async function rejection(promise: Promise<unknown>): Promise<AdminApiError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AdminApiError);
  return error as AdminApiError;
}

describe("requestAdminApi", () => {
  it("returns the parsed `data` payload", async () => {
    const fetcher = respond({ data: { answer: 42 } });
    await expect(
      requestAdminApi("/thing", schema, { fetcher }),
    ).resolves.toEqual({ answer: 42 });
  });

  it("makes a same-origin, uncached GET that carries no identity of its own", async () => {
    const fetcher = respond({ data: { answer: 1 } });
    await requestAdminApi("/thing", schema, { fetcher });

    const [url, init] = vi.mocked(fetcher).mock.calls[0]!;
    expect(url).toBe("/api/v1/admin/thing");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    // Identity comes from the session cookie alone — never a header the
    // client could forge (spec 26 §5: "Never use an x-user-id header").
    expect(Object.keys(init?.headers ?? {})).toEqual(["Accept"]);
  });

  it("maps a structured server error onto AdminApiError with its status", async () => {
    const error = await rejection(
      requestAdminApi("/thing", schema, {
        fetcher: respond(
          { error: { code: "FORBIDDEN", message: "server wording" } },
          403,
        ),
      }),
    );
    expect(error.status).toBe(403);
    expect(error.kind).toBe("forbidden");
    expect(error.message).not.toContain("server wording");
  });

  it("classifies an unreadable error body by status alone", async () => {
    const fetcher = vi.fn(
      async () => new Response("<html>Bad gateway</html>", { status: 502 }),
    ) as never;
    const error = await rejection(
      requestAdminApi("/thing", schema, { fetcher }),
    );
    expect(error.status).toBe(502);
    expect(error.kind).toBe("server");
  });

  it("rejects a success response that does not match the contract", async () => {
    const error = await rejection(
      requestAdminApi("/thing", schema, {
        fetcher: respond({ data: { answer: "not a number" } }),
      }),
    );
    expect(error.kind).toBe("invalid_response");
  });

  it("rejects a success response with no envelope", async () => {
    const error = await rejection(
      requestAdminApi("/thing", schema, {
        fetcher: respond({ answer: 42 }),
      }),
    );
    expect(error.kind).toBe("invalid_response");
  });

  it("reports an unreachable server as a network error", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as never;
    const error = await rejection(
      requestAdminApi("/thing", schema, { fetcher }),
    );
    expect(error.kind).toBe("network");
    expect(error.status).toBe(0);
  });

  it("re-throws an aborted request untouched so React Query can cancel", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    const fetcher = vi.fn(async () => {
      controller.abort();
      throw abort;
    }) as never;

    await expect(
      requestAdminApi("/thing", schema, {
        fetcher,
        signal: controller.signal,
      }),
    ).rejects.toBe(abort);
  });

  describe("commands", () => {
    it("sends a POST with a JSON body and a JSON content type", async () => {
      const fetcher = respond({ data: { answer: 7 } });
      await requestAdminApi("/review/publish", schema, {
        fetcher,
        body: { itemId: "abc", expectedVersion: 3 },
      });

      const [url, init] = vi.mocked(fetcher).mock.calls[0]!;
      expect(url).toBe("/api/v1/admin/review/publish");
      expect(init).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ itemId: "abc", expectedVersion: 3 }),
      });
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
    });

    it("sets no Origin or Sec-Fetch headers itself — the browser owns those", async () => {
      const fetcher = respond({ data: { answer: 1 } });
      await requestAdminApi("/x", schema, { fetcher, body: {} });
      const headers = Object.keys(
        vi.mocked(fetcher).mock.calls[0]![1]!.headers!,
      );
      expect(headers.map((h) => h.toLowerCase())).toEqual([
        "accept",
        "content-type",
      ]);
    });

    it("still treats a request with no body as a GET with no content type", async () => {
      const fetcher = respond({ data: { answer: 1 } });
      await requestAdminApi("/x", schema, { fetcher });
      const init = vi.mocked(fetcher).mock.calls[0]![1]!;
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.headers).not.toHaveProperty("Content-Type");
    });

    it("sends an empty-object command as a command, not a GET", async () => {
      const fetcher = respond({ data: { answer: 1 } });
      await requestAdminApi("/x", schema, { fetcher, body: {} });
      expect(vi.mocked(fetcher).mock.calls[0]![1]!.method).toBe("POST");
    });

    it("sends a command that changes one named resource as a PATCH, with the same JSON body and headers", async () => {
      const fetcher = respond({ data: { answer: 2 } });
      await requestAdminApi("/levels/abc", schema, {
        fetcher,
        method: "PATCH",
        body: { name: "Renamed" },
      });

      const [url, init] = vi.mocked(fetcher).mock.calls[0]!;
      expect(url).toBe("/api/v1/admin/levels/abc");
      expect(init).toMatchObject({
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ name: "Renamed" }),
      });
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
      });
    });

    it("is a POST unless it says otherwise", async () => {
      const fetcher = respond({ data: { answer: 1 } });
      await requestAdminApi("/levels", schema, { fetcher, body: { a: 1 } });
      expect(vi.mocked(fetcher).mock.calls[0]![1]!.method).toBe("POST");
    });

    it("never turns a bodiless request into a PATCH", async () => {
      const fetcher = respond({ data: { answer: 1 } });
      await requestAdminApi("/levels", schema, { fetcher, method: "PATCH" });
      expect(vi.mocked(fetcher).mock.calls[0]![1]!.method).toBe("GET");
    });
  });

  describe("failures that carry a reason", () => {
    const failing = (
      status: number,
      error: object,
      headers: HeadersInit = {},
    ) =>
      vi.fn(async () => Response.json({ error }, { status, headers })) as never;

    it("surfaces the server's sentence for a stale-version conflict", async () => {
      const error = await rejection(
        requestAdminApi("/x", schema, {
          fetcher: failing(409, {
            code: "CONFLICT",
            message:
              "This item changed after you opened it. Reload the latest version.",
          }),
          body: {},
        }),
      );
      expect(error.kind).toBe("conflict");
      expect(error.message).toContain("changed after you opened it");
    });

    it("reads Retry-After off a 429", async () => {
      const error = await rejection(
        requestAdminApi("/x", schema, {
          fetcher: failing(
            429,
            {
              code: "RATE_LIMITED",
              message: "Please slow down and try again in 17s.",
            },
            { "Retry-After": "17" },
          ),
          body: {},
        }),
      );
      expect(error.kind).toBe("rate_limited");
      expect(error.retryAfterSeconds).toBe(17);
    });

    it.each(["", "soon", "-3", "0"])(
      "ignores a Retry-After of %j",
      async (value) => {
        const error = await rejection(
          requestAdminApi("/x", schema, {
            fetcher: failing(
              429,
              { code: "RATE_LIMITED", message: "slow down" },
              { "Retry-After": value },
            ),
            body: {},
          }),
        );
        expect(error.retryAfterSeconds).toBeUndefined();
      },
    );

    it("never shows a server fault's own text", async () => {
      const error = await rejection(
        requestAdminApi("/x", schema, {
          fetcher: failing(500, {
            code: "INTERNAL_ERROR",
            message: "deadlock detected on learning_items",
          }),
          body: {},
        }),
      );
      expect(error.message).not.toContain("learning_items");
    });
  });
});
