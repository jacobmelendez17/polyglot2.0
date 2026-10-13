import { z } from "zod";

import { adminApiErrorSchema } from "@/domains/admin";

import { AdminApiError } from "./admin-api-error";

export const ADMIN_API_BASE = "/api/v1/admin";

/** code-standards.md's success envelope: `{ data }`. The payload is checked separately, against the caller's own schema. */
const successEnvelopeSchema = z.object({ data: z.unknown() });

type RequestOptions = {
  signal?: AbortSignal;
  /** Injected in tests; the browser's own `fetch` otherwise. */
  fetcher?: typeof fetch;
  /**
   * A command: a `POST` whose JSON body is the request. Omitted, the request
   * is a `GET`. The browser adds `Origin` and `Sec-Fetch-Site` itself, which
   * is what the server's same-origin check reads — nothing here sets them.
   */
  body?: unknown;
};

/**
 * The single place the Admin console talks HTTP: a same-origin, cookie-
 * authenticated request to `/api/v1/admin/*` whose answer is checked against
 * the shared contract (`domains/admin`) before anything else sees it.
 *
 * Authentication is the Clerk session cookie the browser already holds. No
 * token, user id, or role is ever sent from here — the server derives who is
 * asking from the session and the database, which is the whole point. In
 * particular a command's body never names an actor.
 *
 * Failures all surface as `AdminApiError`. The one exception is an aborted
 * request, which is re-thrown untouched so React Query's cancellation keeps
 * working.
 */
export async function requestAdminApi<S extends z.ZodType>(
  path: string,
  dataSchema: S,
  { signal, fetcher = fetch, body: commandBody }: RequestOptions = {},
): Promise<z.infer<S>> {
  const isCommand = commandBody !== undefined;
  let response: Response;
  try {
    response = await fetcher(`${ADMIN_API_BASE}${path}`, {
      method: isCommand ? "POST" : "GET",
      headers: isCommand
        ? { Accept: "application/json", "Content-Type": "application/json" }
        : { Accept: "application/json" },
      body: isCommand ? JSON.stringify(commandBody) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AdminApiError("NETWORK_ERROR", 0);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = adminApiErrorSchema.safeParse(body);
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new AdminApiError(
      parsed.success ? parsed.data.error.code : "UNKNOWN",
      response.status,
      undefined,
      {
        serverMessage: parsed.success ? parsed.data.error.message : undefined,
        retryAfterSeconds:
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter
            : undefined,
      },
    );
  }

  const envelope = successEnvelopeSchema.safeParse(body);
  const payload = envelope.success
    ? dataSchema.safeParse(envelope.data.data)
    : null;
  if (!payload?.success) {
    throw new AdminApiError("INVALID_RESPONSE", 500);
  }
  return payload.data;
}
