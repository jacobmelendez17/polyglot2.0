import { HttpError } from "react-admin";

/**
 * What the Admin console's UI needs to decide between — not the server's
 * full code list. `unauthenticated`/`forbidden` get their own screens
 * (sign-in redirect / access denied) instead of an empty successful list
 * (spec 26 §3: "never return an empty successful list on authorization
 * failure"), and only some kinds are worth a retry button.
 */
export type AdminApiErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limited"
  | "unsupported"
  | "network"
  | "invalid_response"
  | "server";

const SAFE_MESSAGES: Record<AdminApiErrorKind, string> = {
  unauthenticated: "Your session has ended. Sign in again to continue.",
  forbidden: "You don't have access to this part of the admin console.",
  not_found: "That record could not be found.",
  conflict:
    "This changed after you opened it. Refresh to see the latest version.",
  validation: "That request could not be understood.",
  rate_limited: "Please slow down and try again shortly.",
  unsupported: "The admin console doesn't support that action.",
  network: "Couldn't reach the server. Check your connection and try again.",
  invalid_response:
    "The server sent a response the admin console couldn't read.",
  server: "Something went wrong on our side. Please try again.",
};

function kindFor(code: string, status: number): AdminApiErrorKind {
  switch (code) {
    case "UNAUTHENTICATED":
      return "unauthenticated";
    case "FORBIDDEN":
      return "forbidden";
    case "NOT_FOUND":
      return "not_found";
    case "CONFLICT":
      return "conflict";
    case "VALIDATION_FAILED":
      return "validation";
    case "RATE_LIMITED":
      return "rate_limited";
    case "UNSUPPORTED_OPERATION":
      return "unsupported";
    case "NETWORK_ERROR":
      return "network";
    case "INVALID_RESPONSE":
      return "invalid_response";
  }
  // An unrecognised code still carries a meaningful HTTP status.
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  if (status === 429) return "rate_limited";
  return "server";
}

/**
 * The failures whose *specific* wording is the point. "That item changed after
 * you opened it", "Archived items cannot be published", and "try again in
 * 17s" are written for the person reading them by the domain's own errors
 * (which never carry SQL or internals), and a generic sentence in their place
 * would hide what to do next. Everything else — sign-in, access, 5xx, network
 * — keeps a fixed message of ours, so a server fault never reaches a screen
 * verbatim.
 */
const SERVER_MESSAGE_KINDS: ReadonlySet<AdminApiErrorKind> = new Set([
  "conflict",
  "validation",
  "not_found",
  "rate_limited",
]);

const MAX_SERVER_MESSAGE_LENGTH = 200;

/** A server sentence reduced to something safe to render: plain, one line, bounded. */
function presentable(message: string | undefined): string | undefined {
  const cleaned = message?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, MAX_SERVER_MESSAGE_LENGTH) : undefined;
}

/**
 * The one error type that leaves the Admin data layer. It extends React
 * Admin's own `HttpError` so the library's access-denied handling —
 * `authProvider.checkError` receives it and reads `.status` — works without
 * any adapter, while adding the stable `code` and a UI-oriented `kind`.
 *
 * Messages come from `SAFE_MESSAGES`, except for the 4xx kinds in
 * `SERVER_MESSAGE_KINDS`, where the server's own user-facing sentence is
 * used when it sent one.
 */
export class AdminApiError extends HttpError {
  readonly code: string;
  readonly kind: AdminApiErrorKind;
  /** For logs and tests only (e.g. which operation was refused) — never rendered. */
  readonly detail: string | undefined;
  /** Seconds the server asked a rate-limited caller to wait (`Retry-After`). */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: string,
    status: number,
    detail?: string,
    options: { serverMessage?: string; retryAfterSeconds?: number } = {},
  ) {
    const kind = kindFor(code, status);
    super(
      (SERVER_MESSAGE_KINDS.has(kind)
        ? presentable(options.serverMessage)
        : undefined) ?? SAFE_MESSAGES[kind],
      status,
      { error: { code } },
    );
    // `HttpError`'s constructor pins the prototype to `HttpError.prototype`
    // (to survive transpilation to ES5), which would make this subclass
    // fail `instanceof AdminApiError`. Restore it.
    Object.setPrototypeOf(this, AdminApiError.prototype);
    this.name = "AdminApiError";
    this.code = code;
    this.kind = kind;
    this.detail = detail;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError;
}

export type AdminErrorDescription = {
  kind: AdminApiErrorKind;
  message: string;
  /** Whether trying the same request again could plausibly succeed. */
  retryable: boolean;
};

const RETRYABLE_KINDS: ReadonlySet<AdminApiErrorKind> = new Set([
  "network",
  "server",
  "rate_limited",
  "invalid_response",
]);

/** What a screen should say and offer for any failure, known or not. */
export function describeAdminError(error: unknown): AdminErrorDescription {
  if (!isAdminApiError(error)) {
    return {
      kind: "server",
      message: SAFE_MESSAGES.server,
      retryable: true,
    };
  }
  return {
    kind: error.kind,
    message: error.message,
    retryable: RETRYABLE_KINDS.has(error.kind),
  };
}
