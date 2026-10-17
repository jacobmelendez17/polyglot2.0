"use client";

import { useRef } from "react";

import { setAnalyticsConsentAction } from "@/app/(app)/settings/privacy/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type AnalyticsConsentFieldProps = {
  /** Whether a current acceptance is stored. Never true for a learner who has not chosen. */
  initialAccepted: boolean;
  /** The revision the server holds for this choice, or `null` when nothing is stored yet. */
  initialRevision: number | null;
};

/**
 * Spec 27 Unit 27.2 — the analytics consent switch. It is the ordinary Settings
 * toggle (flipping only changes the draft; Save and Cancel stay on screen), plus
 * the one thing consent needs that other toggles do not: it tells the server
 * which revision of the choice it is looking at.
 *
 * That revision is what lets the server refuse a stale request. If the choice
 * was changed from another device since this page loaded, saving an acceptance
 * is answered with "changed elsewhere" instead of silently overwriting the newer
 * decision. A withdrawal always goes through.
 *
 * The page is rendered by the server from the stored choice, so a device that
 * opens Settings always starts from what the server holds, never from anything
 * this browser remembered.
 */
export function AnalyticsConsentField({
  initialAccepted,
  initialRevision,
}: AnalyticsConsentFieldProps) {
  // What the server last told this page. Bookkeeping, not display, so a ref: it
  // must not re-render the field, and it moves forward only after a save lands.
  const revisionRef = useRef(initialRevision);

  return (
    <InlineToggleSettingField
      label="Share anonymous usage analytics"
      description="Events are filed under a random ID, never your name or email."
      initialValue={initialAccepted}
      onSave={async (accepted) => {
        const result = await setAnalyticsConsentAction({
          status: accepted ? "accepted" : "declined",
          expectedRevision: revisionRef.current,
        });
        if (!result.ok) return { ok: false, message: result.error.message };

        revisionRef.current = result.data.revision;
        return { ok: true, value: result.data.status === "accepted" };
      }}
    />
  );
}
