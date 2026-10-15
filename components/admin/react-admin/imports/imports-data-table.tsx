"use client";

import NextLink from "next/link";
import { DataTable } from "react-admin";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { ImportStatusBadge } from "@/components/admin/curriculum/import-status-badge";
import {
  importStatusView,
  summarizeImport,
} from "@/components/admin/curriculum/import-status";
import type { AdminImportRow } from "@/domains/admin";

import { STICKY_ACTION_SX } from "../sticky-action";
import { ImportsListEmpty } from "./imports-list-empty";

/** A moment as a short date and time in the person's own locale, with the exact instant for assistive technology. */
function When({ iso }: { iso: string }) {
  const at = new Date(iso);
  return (
    <time dateTime={iso} title={at.toISOString()}>
      {at.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </time>
  );
}

/**
 * The import history's table (spec 26 Unit 8): React Admin's `DataTable`, with
 * the facts the table it replaces showed — file, status, what it found, when —
 * and, for an Admin, the row's own commands: Archive in the normal history,
 * Restore and Permanently delete in the archived one.
 *
 * Each file is a link to the import's own page, where the specialist screens
 * stay — the review of rows that need a decision, the correction form, Confirm,
 * Retry, and the explicit publish of what an import drafted. The commands are
 * passed in. Imports are an Admin's end to end (the page and every endpoint are
 * `canPublishCurriculum`, re-checked on each request), so the table has no
 * read-only form: a role that loses access is answered by the endpoint with a
 * 403, and the screen says so.
 *
 * No checkboxes: nothing here acts on several imports at once. No sorting: the
 * history has the one ordering its cursors depend on.
 *
 * On a phone the table keeps what the screen is for — which file, where it is,
 * and the action beside it — and lets the rest give way (the dates from 600px,
 * the counts from 900px); an import's own page has them all. Without that the
 * file's name is squeezed to a few characters a line.
 */
export function ImportsDataTable({
  archived,
  pendingId,
  onArchive,
  onRestore,
  onDelete,
}: {
  archived: boolean;
  /** The import a command is being sent for, so its buttons can say so. */
  pendingId: string | null;
  onArchive: (row: AdminImportRow) => void;
  onRestore: (row: AdminImportRow) => void;
  onDelete: (row: AdminImportRow) => void;
}) {
  return (
    <DataTable<AdminImportRow>
      aria-label={archived ? "Archived imports" : "Import history"}
      rowClick={false}
      // Rows are not clickable (the file is the link), so a hover highlight
      // would promise something that is not there.
      hover={false}
      bulkActionButtons={false}
      empty={<ImportsListEmpty archived={archived} />}
      sx={{
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        "& .column-totalRows": { display: { xs: "none", md: "table-cell" } },
        "& .column-createdAt": { display: { xs: "none", sm: "table-cell" } },
        "& .column-archivedAt": { display: { xs: "none", sm: "table-cell" } },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminImportRow>
        source="originalFilename"
        label="File"
        disableSort
        render={(row) => (
          <Link
            component={NextLink}
            href={`/admin/curriculum/imports/${row.id}`}
            underline="hover"
            sx={{
              color: "text.primary",
              fontWeight: 500,
              // Breaks at a hyphen or a dot when it can, and mid-word only when
              // a name has none that fits — not at every letter.
              overflowWrap: "break-word",
              "&:focus-visible": {
                outline: "2px solid var(--ring)",
                outlineOffset: 2,
              },
            }}
          >
            {row.originalFilename}
          </Link>
        )}
      />
      <DataTable.Col<AdminImportRow>
        source="status"
        label="Status"
        disableSort
        render={(row) => {
          const { stage } = importStatusView(row.status);
          return (
            <>
              <ImportStatusBadge status={row.status} />
              {stage ? (
                <Typography
                  variant="caption"
                  component="div"
                  sx={{ color: "text.secondary", mt: 0.5 }}
                >
                  {stage}
                </Typography>
              ) : null}
            </>
          );
        }}
      />
      <DataTable.Col<AdminImportRow>
        source="totalRows"
        label="Summary"
        disableSort
        render={(row) => summarizeImport(row)}
      />
      <DataTable.Col<AdminImportRow>
        source="createdAt"
        label="Created"
        disableSort
        render={(row) => <When iso={row.createdAt} />}
      />
      {archived ? (
        <DataTable.Col<AdminImportRow>
          source="archivedAt"
          label="Archived"
          disableSort
          render={(row) =>
            row.archivedAt ? <When iso={row.archivedAt} /> : "—"
          }
        />
      ) : null}
      <DataTable.Col<AdminImportRow>
        label={<span className="sr-only">Actions</span>}
        disableSort
        align="right"
        sx={STICKY_ACTION_SX}
        render={(row) => {
          const busy = pendingId === row.id;
          return archived ? (
            <Box
              sx={{
                display: "flex",
                // Side by side when there is room; stacked on a phone, where
                // two buttons abreast would take the file's and status's room.
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { xs: "stretch", sm: "center" },
                gap: 1,
                justifyContent: "flex-end",
              }}
            >
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                disabled={busy}
                // A unique accessible name per row, so a screen-reader user
                // can tell the buttons apart.
                aria-label={`Restore ${row.originalFilename}`}
                onClick={() => onRestore(row)}
              >
                Restore
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={busy}
                aria-label={`Permanently delete ${row.originalFilename}`}
                onClick={() => onDelete(row)}
              >
                Permanently delete
              </Button>
            </Box>
          ) : (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              disabled={busy}
              aria-label={`Archive ${row.originalFilename}`}
              onClick={() => onArchive(row)}
            >
              Archive
            </Button>
          );
        }}
      />
    </DataTable>
  );
}
