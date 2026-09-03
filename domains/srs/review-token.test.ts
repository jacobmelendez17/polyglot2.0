import { describe, expect, it } from "vitest";

import { signReviewState, verifyReviewState } from "./review-token";
import type { ReviewState } from "./review-types";

const NOW = Date.parse("2026-01-01T00:00:00Z");

function makeState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    sessionId: "session-1",
    userId: "user-1",
    languageId: "es-MX",
    questions: [{ id: "gato::targetToEnglish", itemId: "gato", itemType: "vocabulary", direction: "targetToEnglish" }],
    queue: ["gato::targetToEnglish"],
    satisfiedQuestionIds: [],
    failedQuestionIds: [],
    completedItemIds: [],
    itemSnapshots: [{ itemId: "gato", stage: "beginner_1", version: 0, levelNumber: 1 }],
    stats: { itemsTotal: 1, itemsCompleted: 0, questionsAttempted: 0, questionsCorrect: 0 },
    issuedAt: NOW,
    expiresAt: NOW + 60 * 60 * 1000,
    ...overrides,
  };
}

describe("review token signing", () => {
  it("round-trips a signed state", async () => {
    const state = makeState();
    const token = await signReviewState(state);
    const verified = await verifyReviewState({ token, userId: "user-1", languageId: "es-MX", now: NOW });
    expect(verified).toEqual(state);
  });

  it("rejects a malformed token", async () => {
    await expect(
      verifyReviewState({ token: "not-a-token", userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID_REVIEW_STATE" });
  });

  it("rejects a token with a tampered payload", async () => {
    const token = await signReviewState(makeState());
    const [payload, signature] = token.split(".");
    const tamperedPayload = payload.slice(0, -2) + (payload.at(-2) === "A" ? "B" : "A") + payload.at(-1);
    const tampered = `${tamperedPayload}.${signature}`;

    await expect(
      verifyReviewState({ token: tampered, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID_REVIEW_STATE" });
  });

  it("rejects a token with a tampered signature", async () => {
    const token = await signReviewState(makeState());
    const [payload, signature] = token.split(".");
    const tamperedSignature = signature.slice(0, -2) + (signature.at(-2) === "A" ? "B" : "A") + signature.at(-1);
    const tampered = `${payload}.${tamperedSignature}`;

    await expect(
      verifyReviewState({ token: tampered, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID_REVIEW_STATE" });
  });

  it("rejects an expired token", async () => {
    const state = makeState({ expiresAt: NOW - 1 });
    const token = await signReviewState(state);

    await expect(
      verifyReviewState({ token, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "EXPIRED_REVIEW_STATE" });
  });

  it("rejects a token presented by a different user", async () => {
    const token = await signReviewState(makeState({ userId: "user-1" }));

    await expect(
      verifyReviewState({ token, userId: "user-2", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID_REVIEW_STATE" });
  });

  it("rejects a token presented for a different language", async () => {
    const token = await signReviewState(makeState({ languageId: "es-MX" }));

    await expect(
      verifyReviewState({ token, userId: "user-1", languageId: "fr-FR", now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID_REVIEW_STATE" });
  });

  it("rejects a token missing required fields", async () => {
    const state = makeState();
    const payloadBytes = new TextEncoder().encode(JSON.stringify({ ...state, sessionId: undefined }));
    const fakeToken = `${Buffer.from(payloadBytes).toString("base64url")}.deadbeef`;

    await expect(
      verifyReviewState({ token: fakeToken, userId: "user-1", languageId: "es-MX", now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID_REVIEW_STATE" });
  });
});
