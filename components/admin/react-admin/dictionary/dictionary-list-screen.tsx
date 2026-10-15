"use client";

import { useEffect, useMemo } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";
import Box from "@mui/material/Box";

import type { AdminDictionaryCounts } from "@/domains/admin";
import { MATCH_STATUS_LABELS } from "@/domains/lexicon";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { OffsetPagination } from "../offset-pagination";
import { ListSkeleton } from "../skeletons";
import { useAdminPermissions } from "../use-admin-permissions";
import { DictionaryDataTable } from "./dictionary-data-table";
import {
  DictionaryFilters,
  type DictionaryFilterLookups,
} from "./dictionary-filters";
import { useDictionaryList } from "./use-dictionary-list";

/** The five states, then "never matched" only when something has been. The same order the page's header always had. */
const COUNT_ORDER = [
  "unmatched",
  "source_data_not_imported",
  "auto_matched",
  "review_required",
  "manual",
] as const;

function MappingCounts({ counts }: { counts: AdminDictionaryCounts }) {
  return (
    <Box
      component="dl"
      aria-label="Mapping counts"
      sx={{ display: "flex", flexWrap: "wrap", gap: 2, m: 0, mb: 2 }}
    >
      {COUNT_ORDER.map((status) => (
        <Box
          key={status}
          sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}
        >
          <Box
            component="dt"
            sx={{ color: "text.secondary", fontSize: "0.875rem" }}
          >
            {MATCH_STATUS_LABELS[status]}
          </Box>
          <Box component="dd" sx={{ m: 0, fontWeight: 500 }}>
            {counts[status]}
          </Box>
        </Box>
      ))}
      {counts.no_mapping > 0 ? (
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
          <Box
            component="dt"
            sx={{ color: "text.secondary", fontSize: "0.875rem" }}
          >
            Never matched
          </Box>
          <Box component="dd" sx={{ m: 0, fontWeight: 500 }}>
            {counts.no_mapping}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * `/admin/dictionary`, on React Admin (spec 26 Unit 9): the dictionary mapping
 * queue — how each curriculum word stands against the imported dictionary — as
 * an offset-paginated list with a real total, the status counts above it, and
 * the filters the page always had.
 *
 * It finds work and links to each word's own page, where the mapping panel holds
 * every decision (which entry, which senses, which pronunciation, a manual
 * choice). The one command here is the batch confirmation of reviewed matches,
 * offered to anyone who may author — a writer included, as before — and decided
 * by the *server's* permissions, never a role name held here. Nothing in this
 * queue publishes anything.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (designed, and told apart from "past the end"), error (in place, a retry only
 * when one could help), forbidden. A denial always replaces whatever rows are
 * still cached; a transient failure keeps them with a warning.
 */
export function DictionaryListScreen({
  languages,
  levels,
  groups,
  regionCodes,
}: Omit<DictionaryFilterLookups, "regionCode"> & { regionCodes: string[] }) {
  const notify = useNotify();
  const lookups = useMemo(
    () => ({ languages, levels, groups, regionCodes }),
    [languages, levels, groups, regionCodes],
  );
  const list = useDictionaryList(lookups);
  const permissions = useAdminPermissions();

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

  const canConfirm = Boolean(
    permissions.permissions?.resources.dictionary?.includes("edit"),
  );
  const meta = list.meta as
    { counts?: AdminDictionaryCounts; regionCode?: string | null } | undefined;
  // The server's answer once it has one; until then the region the page knows
  // the language's dictionary covers, so the filters do not jump.
  const regionCode =
    meta?.regionCode !== undefined
      ? meta.regionCode
      : (list.state.filters.region ?? regionCodes[0] ?? null);

  return (
    <ResourceContextProvider value="dictionary">
      <ListContextProvider value={list.listContext}>
        {meta?.counts ? <MappingCounts counts={meta.counts} /> : null}
        <DictionaryFilters
          languages={languages}
          levels={levels}
          groups={groups}
          regionCode={regionCode}
        />
        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
              void permissions.refetch();
            }}
          />
        ) : list.isPending || !permissions.permissions ? (
          <ListSkeleton label="Loading the mapping queue…" rows={6} />
        ) : (
          <>
            <DictionaryDataTable
              regionCode={regionCode}
              canConfirm={canConfirm}
            />
            <OffsetPagination
              from={list.pagination.from}
              to={list.pagination.to}
              total={list.pagination.total}
              hasPreviousPage={list.pagination.hasPreviousPage}
              hasNextPage={list.pagination.hasNextPage}
              locked={list.pagination.locked}
              onPrevious={list.pagination.goToPreviousPage}
              onNext={list.pagination.goToNextPage}
            />
          </>
        )}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
