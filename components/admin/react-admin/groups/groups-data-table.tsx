"use client";

import NextLink from "next/link";
import { DataTable } from "react-admin";
import Link from "@mui/material/Link";

import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import type { AdminGroupRow } from "@/domains/admin";

import { GroupsListEmpty } from "./groups-list-empty";

/**
 * One group's link into its page. Its `::after` stretches over the whole row,
 * so the entire row is the click target while the group's name stays the one
 * real, focusable, screen-reader-announced link — the same pattern as the
 * curriculum and levels lists.
 */
function GroupLink({ record }: { record: AdminGroupRow }) {
  return (
    <Link
      component={NextLink}
      href={`/admin/curriculum/groups/${record.id}`}
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
      {record.name}
    </Link>
  );
}

/**
 * The groups table (spec 26 Unit 5): React Admin's `DataTable` with what the
 * reorder list's rows showed — the group, its status — and the one thing that
 * list only implied by its order: the **lesson number** (`position`), which is
 * what learners see.
 *
 * Browsing only. No column sorts: the one ordering is the position, and the
 * position is changed by the specialist reorder tool, never by a generic list
 * sort (spec 26 Unit 5). Row click is off (`rowClick={false}`): React Admin's
 * row navigation goes through its own contained router and could never reach a
 * real Next route — the group link does that.
 */
export function GroupsDataTable({
  levelNumber,
  canCreate,
  onCreate,
}: {
  levelNumber: number | undefined;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <DataTable<AdminGroupRow>
      aria-label="Groups"
      rowClick={false}
      bulkActionButtons={false}
      empty={
        <GroupsListEmpty
          levelNumber={levelNumber}
          canCreate={canCreate}
          onCreate={onCreate}
        />
      }
      rowSx={() => ({ position: "relative" })}
      sx={{
        // A wide table scrolls inside its own box instead of widening the page.
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminGroupRow>
        source="position"
        label="Lesson"
        disableSort
        sx={{ width: 96 }}
      />
      <DataTable.Col<AdminGroupRow>
        source="name"
        label="Group"
        disableSort
        // Without a floor the name is squeezed by the columns beside it until
        // it wraps onto many lines at phone width. The floor is low enough that
        // all three columns still fit a 390px frame: a higher one pushed the
        // status badge out of sight at the frame's edge (found in a screenshot).
        sx={{ minWidth: 140 }}
        render={(record) => <GroupLink record={record} />}
      />
      <DataTable.Col<AdminGroupRow>
        source="status"
        label="Status"
        disableSort
        render={(record) => <CurriculumStatusBadge status={record.status} />}
      />
    </DataTable>
  );
}
