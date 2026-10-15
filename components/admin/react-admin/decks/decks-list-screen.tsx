"use client";

import { useEffect, useMemo } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";
import Alert from "@mui/material/Alert";

import { DECK_LIST_MAX } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { LanguageFilter } from "../language-filter";
import { ListSkeleton } from "../skeletons";
import { DecksDataTable } from "./decks-data-table";
import { useDecksList } from "./use-decks-list";

/**
 * `/admin/decks`, on React Admin (spec 26 Unit 10): the official Polyglot decks
 * of a language, each linking to its own page (where its membership and order
 * are edited — the specialist editor, unchanged). "Add deck" stays the page's
 * own dialog, because a deck cannot be created without choosing its items.
 *
 * Admin only, and the *server* says so: the page is closed to anyone else and
 * the endpoint answers 403, which shows here as access-denied rather than an
 * empty list. Only official decks are ever listed — a learner's personal deck
 * has no administrative surface and the endpoint has no way to ask for one.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (designed), error (in place, a retry only when one could help), forbidden. A
 * denial always replaces whatever rows are still cached; a transient failure
 * keeps them with a warning.
 */
export function DecksListScreen({
  languages,
}: {
  languages: { id: string; name: string }[];
}) {
  const notify = useNotify();
  const lookups = useMemo(() => ({ languages }), [languages]);
  const list = useDecksList(lookups);

  const problem = blockingError(list.error, Boolean(list.rows));

  const refreshFailed = list.isRefetchError && !problem;
  const refreshError = list.error;
  useEffect(() => {
    if (refreshFailed) {
      notify(describeAdminError(refreshError).message, { type: "warning" });
    }
  }, [refreshFailed, refreshError, notify]);

  const truncated = Boolean(
    (list.listContext.meta as { truncated?: boolean } | undefined)?.truncated,
  );

  return (
    <ResourceContextProvider value="decks">
      <ListContextProvider value={list.listContext}>
        <LanguageFilter languages={languages} label="Filter decks" />
        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
            }}
          />
        ) : list.isPending ? (
          <ListSkeleton label="Loading the decks…" rows={4} />
        ) : (
          <>
            {truncated ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Showing the first {DECK_LIST_MAX} decks.
              </Alert>
            ) : null}
            <DecksDataTable />
          </>
        )}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
