import { z } from "zod";

import { env } from "@/lib/env";

/**
 * Spec 11's "Open Sandbox" — a signed, short-lived grant that lets an admin
 * view the learner experience *as* their own sandbox persona.
 *
 * This is impersonation, so it is deliberately the narrowest mechanism that
 * can do the job, and every one of these properties is load-bearing:
 *
 * - **Signed, not merely opaque.** HMAC-SHA256 via Web Crypto, reusing the
 *   pattern spec 07 established for lesson state (no JWT dependency). A
 *   forged cookie cannot grant a session.
 * - **Bound to both parties.** The grant names the admin who created it *and*
 *   the sandbox persona. Resolution re-checks, against the database, that the
 *   authenticated Clerk identity really is that admin and that the persona
 *   really is that admin's own sandbox. The cookie is a request; the database
 *   is the proof.
 * - **Short-lived.** Thirty minutes. A stale cookie in a closed laptop is not
 *   a standing impersonation grant.
 * - **Sandbox personas only.** The resolver refuses any target that is not
 *   `is_sandbox`, so this can never become a way to view a real learner's
 *   account.
 *
 * The signature protects integrity, not secrecy — nothing goes in the payload
 * that would be unsafe for its holder to read.
 */

export const SANDBOX_SESSION_COOKIE = "polyglot_sandbox_view";

/** Long enough for a real inspection pass, short enough that an abandoned session lapses on its own. */
export const SANDBOX_SESSION_TTL_SECONDS = 30 * 60;

const sandboxGrantSchema = z.object({
  /** Internal Polyglot user id of the admin who opened the sandbox. */
  adminUserId: z.string().min(1),
  /** Internal Polyglot user id of the sandbox persona being viewed. */
  sandboxUserId: z.string().min(1),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
});

export type SandboxGrant = z.infer<typeof sandboxGrantSchema>;

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
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedKey: Promise<CryptoKey> | null = null;

/**
 * The key material mixes a purpose string into the existing signing secret,
 * so a lesson-state token can never be replayed as a sandbox grant (or the
 * reverse) even though both derive from the same configured secret.
 */
function getSigningKey(): Promise<CryptoKey> {
  cachedKey ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`sandbox-view:${env.LESSON_STATE_SECRET}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

export async function signSandboxGrant(
  input: { adminUserId: string; sandboxUserId: string },
  now: number = Date.now(),
): Promise<string> {
  const grant: SandboxGrant = {
    adminUserId: input.adminUserId,
    sandboxUserId: input.sandboxUserId,
    issuedAt: now,
    expiresAt: now + SANDBOX_SESSION_TTL_SECONDS * 1000,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(grant));
  const signature = await crypto.subtle.sign("HMAC", await getSigningKey(), payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verifies signature, then shape, then expiry — in that order, so a malformed
 * or forged payload is never parsed as JSON on the strength of its own
 * claims. Returns `null` rather than throwing: an expired or absent grant is
 * an ordinary state (the admin simply isn't viewing the sandbox), not an
 * error worth surfacing.
 */
export async function verifySandboxGrant(token: string | undefined, now: number = Date.now()): Promise<SandboxGrant | null> {
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  let payloadBytes: Uint8Array<ArrayBuffer>;
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    payloadBytes = base64UrlDecode(payloadPart);
    signatureBytes = base64UrlDecode(signaturePart);
  } catch {
    return null;
  }

  const isValid = await crypto.subtle.verify("HMAC", await getSigningKey(), signatureBytes, payloadBytes);
  if (!isValid) return null;

  const parsed = sandboxGrantSchema.safeParse(JSON.parse(new TextDecoder().decode(payloadBytes)));
  if (!parsed.success) return null;
  if (parsed.data.expiresAt <= now) return null;

  return parsed.data;
}
