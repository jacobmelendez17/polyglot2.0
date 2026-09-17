import { describe, expect, it } from "vitest";

import {
  SANDBOX_SESSION_TTL_SECONDS,
  signSandboxGrant,
  verifySandboxGrant,
} from "./sandbox-session-token";

const NOW = Date.parse("2026-03-01T12:00:00Z");
const GRANT = { adminUserId: "admin-1", sandboxUserId: "sandbox-1" };

describe("sandbox view grant", () => {
  it("round-trips a signed grant", async () => {
    const token = await signSandboxGrant(GRANT, NOW);
    const verified = await verifySandboxGrant(token, NOW);
    expect(verified).toMatchObject({ ...GRANT, issuedAt: NOW });
  });

  it("expires after the configured lifetime", async () => {
    const token = await signSandboxGrant(GRANT, NOW);
    expect(
      await verifySandboxGrant(
        token,
        NOW + SANDBOX_SESSION_TTL_SECONDS * 1000 - 1,
      ),
    ).not.toBeNull();
    expect(
      await verifySandboxGrant(token, NOW + SANDBOX_SESSION_TTL_SECONDS * 1000),
    ).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSandboxGrant(GRANT, NOW);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...GRANT,
        sandboxUserId: "someone-else",
        issuedAt: NOW,
        expiresAt: NOW + 60_000,
      }),
      "utf8",
    ).toString("base64url");
    expect(payload).not.toBe(forged);
    expect(await verifySandboxGrant(`${forged}.${signature}`, NOW)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await signSandboxGrant(GRANT, NOW);
    const [payload] = token.split(".");
    expect(await verifySandboxGrant(`${payload}.AAAA`, NOW)).toBeNull();
  });

  it("rejects malformed and absent tokens without throwing", async () => {
    expect(await verifySandboxGrant(undefined, NOW)).toBeNull();
    expect(await verifySandboxGrant("", NOW)).toBeNull();
    expect(await verifySandboxGrant("not-a-token", NOW)).toBeNull();
    expect(await verifySandboxGrant("only-one-part.", NOW)).toBeNull();
  });

  it("cannot be minted from a lesson-state token — the signing keys are purpose-separated", async () => {
    const { signLessonState } = await import("@/domains/lessons/lesson-token");
    const lessonToken = await signLessonState({
      sessionId: "s1",
      userId: "admin-1",
      languageId: "es-MX",
      languageCode: "es-MX",
      batch: [],
      viewedItemIds: [],
      phase: "study",
      issuedAt: NOW,
      expiresAt: NOW + 60_000,
    });
    expect(await verifySandboxGrant(lessonToken, NOW)).toBeNull();
  });
});
