import { useQueryClient } from "@tanstack/react-query";

import { useCreateCommand } from "../use-create-command";

/**
 * Everything a bulk command makes stale besides the curriculum list itself
 * (`useCreateCommand` marks that one): the review queue holds these items'
 * pending and draft rows, and the Overview's counts are made of their
 * statuses. Only what is on screen refetches; the rest is marked stale for
 * next time.
 */
const ALSO_STALE = ["review", "overview"] as const;

/**
 * The flow behind every bulk curriculum command (spec 26 Unit 7): send the
 * request under an idempotency key, show a refusal in the dialog, and on
 * success mark the lists stale and hand the result on.
 *
 * It is `useCreateCommand` — so the key follows the *request*, never the
 * dialog: pressing "Try again" after a failure sends the same request under
 * the same key (a request that reached the server but lost its answer is
 * answered from the stored result instead of being applied twice), and
 * choosing a different target sends a different request under a new one. A
 * dialog unmounts on success, so a spent key is never reused.
 *
 * Deliberately **no automatic retry**: a command is retried by a person
 * pressing the button again.
 */
export function useBulkCurriculumCommand<Request extends object, Result>({
  send,
  onDone,
}: {
  /** The explicit command. `idempotencyKey` is the one for this intent. */
  send: (request: Request, idempotencyKey: string) => Promise<Result>;
  /** What to do once it succeeded — say so, clear the selection, close the dialog. */
  onDone: (result: Result) => void;
}) {
  const queryClient = useQueryClient();

  return useCreateCommand<Request, Result>({
    resource: "curriculum",
    send,
    onCreated: (result) => {
      for (const resource of ALSO_STALE) {
        void queryClient.invalidateQueries({ queryKey: [resource] });
      }
      onDone(result);
    },
  });
}
