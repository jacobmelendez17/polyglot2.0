import { ADMIN_AUDIT_ACTIONS, type AdminAuditAction } from "@/domains/admin";

import type { CursorListCodec } from "../use-cursor-list";

/**
 * The audit log's state, and how it maps to and from the page's real URL (the
 * Logs page on React Admin). The URL is the single source of truth — a filtered
 * log is bookmarkable and survives a refresh — so nothing here lives in React
 * Admin's own router or store.
 *
 * The parameter names and their serialized order are the ones the Logs page
 * always used (`actor, action, resourceType, resourceId, from, to`, then
 * `cursor`), so links already in circulation keep working. The page's own `tab`
 * parameter is the *page's* business (which tab is open), never this list's: it
 * is ignored here and not written back, and the audit tab is the default.
 */

export type LogListFilters = {
  /** A user's Polyglot id. */
  actor?: string;
  action?: AdminAuditAction;
  resourceType?: string;
  resourceId?: string;
  /** A whole day, `YYYY-MM-DD`, inclusive. */
  from?: string;
  /** A whole day, `YYYY-MM-DD`, inclusive. */
  to?: string;
};

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The longest a resource type or id may be — the endpoint's own bound, so a value this accepts is never one it would refuse. */
const RESOURCE_TYPE_MAX = 100;
const RESOURCE_ID_MAX = 200;

function present(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** A calendar day that exists ("2026-02-30" does not), as `YYYY-MM-DD`. */
function realDay(value: unknown): string | undefined {
  const day = present(value);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const date = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day)
    ? day
    : undefined;
}

/**
 * Cleans a set of filter values — from the URL, or from an edit of the filter
 * form — down to what the endpoint will accept, discarding the rest. A value
 * that cannot be honoured is *dropped*, not sent to be refused: the old page
 * dropped a malformed actor id the same way, and for the same reason (a typo in
 * a filter box must not turn the whole page into an error).
 */
function clean(values: Record<string, unknown>): LogListFilters {
  const actor = present(values.actor);
  const action = ADMIN_AUDIT_ACTIONS.find((known) => known === values.action);
  const resourceType = present(values.resourceType);
  const resourceId = present(values.resourceId);
  return {
    actor: actor && UUID_SHAPE.test(actor) ? actor : undefined,
    action,
    resourceType:
      resourceType && resourceType.length <= RESOURCE_TYPE_MAX
        ? resourceType
        : undefined,
    resourceId:
      resourceId && resourceId.length <= RESOURCE_ID_MAX
        ? resourceId
        : undefined,
    from: realDay(values.from),
    to: realDay(values.to),
  };
}

type ParamsLike = { get(name: string): string | null };

export function parseLogListParams(params: ParamsLike): {
  filters: LogListFilters;
  cursor: string | undefined;
} {
  return {
    filters: clean({
      actor: params.get("actor"),
      action: params.get("action"),
      resourceType: params.get("resourceType"),
      resourceId: params.get("resourceId"),
      from: params.get("from"),
      to: params.get("to"),
    }),
    cursor: present(params.get("cursor")),
  };
}

/** The canonical query string for a log state. Empty values are omitted; the order is fixed. */
export function serializeLogListParams(
  filters: LogListFilters,
  cursor?: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.resourceType) params.set("resourceType", filters.resourceType);
  if (filters.resourceId) params.set("resourceId", filters.resourceId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (cursor) params.set("cursor", cursor);
  return params;
}

/**
 * Applies an edit from the filter form to the previous filters. The form sends
 * its whole set of values; every one is cleaned like a value from the URL, so a
 * half-typed actor id is simply not a filter yet.
 */
export function applyLogFilterChange(
  _previous: LogListFilters,
  requested: Record<string, unknown>,
): LogListFilters {
  return clean(requested);
}

/**
 * Whether moving between two states merely *refines* the text being typed (an
 * id or a resource type, a character at a time): that replaces the history entry
 * instead of stacking one per pause, as the curriculum search does. Picking an
 * action or a date is a new view.
 */
export function isLogRefinement(
  previous: LogListFilters,
  next: LogListFilters,
): boolean {
  const sameChoices =
    previous.action === next.action &&
    previous.from === next.from &&
    previous.to === next.to;
  const typing =
    previous.actor !== next.actor ||
    previous.resourceType !== next.resourceType ||
    previous.resourceId !== next.resourceId;
  return sameChoices && typing;
}

/** Whether any filter is set — what tells "nothing yet" from "nothing matches". */
export function hasActiveLogFilters(filters: LogListFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

export const logListCodec: CursorListCodec<LogListFilters> = {
  parse: parseLogListParams,
  serialize: serializeLogListParams,
  applyChange: applyLogFilterChange,
};
