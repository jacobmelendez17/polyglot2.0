import { env } from "@/lib/env";
import { ReviewError } from "@/lib/errors/review-errors";

import { reviewStateSchema } from "./review-schemas";
import type { ReviewState } from "./review-types";

/**
 * Server-signed ephemeral review-state token (spec 09 §6). HMAC-SHA256 via
 * Web Crypto — same mechanism and format as spec 07's
 * `domains/lessons/lesson-token.ts` (`<payload>.<signature>`, both
 * base64url), using a dedicated `REVIEW_STATE_SECRET` rather than reusing
 * `LESSON_STATE_SECRET` (spec 09 §6's explicit instruction). The signature
 * protects integrity only, not secrecy, so nothing unsafe for the learner
 * to read may go in the payload — and the server still reloads the real
 * `user_item_progress` row before completing an item (spec 09 §6); this
 * token is never authoritative SRS storage.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedKey: Promise<CryptoKey> | null = null;

function getSigningKey(): Promise<CryptoKey> {
  cachedKey ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.REVIEW_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

export async function signReviewState(state: ReviewState): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(state));
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export type VerifyReviewStateInput = {
  token: string;
  userId: string;
  languageId: string;
  now: number;
};

/**
 * Verifies signature, shape, expiration, and ownership (user + language) in
 * one call, mirroring spec 07 §8/§9/§74's lesson-token verification exactly.
 * Throws `ReviewError` with the specific structured code on any failure —
 * never returns a partially-trusted state.
 */
export async function verifyReviewState({
  token,
  userId,
  languageId,
  now,
}: VerifyReviewStateInput): Promise<ReviewState> {
  const parts = token.split(".");
  if (parts.length !== 2) throw new ReviewError("INVALID_REVIEW_STATE");
  const [payloadPart, signaturePart] = parts;

  let payloadBytes: Uint8Array<ArrayBuffer>;
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    payloadBytes = base64UrlDecode(payloadPart);
    signatureBytes = base64UrlDecode(signaturePart);
  } catch {
    throw new ReviewError("INVALID_REVIEW_STATE");
  }

  const key = await getSigningKey();
  const isValidSignature = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
  if (!isValidSignature) throw new ReviewError("INVALID_REVIEW_STATE");

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new ReviewError("INVALID_REVIEW_STATE");
  }

  const result = reviewStateSchema.safeParse(parsedPayload);
  if (!result.success) throw new ReviewError("INVALID_REVIEW_STATE");

  const state = result.data;
  if (state.userId !== userId) throw new ReviewError("INVALID_REVIEW_STATE");
  if (state.languageId !== languageId) throw new ReviewError("INVALID_REVIEW_STATE");
  if (now >= state.expiresAt) throw new ReviewError("EXPIRED_REVIEW_STATE");

  return state;
}
