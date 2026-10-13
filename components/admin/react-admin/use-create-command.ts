import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  describeAdminError,
  type AdminApiError,
  type AdminErrorDescription,
} from "./admin-api-error";
import { useIntentKey } from "./use-intent-key";

/**
 * The flow behind every Admin "add one" dialog (spec 26 Units 4-5): send the
 * request under the right idempotency key, show a refusal in the dialog with
 * what was typed kept, and on success mark the lists stale and hand the result
 * on.
 *
 * The request can change between attempts (a taken level number is fixed and
 * sent again), so its key follows the *request* (`useIntentKey`), never one key
 * for the dialog. A dialog unmounts on success, so no key needs spending here;
 * a form that stays mounted after saving must (see `useEditCommand`).
 */
export function useCreateCommand<Request extends object, Result>({
  resource,
  send,
  onCreated,
}: {
  /** The query-key prefix of the lists the new record appears in; marked stale on success. */
  resource: string;
  /** The explicit command. `idempotencyKey` is the one for this intent. */
  send: (request: Request, idempotencyKey: string) => Promise<Result>;
  /** What to do with the new record — typically close the dialog and go to its page. */
  onCreated: (result: Result) => void;
}) {
  const queryClient = useQueryClient();
  const keys = useIntentKey();
  const [failure, setFailure] = useState<AdminErrorDescription | null>(null);

  const mutation = useMutation<
    Result,
    AdminApiError,
    { request: Request; idempotencyKey: string }
  >({
    mutationFn: ({ request, idempotencyKey }) => send(request, idempotencyKey),
    // A command is retried by a person pressing the button again, under the
    // rule in `useIntentKey` — never automatically.
    retry: false,
  });

  async function create(request: Request): Promise<void> {
    setFailure(null);
    try {
      const result = await mutation.mutateAsync({
        request,
        idempotencyKey: keys.keyFor(request),
      });
      void queryClient.invalidateQueries({ queryKey: [resource] });
      onCreated(result);
    } catch (error) {
      setFailure(describeAdminError(error));
    }
  }

  return { create, pending: mutation.isPending, failure };
}
