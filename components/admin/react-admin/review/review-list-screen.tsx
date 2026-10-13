"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";
import Typography from "@mui/material/Typography";

import type { AdminReviewRow } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { CursorPagination } from "../cursor-pagination";
import { useAdminPermissions } from "../use-admin-permissions";
import { ReviewDataTable } from "./review-data-table";
import { ReviewFilters } from "./review-filters";
import { ReviewListSkeleton } from "./review-list-skeleton";
import { ReviewPublishDialog } from "./review-publish-dialog";
import { useReviewList } from "./use-review-list";

/**
 * `/admin/curriculum/review`, on React Admin (spec 26 Unit 3): everything
 * waiting for an Admin — new items and open edits — as a cursor-paginated
 * list, with a confirmed Publish command for those allowed to use it.
 *
 * What each role sees follows the *server's* permissions, never a role name
 * held here: `canManageCurriculum` gets the list at all (the endpoint says so
 * with a 403 otherwise), and `canPublishCurriculum` additionally gets the
 * Publish action. A writer therefore sees their own work waiting, with no
 * button — and the endpoint would refuse them anyway.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (a success state, distinct from "a page past the end"), error (in place, a
 * retry only when one could help), and forbidden. A denial always replaces
 * whatever rows are still cached; a transient failure keeps them with a
 * warning.
 */
export function ReviewListScreen({
  languages,
}: {
  languages: { id: string; name: string }[];
}) {
  const notify = useNotify();
  const lookups = useMemo(() => ({ languages }), [languages]);
  const list = useReviewList(lookups);
  const permissions = useAdminPermissions();
  // The row whose confirmation is open. Held as a snapshot, so a background
  // refetch cannot change the version the dialog will ask the server to honour.
  const [publishing, setPublishing] = useState<AdminReviewRow | null>(null);

  const problem =
    blockingError(list.error, Boolean(list.rows)) ??
    blockingError(permissions.error, Boolean(permissions.permissions));

  const refreshFailed = list.isRefetchError && !problem;
  const refreshError = list.error;
  useEffect(() => {
    if (refreshFailed) {
      notify(describeAdminError(refreshError).message, { type: "warning" });
    }
  }, [refreshFailed, refreshError, notify]);

  const canPublish = Boolean(permissions.permissions?.canPublishCurriculum);

  return (
    <ResourceContextProvider value="review">
      <ListContextProvider value={list.listContext}>
        <ReviewFilters languages={languages} />
        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
              void permissions.refetch();
            }}
          />
        ) : list.isPending || !permissions.permissions ? (
          <ReviewListSkeleton />
        ) : (
          <>
            {!canPublish ? (
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mb: 1.5 }}
              >
                You can see everything waiting here. An Admin publishes it.
              </Typography>
            ) : null}
            <ReviewDataTable
              canPublish={canPublish}
              onPublish={setPublishing}
            />
            <CursorPagination
              hasPreviousPage={list.pagination.hasPreviousPage}
              hasNextPage={list.pagination.hasNextPage}
              locked={list.pagination.locked}
              onPrevious={list.pagination.goToPreviousPage}
              onNext={list.pagination.goToNextPage}
            />
          </>
        )}

        {publishing ? (
          <ReviewPublishDialog
            // A new row, or the same row at a new version, is a new intent:
            // it remounts, and so gets a new idempotency key.
            key={`${publishing.id}:${publishing.version}`}
            row={publishing}
            onClose={() => setPublishing(null)}
          />
        ) : null}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
