import { env } from "@/lib/env";
import { LessonError } from "@/lib/errors/lesson-errors";

import { lessonStateSchema } from "./lesson-schemas";
import type { LessonState } from "./lesson-types";

/**
 * Server-signed ephemeral lesson-state token (spec 07 §5, §8). HMAC-SHA256
 * via Web Crypto, per §8's explicit instruction that this is sufficient and
 * preferable to adding a JWT dependency. Format: `<payload>.<signature>`,
 * both base64url — the signature protects integrity only, not secrecy
 * (§8), so nothing unsafe for the learner to read may go in the payload.
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
    new TextEncoder().encode(env.LESSON_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

export async function signLessonState(state: LessonState): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(state));
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export type VerifyLessonStateInput = {
  token: string;
  userId: string;
  languageId: string;
  now: number;
};

/**
 * Verifies signature, shape, expiration, and ownership (user + language) in
 * one call, per spec 07 §8/§9/§74. Throws `LessonError` with the specific
 * structured code on any failure — never returns a partially-trusted state.
 */
export async function verifyLessonState({
  token,
  userId,
  languageId,
  now,
}: VerifyLessonStateInput): Promise<LessonState> {
  const parts = token.split(".");
  if (parts.length !== 2) throw new LessonError("LESSON_STATE_INVALID");
  const [payloadPart, signaturePart] = parts;

  let payloadBytes: Uint8Array<ArrayBuffer>;
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    payloadBytes = base64UrlDecode(payloadPart);
    signatureBytes = base64UrlDecode(signaturePart);
  } catch {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const key = await getSigningKey();
  const isValidSignature = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
  if (!isValidSignature) throw new LessonError("LESSON_STATE_INVALID");

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const result = lessonStateSchema.safeParse(parsedPayload);
  if (!result.success) throw new LessonError("LESSON_STATE_INVALID");

  const state = result.data;
  if (state.userId !== userId) throw new LessonError("LESSON_STATE_INVALID");
  if (state.languageId !== languageId) throw new LessonError("LESSON_STATE_INVALID");
  if (now >= state.expiresAt) throw new LessonError("LESSON_STATE_EXPIRED");

  return state;
}
