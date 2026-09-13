"use client";

import { updateNameAction } from "@/app/(app)/settings/account/actions";
import { InlineTextSettingField } from "@/components/settings/inline-text-setting-field";

type NameFieldProps = {
  initialName: string | null;
};

/** Spec 20 Account — Name. See `InlineTextSettingField` for the shared save/edit interaction it wraps. */
export function NameField({ initialName }: NameFieldProps) {
  return (
    <InlineTextSettingField
      label="Name"
      initialValue={initialName}
      onSave={async (displayName) => {
        const result = await updateNameAction({ displayName });
        return result.ok ? { ok: true, value: result.data.displayName } : { ok: false, message: result.error.message };
      }}
    />
  );
}
