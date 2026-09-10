"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REGISTER_LABELS } from "@/domains/curriculum";
import type { Register } from "@/db/schema";

/** The editor's representation of "no register chosen". `Select` cannot hold an empty string as a value, so unset needs a real sentinel. */
export const REGISTER_UNSET = "unset";

export type RegisterEditorValue = Register | typeof REGISTER_UNSET;

type RegisterSelectProps = {
  value: RegisterEditorValue;
  onChange: (next: RegisterEditorValue) => void;
};

/**
 * The one register control (spec 18), shared by the vocabulary editor, the
 * grammar editor, and the item page — so the option list and its labels
 * cannot drift between the two entry points spec 18 requires.
 *
 * "Not set" is a real, selectable option rather than an absence: most items
 * genuinely have no register, and an admin needs to be able to put one back
 * to unclassified after setting it by mistake.
 */
export function RegisterSelect({ value, onChange }: RegisterSelectProps) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">Register</span>
      <Select value={value} onValueChange={(next) => onChange(next as RegisterEditorValue)}>
        <SelectTrigger className="mt-1 w-full" aria-label="Register">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={REGISTER_UNSET}>Not set</SelectItem>
          {(Object.keys(REGISTER_LABELS) as Register[]).map((register) => (
            <SelectItem key={register} value={register}>
              {REGISTER_LABELS[register]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/** Editor value → payload. The sentinel becomes the `null` the database and domain both mean by "unclassified". */
export function registerPayload(value: RegisterEditorValue): Register | null {
  return value === REGISTER_UNSET ? null : value;
}

/** Stored value → editor value. */
export function toRegisterEditorValue(register: Register | null | undefined): RegisterEditorValue {
  return register ?? REGISTER_UNSET;
}
