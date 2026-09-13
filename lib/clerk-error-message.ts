import { isClerkAPIResponseError } from "@clerk/nextjs";

/**
 * Extracts a safe, user-facing message from a Clerk client-SDK error (spec
 * 20 Account — Email & Password custom flows: `user.createEmailAddress`,
 * `EmailAddressResource.prepareVerification`/`attemptVerification`,
 * `user.updatePassword`, all of which reject with a `ClerkAPIResponseError`
 * on an expected failure — a taken email, a wrong code, a weak/pwned
 * password). Falls back to a generic message for anything else, so an
 * unexpected error never leaks internal detail to the UI.
 */
export function getClerkErrorMessage(error: unknown, fallback: string): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    return first?.longMessage ?? first?.message ?? fallback;
  }
  return fallback;
}
