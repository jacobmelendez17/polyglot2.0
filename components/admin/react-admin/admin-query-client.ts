import { QueryClient } from "@tanstack/react-query";

import { describeAdminError } from "./admin-api-error";

const MAX_RETRIES = 2;

/**
 * React Query's cache is convenience state, never authorization state (spec
 * 26 §8 "Cache rules"). Everything here is stale immediately (React Query's
 * default), so it is re-fetched on mount and whenever the tab regains focus;
 * `useAdminPermissions` does the same for permissions, which React Admin
 * would otherwise cache for five minutes.
 */
export function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retrying a 403 or a 404 only delays the answer by seconds; only
        // failures that could plausibly pass on a second try are retried.
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && describeAdminError(error).retryable,
      },
    },
  });
}
