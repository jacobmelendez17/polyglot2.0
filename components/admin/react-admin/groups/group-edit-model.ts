import {
  CURRICULUM_STATUSES,
  GROUP_NAME_MAX,
  type AdminGroupUpdateRequest,
} from "@/domains/admin";

import type { StatusImpact } from "../status-impact";

/**
 * The group forms' logic, apart from React so each rule can be stated and
 * tested on its own (spec 26 Unit 5).
 */

export type GroupStatus = (typeof CURRICULUM_STATUSES)[number];

/** A group's editable metadata, as the server holds it. A group always has a name. */
export type GroupFields = {
  name: string;
  status: GroupStatus;
};

/** What the form's inputs hold: strings (a blank one arrives as `null`) and whatever the select last chose. */
export type GroupFormValues = {
  name?: string | null;
  status?: string | null;
};

/**
 * The name rule, as the form states it — the same one the endpoint enforces
 * (trimmed, not empty, at most `GROUP_NAME_MAX`), so what the form accepts is
 * what the server will, and the person is told in the form's own words rather
 * than by a refusal. Returns the message, or nothing when the name is fine.
 */
export function checkGroupName(value: unknown): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "") return "Enter a name for this group.";
  if (name.length > GROUP_NAME_MAX) {
    return `Keep the name to ${GROUP_NAME_MAX} characters or fewer.`;
  }
  return undefined;
}

/**
 * Reads the form's values as group fields. The name is trimmed. A name that is
 * blank (which the form's own check refuses before this is ever asked) and a
 * status that is not one of the known values keep what the group had, rather
 * than guess.
 */
export function readGroupFields(
  values: GroupFormValues,
  current: GroupFields,
): GroupFields {
  const name = values.name?.trim() ?? "";
  return {
    name: name === "" ? current.name : name,
    status:
      CURRICULUM_STATUSES.find((status) => status === values.status) ??
      current.status,
  };
}

/**
 * Only the fields that differ from what the server holds. Sending just these is
 * how the screen narrows last-write-wins: a group has no version to check, so
 * an edit to the name must not also re-send (and so overwrite) a status another
 * Admin changed in the meantime.
 *
 * Key order is fixed, so equal changes are equal strings (see `useIntentKey`).
 */
export function changedFields(
  baseline: GroupFields,
  next: GroupFields,
): Omit<AdminGroupUpdateRequest, "idempotencyKey"> {
  const changes: Omit<AdminGroupUpdateRequest, "idempotencyKey"> = {};
  if (next.name !== baseline.name) changes.name = next.name;
  if (next.status !== baseline.status) changes.status = next.status;
  return changes;
}

/**
 * Whether a change of status needs an explicit confirmation, and what to tell
 * the person. Only **archiving** does, as it did before this screen moved to
 * React Admin: it takes a group out of active use, which is a meaningful change
 * (spec 26 §5: a save must not carry one through as a side effect). Every other
 * move saves directly — and a group's own status is not what hides its content
 * from learners (the level's and each item's are), so nothing else here changes
 * what they see.
 *
 * Stated only as far as the code guarantees it: archived groups stay on record,
 * and items keep their group.
 */
export function statusImpact(
  name: string,
  from: GroupStatus,
  to: GroupStatus,
): StatusImpact | null {
  if (from === to || to !== "archived") return null;
  return {
    title: `Archive “${name}”?`,
    body: "Archived groups stay on record but are no longer active for new curriculum. Existing vocabulary items keep their group assignment.",
    confirmLabel: "Archive",
    destructive: true,
  };
}
