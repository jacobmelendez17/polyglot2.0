"use client";

import NextLink from "next/link";
import { DataTable } from "react-admin";
import Link from "@mui/material/Link";

import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import type { AdminLevelRow } from "@/domains/admin";

import { LevelsListEmpty } from "./levels-list-empty";

/**
 * One level's link into its detail page (the specialist `LevelItemBoard` lives
 * there). Its `::after` stretches over the whole row, so the entire row is the
 * click target while the level's name stays the one real, focusable,
 * screen-reader-announced link — the same pattern as the curriculum list.
 */
function LevelLink({ record }: { record: AdminLevelRow }) {
  return (
    <Link
      component={NextLink}
      href={`/admin/curriculum/levels/${record.id}`}
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
      Level {record.levelNumber}
      {record.name ? ` — ${record.name}` : ""}
    </Link>
  );
}

/**
 * The levels table (spec 26 Unit 4): React Admin's `DataTable` with what the
 * card list it replaces showed — the level, its status, and what it holds —
 * plus the CEFR band, which is level metadata this screen now manages.
 *
 * The counts are information only. A level holds any number of any kind of
 * item and publishing it is an Admin's call (spec 17); nothing here is a gate.
 *
 * Row click is off (`rowClick={false}`): React Admin's row navigation goes
 * through its own contained router and could never reach a real Next route —
 * the level link does that. No column sorts: the one ordering is level number.
 */
export function LevelsDataTable({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <DataTable<AdminLevelRow>
      aria-label="Levels"
      rowClick={false}
      bulkActionButtons={false}
      empty={<LevelsListEmpty canCreate={canCreate} onCreate={onCreate} />}
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
      <DataTable.Col<AdminLevelRow>
        source="levelNumber"
        label="Level"
        disableSort
        // Without a floor the name is squeezed by the columns beside it until
        // it wraps onto four lines at phone width; with one, the table scrolls
        // inside its own frame instead, as intended.
        sx={{ minWidth: 160 }}
        render={(record) => <LevelLink record={record} />}
      />
      <DataTable.Col<AdminLevelRow>
        source="status"
        label="Status"
        disableSort
        render={(record) => <CurriculumStatusBadge status={record.status} />}
      />
      <DataTable.Col<AdminLevelRow>
        source="cefrLevel"
        label="CEFR band"
        disableSort
        render={(record) => record.cefrLevel ?? "—"}
      />
      <DataTable.Col<AdminLevelRow>
        source="vocabularyItems"
        label="Vocabulary"
        disableSort
        align="right"
      />
      <DataTable.Col<AdminLevelRow>
        source="grammarItems"
        label="Grammar"
        disableSort
        align="right"
      />
      <DataTable.Col<AdminLevelRow>
        source="vocabularyGroups"
        label="Groups"
        disableSort
        align="right"
      />
    </DataTable>
  );
}
