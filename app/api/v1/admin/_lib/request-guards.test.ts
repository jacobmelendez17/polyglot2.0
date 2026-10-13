import { describe, expect, it } from "vitest";

import { AdminApiRequestError } from "./admin-api-errors";
import {
  MAX_COMMAND_BODY_BYTES,
  assertCommandRequest,
  checkSameOrigin,
  isJsonContentType,
  parseJsonBody,
  readBodyWithLimit,
} from "./request-guards";

const URL_ = "https://polyglot.example/api/v1/admin/review/publish";
const ORIGIN = "https://polyglot.example";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("checkSameOrigin", () => {
  describe("Sec-Fetch-Site (set by the browser, unforgeable cross-site)", () => {
    it("accepts same-origin", () => {
      expect(
        checkSameOrigin(headers({ "sec-fetch-site": "same-origin" }), URL_),
      ).toEqual({ ok: true });
    });

    it.each(["cross-site", "same-site", "none"])(
      "refuses %s — even with a matching Origin",
      (site) => {
        expect(
          checkSameOrigin(
            headers({ "sec-fetch-site": site, origin: ORIGIN }),
            URL_,
          ),
        ).toEqual({ ok: false, reason: "cross-site" });
      },
    );

    it("refuses a sibling subdomain (same-site is not same-origin)", () => {
      expect(
        checkSameOrigin(
          headers({
            "sec-fetch-site": "same-site",
            origin: "https://evil.polyglot.example",
          }),
          URL_,
        ).ok,
      ).toBe(false);
    });
  });

  describe("Origin", () => {
    it("accepts this app's own origin", () => {
      expect(checkSameOrigin(headers({ origin: ORIGIN }), URL_)).toEqual({
        ok: true,
      });
    });

    it.each([
      ["another site", "https://evil.example"],
      ["a lookalike host", "https://polyglot.example.evil.example"],
      ["the same host over http", "http://polyglot.example"],
      ["the same host on another port", "https://polyglot.example:8443"],
      ["the literal string null (sandboxed frame)", "null"],
      ["an empty value", ""],
    ])("refuses %s", (_name, origin) => {
      expect(checkSameOrigin(headers({ origin }), URL_)).toEqual({
        ok: false,
        reason: "origin-mismatch",
      });
    });

    it("compares the whole origin, not a prefix", () => {
      expect(
        checkSameOrigin(headers({ origin: `${ORIGIN}.attacker.example` }), URL_)
          .ok,
      ).toBe(false);
    });
  });

  describe("which signal decides", () => {
    // The server's own view of its URL can differ from the one the browser
    // used (a proxy that rewrites the scheme or host). The browser's verdict
    // must not be second-guessed by that view.
    const INTERNAL = "http://10.0.0.7:3000/api/v1/admin/review/publish";

    it("trusts Sec-Fetch-Site: same-origin over the server's own URL", () => {
      expect(
        checkSameOrigin(
          headers({ "sec-fetch-site": "same-origin", origin: ORIGIN }),
          INTERNAL,
        ),
      ).toEqual({ ok: true });
    });

    it("still compares Origin strictly when it is the only signal", () => {
      expect(checkSameOrigin(headers({ origin: ORIGIN }), INTERNAL)).toEqual({
        ok: false,
        reason: "origin-mismatch",
      });
    });

    it("lets a browser's cross-site verdict win over a matching Origin", () => {
      expect(
        checkSameOrigin(
          headers({ "sec-fetch-site": "cross-site", origin: ORIGIN }),
          URL_,
        ),
      ).toEqual({ ok: false, reason: "cross-site" });
    });
  });

  it("accepts Sec-Fetch-Site: same-origin when no Origin is sent", () => {
    expect(
      checkSameOrigin(headers({ "sec-fetch-site": "same-origin" }), URL_).ok,
    ).toBe(true);
  });

  it("fails closed when neither header is present", () => {
    expect(checkSameOrigin(headers({}), URL_)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("agrees on a localhost dev origin, port included", () => {
    expect(
      checkSameOrigin(
        headers({ origin: "http://localhost:3100" }),
        "http://localhost:3100/api/v1/admin/review/publish",
      ).ok,
    ).toBe(true);
    expect(
      checkSameOrigin(
        headers({ origin: "http://localhost:3000" }),
        "http://localhost:3100/api/v1/admin/review/publish",
      ).ok,
    ).toBe(false);
  });
});

describe("isJsonContentType", () => {
  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON",
    "application/json ;charset=UTF-8",
  ])("accepts %s", (value) => {
    expect(isJsonContentType(value)).toBe(true);
  });

  it.each([
    // The types a cross-site HTML <form> can send without a preflight.
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "text/plain",
    "application/jsonp",
    "application/json-patch+json",
    "text/json",
    "",
  ])("refuses %s", (value) => {
    expect(isJsonContentType(value)).toBe(false);
  });

  it("refuses a missing header", () => {
    expect(isJsonContentType(null)).toBe(false);
  });
});

describe("assertCommandRequest", () => {
  const ok = {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    origin: ORIGIN,
  };
  const req = (init: Record<string, string>, url = URL_) =>
    new Request(url, { method: "POST", headers: init });

  function rejection(request: Request): AdminApiRequestError {
    try {
      assertCommandRequest(request);
    } catch (error) {
      expect(error).toBeInstanceOf(AdminApiRequestError);
      return error as AdminApiRequestError;
    }
    throw new Error("expected the request to be refused");
  }

  it("passes a same-origin JSON request", () => {
    expect(() => assertCommandRequest(req(ok))).not.toThrow();
  });

  it("refuses a cross-origin request as FORBIDDEN, before looking at the body", () => {
    const error = rejection(
      req({
        ...ok,
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      }),
    );
    expect(error.code).toBe("FORBIDDEN");
  });

  it("checks origin before content type, so a cross-site probe learns nothing else", () => {
    const error = rejection(
      req({
        "content-type": "text/plain",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      }),
    );
    expect(error.code).toBe("FORBIDDEN");
  });

  it("refuses a non-JSON content type as 415", () => {
    expect(rejection(req({ ...ok, "content-type": "text/plain" })).code).toBe(
      "UNSUPPORTED_MEDIA_TYPE",
    );
  });

  it("refuses any query string — a command's data belongs in the body", () => {
    expect(rejection(req(ok, `${URL_}?itemId=123&token=secret`)).code).toBe(
      "VALIDATION_FAILED",
    );
  });
});

describe("readBodyWithLimit", () => {
  const post = (body: BodyInit | null, init: Record<string, string> = {}) =>
    new Request(URL_, { method: "POST", headers: init, body });

  async function failure(
    promise: Promise<unknown>,
  ): Promise<AdminApiRequestError> {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(AdminApiRequestError);
      return error as AdminApiRequestError;
    }
    throw new Error("expected the read to be refused");
  }

  it("reads a body within the limit", async () => {
    await expect(readBodyWithLimit(post('{"a":1}'), 100)).resolves.toBe(
      '{"a":1}',
    );
  });

  it("returns an empty string for no body", async () => {
    await expect(readBodyWithLimit(post(null), 100)).resolves.toBe("");
  });

  it("accepts a body of exactly the limit", async () => {
    await expect(
      readBodyWithLimit(post("x".repeat(100)), 100),
    ).resolves.toHaveLength(100);
  });

  it("refuses a body one byte over the limit as 413", async () => {
    const error = await failure(readBodyWithLimit(post("x".repeat(101)), 100));
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("refuses on the declared Content-Length alone, without reading", async () => {
    const request = post("x", { "content-length": "999999" });
    const error = await failure(readBodyWithLimit(request, 100));
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("counts the real stream when Content-Length lies or is absent (chunked)", async () => {
    const chunks = Array.from({ length: 10 }, () =>
      new Uint8Array(20).fill(97),
    );
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(URL_, {
      method: "POST",
      body: stream,
      // @ts-expect-error — `duplex` is required for streamed bodies in Node.
      duplex: "half",
    });
    const error = await failure(readBodyWithLimit(request, 100));
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
    // It stopped reading instead of buffering the rest.
    expect(cancelled).toBe(true);
  });

  it("counts bytes, not characters", async () => {
    // 60 two-byte characters = 120 bytes, under 100 *characters* but over 100 bytes.
    const error = await failure(readBodyWithLimit(post("é".repeat(60)), 100));
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("decodes multi-byte text split across chunks", async () => {
    const bytes = new TextEncoder().encode("¿cómo estás?");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split inside a multi-byte character.
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    const request = new Request(URL_, {
      method: "POST",
      body: stream,
      // @ts-expect-error — see above.
      duplex: "half",
    });
    await expect(readBodyWithLimit(request, 100)).resolves.toBe("¿cómo estás?");
  });

  it("is sized for a real command", () => {
    // A publish command is ~130 bytes; the cap must comfortably allow it and
    // still be small enough to be a meaningful limit.
    expect(MAX_COMMAND_BODY_BYTES).toBeGreaterThan(512);
    expect(MAX_COMMAND_BODY_BYTES).toBeLessThanOrEqual(16 * 1024);
  });
});

describe("parseJsonBody", () => {
  it("parses JSON", () => {
    expect(parseJsonBody('{"a":[1,2]}')).toEqual({ a: [1, 2] });
  });

  it.each(["", "{", "not json", "{'a':1}", "undefined"])(
    "turns %j into a validation error, not a SyntaxError",
    (text) => {
      expect(() => parseJsonBody(text)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_FAILED" }),
      );
    },
  );
});
