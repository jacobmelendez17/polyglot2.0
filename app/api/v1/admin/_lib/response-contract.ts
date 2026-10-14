import type { z } from "zod";

/**
 * Checks what a route is about to *send* against its contract.
 *
 * A `ZodError` thrown inside a route's `load` / `execute` is answered as "422,
 * that request could not be understood" (`mapAdminApiError`) — right for the
 * request's own path and query, wrong for our own answer: a service that hands
 * back something the contract does not describe is a server fault. It must
 * reach the error log and a generic 500, not be blamed on the caller (and
 * logged as a client error nobody would look at).
 *
 * The message names the fields that disagree and never their values: a value
 * can be someone's name or email, and this reaches the log.
 */
export function parseResponse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const where = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"} (${issue.code})`)
    .join(", ");
  throw new Error(`A response did not match its contract: ${where}`);
}
