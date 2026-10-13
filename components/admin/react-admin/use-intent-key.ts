import { useRef } from "react";

/**
 * The idempotency key for a form whose request can change between attempts
 * (spec 26 Unit 4's create and edit forms). One key stands for one *intent*:
 *
 * - **Retrying the same request after it failed reuses the key.** The server
 *   forgets a key whose transaction rolled back, but remembers one whose
 *   transaction committed — so if the answer to a request that *did* succeed
 *   was lost on the way back, sending it again with the same key is answered
 *   from the stored result instead of being applied twice.
 * - **A changed request gets a new key.** Editing a field and pressing Save
 *   again is a different request; under the old key the server would refuse it
 *   as "same key, different data".
 * - **A request that succeeded spends its key.** Whatever is sent next — even
 *   one identical to the last — is a new intent. Reusing the key would be
 *   answered from the stored result without doing anything: a save that says it
 *   worked and did not.
 *
 * (The review dialog needs none of this: its request cannot change while it is
 * open, so one key per dialog is exact.)
 */
export function useIntentKey() {
  const last = useRef<{ fingerprint: string; key: string } | null>(null);

  return {
    /** The key to send `request` (everything except the key itself) under. */
    keyFor(request: unknown): string {
      const fingerprint = JSON.stringify(request);
      if (last.current?.fingerprint !== fingerprint) {
        last.current = { fingerprint, key: crypto.randomUUID() };
      }
      return last.current.key;
    },
    /** The request succeeded: its key is spent. */
    completed(): void {
      last.current = null;
    },
  };
}
