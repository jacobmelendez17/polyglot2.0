import { describe, expect, it } from "vitest";

import { signLessonState, verifyLessonState } from "./lesson-token";
import type { LessonState } from "./lesson-types";

const NOW = Date.parse("2026-01-01T00:00:00Z");

function makeState(overrides: Partial<LessonState> = {}): LessonState {
  return {
    sessionId: "session-1",
    userId: "user-1",
    languageId: "es-MX",
    batch: [{ itemId: "vocab-gato", itemType: "vocabulary" }],
    viewedItemIds: [],
    phase: "study",
    issuedAt: NOW,
    expiresAt: NOW + 60 * 60 * 1000,
    ...overrides,
  };
}

describe("lesson token signing", () => {
  it("round-trips a signed state", async () => {
    const state = makeState();
    const token = await signLessonState(state);
    const verified = await verifyLessonState({ token, userId: "user-1", languageId: "es-MX", now: NOW });
    expect(verified).toEqual(state);
  });

  it("rejects a malformed token", async () => {
    await expect(
      verifyLessonState({ token: "not-a-token", userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_STATE_INVALID" });
  });

  it("rejects a token with a tampered payload", async () => {
    const token = await signLessonState(makeState());
    const [payload, signature] = token.split(".");
    const tamperedPayload = payload.slice(0, -2) + (payload.at(-2) === "A" ? "B" : "A") + payload.at(-1);
    const tampered = `${tamperedPayload}.${signature}`;

    await expect(
      verifyLessonState({ token: tampered, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_STATE_INVALID" });
  });

  it("rejects a token with a tampered signature", async () => {
    const token = await signLessonState(makeState());
    const [payload, signature] = token.split(".");
    const tamperedSignature = signature.slice(0, -2) + (signature.at(-2) === "A" ? "B" : "A") + signature.at(-1);
    const tampered = `${payload}.${tamperedSignature}`;

    await expect(
      verifyLessonState({ token: tampered, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_STATE_INVALID" });
  });

  it("rejects an expired token", async () => {
    const state = makeState({ expiresAt: NOW - 1 });
    const token = await signLessonState(state);

    await expect(
      verifyLessonState({ token, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_STATE_EXPIRED" });
  });

  it("rejects a token presented by a different user", async () => {
    const token = await signLessonState(makeState({ userId: "user-1" }));

    await expect(
      verifyLessonState({ token, userId: "user-2", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_STATE_INVALID" });
  });

  it("rejects a token presented for a different language", async () => {
    const token = await signLessonState(makeState({ languageId: "es-MX" }));

    await expect(
      verifyLessonState({ token, userId: "user-1", languageId: "fr-FR", now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_STATE_INVALID" });
  });

  it("rejects a token missing required fields", async () => {
    const state = makeState();
    const payloadBytes = new TextEncoder().encode(JSON.stringify({ ...state, sessionId: undefined }));
    const fakeToken = `${Buffer.from(payloadBytes).toString("base64url")}.deadbeef`;

    await expect(
      verifyLessonState({ token: fakeToken, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_STATE_INVALID" });
  });
});
