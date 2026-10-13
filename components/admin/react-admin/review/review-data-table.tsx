"use client";

import NextLink from "next/link";
import { DataTable } from "react-admin";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import type { AdminReviewRow } from "@/domains/admin";
import { formatRelativeTime } from "@/lib/time/format-relative-time";

import { ReviewListEmpty } from "./review-list-empty";

const KIND_LABEL = {
  new: "New item",
  edit: "Edit to a published item",
} as const;

/** "5 minutes ago", with the exact time on hover and for assistive technology. */
function Updated({ iso }: { iso: string }) {
  const at = new Date(iso);
  return (
    <time dateTime={iso} title={at.toLocaleString()}>
      {formatRelativeTime(at, new Date())}
    </time>
  );
}

/**
 * Keeps the Publish column in view when a narrow screen scrolls the table
 * sideways: the table scrolls inside its own frame (the page never does), but
 * the one thing this screen is for must not scroll out of reach.
 *
 * Opaque, so the cells scrolling beneath it do not show through, and painted
 * with the same surface as the row it sits in (the header row is the paper
 * colour, body rows the page colour). The edge shadow appears only on phones,
 * where the table always overflows; on a wide screen nothing slides under it.
 */
const STICKY_ACTION_SX = {
  position: "sticky",
  right: 0,
  backgroundColor: "background.default",
  "thead &": { backgroundColor: "background.paper" },
  boxShadow: { xs: "-8px 0 8px -8px rgba(0, 0, 0, 0.2)", sm: "none" },
} as const;

/**
 * The review queue's table (spec 26 Unit 3): React Admin's `DataTable`, with
 * the same facts the list of cards it replaces showed — item, meaning, level,
 * group, whether it is new or an edit, who edited it, how long ago, and a
 * Publish action for those allowed to use it.
 *
 * Publish is passed in as `onPublish` and only rendered when the *server's*
 * permissions say the caller may (`canPublish`). That is presentation only: the
 * endpoint re-checks the database role on every call, so a writer who forced
 * this button into the page would still be refused.
 *
 * No checkboxes (`bulkActionButtons={false}`): bulk publication stays behind
 * its own service semantics (Unit 7), never React Admin's `updateMany`. No
 * sorting: the queue has the one ordering its cursors depend on.
 */
export function ReviewDataTable({
  canPublish,
  onPublish,
}: {
  canPublish: boolean;
  onPublish: (row: AdminReviewRow) => void;
}) {
  return (
    <DataTable<AdminReviewRow>
      aria-label="Review queue"
      rowClick={false}
      // Rows are not clickable, so a hover highlight would promise something
      // that is not there — and would not reach the sticky action cell.
      hover={false}
      bulkActionButtons={false}
      empty={<ReviewListEmpty />}
      sx={{
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminReviewRow>
        source="itemLabel"
        label="Item"
        disableSort
        render={(row) => (
          <Link
            component={NextLink}
            href={`/admin/curriculum/items/${row.id}`}
            underline="hover"
            sx={{
              color: "text.primary",
              fontWeight: 500,
              "&:focus-visible": {
                outline: "2px solid var(--ring)",
                outlineOffset: 2,
              },
            }}
          >
            {row.itemLabel}
          </Link>
        )}
      />
      <DataTable.Col<AdminReviewRow>
        source="meaningLabel"
        label="Meaning"
        disableSort
      />
      <DataTable.Col<AdminReviewRow>
        source="levelNumber"
        label="Level"
        disableSort
      />
      <DataTable.Col<AdminReviewRow>
        source="groupName"
        label="Group"
        disableSort
        render={(row) => row.groupName ?? "—"}
      />
      <DataTable.Col<AdminReviewRow>
        source="kind"
        label="Status"
        disableSort
        render={(row) => (
          <>
            <CurriculumStatusBadge
              status={row.kind === "new" ? "pending" : "draft"}
            />
            <Typography
              variant="caption"
              component="div"
              sx={{ color: "text.secondary", mt: 0.5 }}
            >
              {KIND_LABEL[row.kind]}
            </Typography>
          </>
        )}
      />
      <DataTable.Col<AdminReviewRow>
        source="authorName"
        label="Edited by"
        disableSort
        render={(row) => row.authorName ?? "—"}
      />
      <DataTable.Col<AdminReviewRow>
        source="updatedAt"
        label="Updated"
        disableSort
        render={(row) => <Updated iso={row.updatedAt} />}
      />
      {canPublish ? (
        <DataTable.Col<AdminReviewRow>
          label={<span className="sr-only">Actions</span>}
          disableSort
          align="right"
          sx={STICKY_ACTION_SX}
          render={(row) => (
            <Button
              size="small"
              variant="contained"
              // A unique accessible name per row ("Publish el gato"), so a
              // screen-reader user can tell the buttons apart.
              aria-label={`Publish ${row.itemLabel}`}
              onClick={() => onPublish(row)}
            >
              Publish
            </Button>
          )}
        />
      ) : null}
    </DataTable>
  );
}
