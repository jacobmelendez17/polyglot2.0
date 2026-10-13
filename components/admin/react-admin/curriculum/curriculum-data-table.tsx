"use client";

import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { DataTable, useListContext } from "react-admin";
import Link from "@mui/material/Link";

import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import { BulkActionsBar } from "@/components/admin/curriculum/bulk-actions-bar";
import type { AdminCurriculumRow } from "@/domains/admin";

import { CurriculumListEmpty } from "./curriculum-list-empty";
import type { CurriculumFilterLookups } from "./curriculum-filters";

const TYPE_LABEL = { vocabulary: "Vocab", grammar: "Gram" } as const;

/**
 * One item's link into the specialist editor. Carries the list's own query
 * string as `?from=`, so "Back to Curriculum" there restores this exact view
 * (filters, search, page) — it reads the *real* URL, which is why list state
 * lives there. With no query (a bare `/admin/curriculum`) it carries nothing,
 * as before.
 *
 * The link's `::after` stretches over its whole row, so the entire row is the
 * click target (as the table this replaces did) while the item name stays the
 * one real, focusable, screen-reader-announced link. The row's checkbox sits
 * above that overlay so it stays independently clickable.
 */
function ItemLink({ record }: { record: AdminCurriculumRow }) {
  const fromQuery = useSearchParams().toString();
  const href = fromQuery
    ? `/admin/curriculum/items/${record.id}?from=${encodeURIComponent(fromQuery)}`
    : `/admin/curriculum/items/${record.id}`;

  return (
    <Link
      component={NextLink}
      href={href}
      underline="hover"
      sx={{
        color: "text.primary",
        fontWeight: 500,
        "&::after": { content: '""', position: "absolute", inset: 0 },
        "&:focus-visible": {
          outline: "2px solid var(--ring)",
          outlineOffset: -2,
        },
      }}
    >
      {record.itemLabel}
    </Link>
  );
}

/**
 * The bulk-selection bar, until Unit 7 replaces its chrome. It is the existing
 * shadcn component, fed by React Admin's selection state; after an action it
 * re-fetches the list (the one thing `router.refresh()` cannot do for a list
 * that fetches client-side).
 */
function BulkToolbar({
  levels,
  groups,
}: Omit<CurriculumFilterLookups, "languages">) {
  const { data, selectedIds, onUnselectItems, refetch } =
    useListContext<AdminCurriculumRow>();
  const selectedItems = (data ?? []).filter((row) =>
    selectedIds.includes(row.id),
  );
  if (selectedItems.length === 0) return null;

  return (
    <BulkActionsBar
      selectedItems={selectedItems}
      levels={levels}
      groups={groups}
      onDone={() => onUnselectItems()}
      onActionComplete={() => void refetch()}
    />
  );
}

/**
 * The curriculum table (spec 26 Unit 2): React Admin's `DataTable`, with the
 * same six columns, order, and meanings as the table it replaces.
 *
 * Row selection is React Admin's (`selectedIds` on the list context); row
 * click is off (`rowClick={false}`) because React Admin's row navigation goes
 * through its own contained router and could never reach a real Next route —
 * the item link above does that. No column sorts: the one ordering is the
 * keyset's, and a cursor is only meaningful under it.
 */
export function CurriculumDataTable({
  levels,
  groups,
}: Omit<CurriculumFilterLookups, "languages">) {
  return (
    <DataTable<AdminCurriculumRow>
      aria-label="Curriculum items"
      rowClick={false}
      // Truthy so the checkbox column renders (React Admin only shows it when
      // bulk actions exist); the real toolbar is `bulkActionsToolbar` below.
      bulkActionButtons={<></>}
      bulkActionsToolbar={<BulkToolbar levels={levels} groups={groups} />}
      empty={<CurriculumListEmpty />}
      rowSx={() => ({ position: "relative" })}
      sx={{
        // Lifts the checkbox above each row's link overlay (see `ItemLink`).
        "& .RaDataTable-checkbox": { position: "relative", zIndex: 1 },
        // A wide table scrolls inside its own box instead of widening the page.
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminCurriculumRow>
        source="type"
        label="Type"
        disableSort
        render={(record) => TYPE_LABEL[record.type]}
      />
      <DataTable.Col<AdminCurriculumRow>
        source="itemLabel"
        label="Item"
        disableSort
        render={(record) => <ItemLink record={record} />}
      />
      <DataTable.Col<AdminCurriculumRow>
        source="meaningLabel"
        label="Meaning"
        disableSort
      />
      <DataTable.Col<AdminCurriculumRow>
        source="levelNumber"
        label="Level"
        disableSort
      />
      <DataTable.Col<AdminCurriculumRow>
        source="groupName"
        label="Group"
        disableSort
        render={(record) => record.groupName ?? "—"}
      />
      <DataTable.Col<AdminCurriculumRow>
        source="status"
        label="Status"
        disableSort
        render={(record) => <CurriculumStatusBadge status={record.status} />}
      />
    </DataTable>
  );
}
