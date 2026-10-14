import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { PolyglotUser } from "@/domains/users";

const requireUser = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));

import { handleAdminMutation } from "./admin-route";
import {
  MAX_BULK_COMMAND_BODY_BYTES,
  MAX_COMMAND_BODY_BYTES,
} from "./request-guards";

const ORIGIN = "http://localhost";
const BROWSER = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

const bodySchema = z.object({ padding: z.string() }).strict();
const execute = vi.fn(
  async (_user: PolyglotUser, body: { padding: string }) => ({
    length: body.padding.length,
  }),
);

/** A JSON body of exactly `bytes` bytes. */
function bodyOfSize(bytes: number): string {
  const overhead = JSON.stringify({ padding: "" }).length;
  return JSON.stringify({ padding: "x".repeat(bytes - overhead) });
}

function post(body: string, options: { maxBodyBytes?: number } = {}) {
  return handleAdminMutation(
    new Request(`${ORIGIN}/api/v1/admin/test`, {
      method: "POST",
      headers: BROWSER,
      body,
    }),
    {
      route: "admin.test",
      authorize: () => true,
      body: bodySchema,
      ...options,
      execute,
    },
  );
}

beforeEach(() => {
  requireUser.mockReset();
  execute.mockClear();
  requireUser.mockResolvedValue({ id: "user-1", role: "admin" });
});

describe("handleAdminMutation's body cap", () => {
  it("holds an ordinary command to MAX_COMMAND_BODY_BYTES, to the byte", async () => {
    expect((await post(bodyOfSize(MAX_COMMAND_BODY_BYTES))).status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();

    execute.mockClear();
    const response = await post(bodyOfSize(MAX_COMMAND_BODY_BYTES + 1));
    expect(response.status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });

  it("lets a command that says so take more, and holds it to that, to the byte", async () => {
    const options = { maxBodyBytes: MAX_BULK_COMMAND_BODY_BYTES };

    expect(
      (await post(bodyOfSize(MAX_COMMAND_BODY_BYTES + 1), options)).status,
    ).toBe(200);
    expect(
      (await post(bodyOfSize(MAX_BULK_COMMAND_BODY_BYTES), options)).status,
    ).toBe(200);

    execute.mockClear();
    const response = await post(
      bodyOfSize(MAX_BULK_COMMAND_BODY_BYTES + 1),
      options,
    );
    expect(response.status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });

  it("measures bytes, not characters", async () => {
    // "é" is two bytes in UTF-8: half as many characters reach the limit.
    const characters = Math.floor(MAX_COMMAND_BODY_BYTES / 2);
    const response = await post(
      JSON.stringify({ padding: "é".repeat(characters) }),
    );
    expect(response.status).toBe(413);
  });
});
