import type { Register } from "@/db/schema";

/**
 * The register field's editor representation and its two conversions.
 *
 * Deliberately a plain module, separate from `register-select.tsx`, which is
 * `"use client"`. A `"use client"` file's non-component exports cannot be
 * *called* from a server component — only rendered, or passed as props — so
 * a server page mapping a stored `register` into an editor value has to
 * import these from somewhere outside the client boundary. Keeping them here
 * is what lets the admin item page and the learner item page's admin slots
 * (both server components) share exactly the same conversion the editor uses.
 */

/** The editor's representation of "no register chosen". `Select` cannot hold an empty string as a value, so unset needs a real sentinel. */
export const REGISTER_UNSET = "unset";

export type RegisterEditorValue = Register | typeof REGISTER_UNSET;

/** Editor value → payload. The sentinel becomes the `null` the database and domain both mean by "unclassified". */
export function registerPayload(value: RegisterEditorValue): Register | null {
  return value === REGISTER_UNSET ? null : value;
}

/** Stored value → editor value. */
export function toRegisterEditorValue(
  register: Register | null | undefined,
): RegisterEditorValue {
  return register ?? REGISTER_UNSET;
}
