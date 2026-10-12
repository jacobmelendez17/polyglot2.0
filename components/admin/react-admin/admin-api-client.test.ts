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
});
