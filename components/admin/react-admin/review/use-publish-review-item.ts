import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataProvider } from "react-admin";

import type {
  AdminReviewPublishRequest,
  AdminReviewPublishResult,
} from "@/domains/admin";

import type { AdminApiError } from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";

/**
 * Everything a successful publish makes stale, by React Admin's query-key
 * prefix (`[resource, method, ...]`): the queue lost a row, the curriculum
 * list shows a new status, and the Overview's counts moved. Only the ones
 * currently on screen refetch; the rest are marked stale for next time.
 */
const STALE_AFTER_PUBLISH = ["review", "curriculum", "overview"] as const;

/**
 * Publishes one queued item through the provider's explicit command (spec 26
 * Unit 3) — not through a generic `update`.
 *
 * Deliberately **no automatic retry**: a command is retried by a person
 * pressing the button again, with the *same* idempotency key (the dialog owns
 * it), so a request that reached the server but lost its answer is answered
 * from the stored result instead of publishing twice.
 */
export function usePublishReviewItem() {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const queryClient = useQueryClient();

  return useMutation<
    AdminReviewPublishResult,
    AdminApiError,
    AdminReviewPublishRequest
  >({
    mutationFn: (input) => dataProvider.publishReviewItem(input),
    retry: false,
    onSuccess: () =>
      Promise.all(
        STALE_AFTER_PUBLISH.map((resource) =>
          queryClient.invalidateQueries({ queryKey: [resource] }),
        ),
      ),
  });
}

/** Marks the queue stale and re-reads it — what "Reload" means after a conflict. */
export function useReloadReview() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["review"] });
}
