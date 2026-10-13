import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  describeAdminError,
  type AdminApiError,
  type AdminErrorDescription,
} from "./admin-api-error";
import { useIntentKey } from "./use-intent-key";

export type EditCommandConfig<
  Fields,
  Changes extends object,
  Impact,
  Values,
> = {
  /** The thing being changed. Part of what makes one save "the same request" as another. */
  id: string;
  /** The query-key prefix of the lists this resource appears in; marked stale after a save. */
  resource: string;
  /** What the server holds, as far as the screen knows when it mounts. */
  initial: Fields;
  /** Reads the form's values as fields (a blank name is "none", and so on). */
  read: (values: Values, baseline: Fields) => Fields;
  /** Only the fields that differ, in a fixed key order (equal changes are equal strings). */
  changed: (baseline: Fields, next: Fields) => Changes;
  /** What the person must confirm before this change is saved, or `null` if nothing. */
  impactOf: (from: Fields, to: Fields) => Impact | null;
  /** The explicit command. `idempotencyKey` is the one for this intent. */
  send: (changes: Changes, idempotencyKey: string) => Promise<unknown>;
};

/** A save held back until the person confirms what it will do. */
type Confirming<Fields, Changes, Impact> = {
  changes: Changes;
  from: Fields;
  to: Fields;
  impact: Impact;
};

/**
 * The state machine behind every Admin "edit one record" form (spec 26 Units
 * 4-5: a level's properties, a group's): what the server holds, what changed,
 * what needs confirming, what the server said, and what to do when it said yes.
 *
 * It owns the rules that must not drift between forms:
 *
 * - **Only what changed is sent.** A record with no version to check is saved
 *   last-write-wins; sending just the changed fields keeps an edit to one field
 *   from overwriting another that someone else changed meanwhile.
 * - **An impactful change asks first.** `impactOf` decides; until the person
 *   confirms, nothing is sent.
 * - **Idempotency follows `useIntentKey`** — an identical retry of a failed save
 *   reuses its key, a changed save gets a new one.
 * - **After a save**: the baseline moves forward (which is also what resets the
 *   form to "unchanged"), the lists the record appears in are marked stale, and
 *   the page is asked to re-render, because its heading and any specialist
 *   beneath the form are rendered by the server.
 *
 * A refusal is *shown*, never thrown: `failure` carries it, with what was typed
 * kept, so it can be fixed and sent again.
 */
export function useEditCommand<Fields, Changes extends object, Impact, Values>(
  config: EditCommandConfig<Fields, Changes, Impact, Values>,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const keys = useIntentKey();

  const [baseline, setBaseline] = useState<Fields>(config.initial);
  const [confirming, setConfirming] = useState<Confirming<
    Fields,
    Changes,
    Impact
  > | null>(null);
  const [failure, setFailure] = useState<AdminErrorDescription | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation<
    unknown,
    AdminApiError,
    { changes: Changes; idempotencyKey: string }
  >({
    mutationFn: ({ changes, idempotencyKey }) =>
      config.send(changes, idempotencyKey),
    // A command is retried by a person pressing the button again.
    retry: false,
  });

  /** Sends the change. Resolves whether it was accepted; a refusal is shown, not thrown. */
  async function apply(changes: Changes, next: Fields): Promise<boolean> {
    setFailure(null);
    try {
      await mutation.mutateAsync({
        changes,
        idempotencyKey: keys.keyFor({ id: config.id, ...changes }),
      });
      // Spent. Moving the baseline below already makes an identical next
      // request impossible (it would change nothing), so this is belt and
      // braces — but it states the rule, for whoever decouples the two.
      keys.completed();
      setBaseline(next);
      setSaved(true);
      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: [config.resource] });
      router.refresh();
      return true;
    } catch (error) {
      setFailure(describeAdminError(error));
      return false;
    }
  }

  /** The form's `onSubmit`. */
  async function submit(values: Values) {
    const next = config.read(values, baseline);
    const changes = config.changed(baseline, next);
    if (Object.keys(changes).length === 0) return;

    setSaved(false);
    setFailure(null);
    const impact = config.impactOf(baseline, next);
    if (impact) {
      setConfirming({ changes, from: baseline, to: next, impact });
      return;
    }
    await apply(changes, next);
  }

  return {
    /** What the server holds, as far as the screen knows. */
    baseline,
    /** A save went through since the form last changed. */
    saved,
    failure,
    saving: mutation.isPending,
    /** A save held back for confirmation, with what it would do. */
    confirming: confirming
      ? { from: confirming.from, to: confirming.to, impact: confirming.impact }
      : null,
    submit,
    /** The person confirmed the held-back save. */
    confirm: () => {
      if (confirming) void apply(confirming.changes, confirming.to);
    },
    /** The person declined it. Nothing was sent, and the failure (if any) is forgotten. */
    cancel: () => {
      setConfirming(null);
      setFailure(null);
    },
    /** Whether the form's current values differ from what is saved. */
    differs: (values: Values) =>
      Object.keys(config.changed(baseline, config.read(values, baseline)))
        .length > 0,
  };
}
