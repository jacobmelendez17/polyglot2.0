"use client";

import { updateUsernameAction } from "@/app/(app)/settings/account/actions";
import { InlineTextSettingField } from "@/components/settings/inline-text-setting-field";

type UsernameFieldProps = {
  initialUsername: string | null;
};

/** Spec 20 Account — Username. See `InlineTextSettingField` for the shared save/edit interaction it wraps. */
export function UsernameField({ initialUsername }: UsernameFieldProps) {
  return (
    <InlineTextSettingField
      label="Username"
      initialValue={initialUsername}
      onSave={async (username) => {
        const result = await updateUsernameAction({ username });
        return result.ok ? { ok: true, value: result.data.username } : { ok: false, message: result.error.message };
      }}
    />
  );
}
