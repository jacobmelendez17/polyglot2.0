"use client";

import { DataTable } from "react-admin";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import type { AdminUserRow } from "@/domains/admin";

import { STICKY_ACTION_SX } from "../sticky-action";
import { RoleBadge } from "./role-badge";
import { personLabel } from "./role-model";
import { UsersListEmpty } from "./users-list-empty";

/** "Mar 2, 2026" in the reader's own locale, with the exact instant on hover and for assistive technology. */
function Joined({ iso }: { iso: string }) {
  const at = new Date(iso);
  return (
    <time dateTime={iso} title={at.toLocaleString()}>
      {at.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
    </time>
  );
}

const NONE = (
  <Typography component="span" sx={{ color: "text.secondary" }}>
    —
  </Typography>
);

/**
 * The account table (spec 26 Unit 6): React Admin's `DataTable` with the safe
 * facts an Admin needs to recognise a person — name, username, role, when they
 * joined — and, for those allowed to use it, a **Change role** action per row.
 *
 * **Your own row has no such action**; it says so instead. The server refuses
 * a self-change regardless, so this is only not offering what would be refused.
 *
 * Rows are not clickable (no detail page exists), so there is no hover
 * highlight to promise otherwise, and none sorts: the one ordering is newest
 * account first, which a role edit can never change.
 */
export function UsersDataTable({
  currentUserId,
  canChangeRole,
  onChangeRole,
  search,
  onClearSearch,
}: {
  currentUserId: string;
  canChangeRole: boolean;
  onChangeRole: (user: AdminUserRow) => void;
  search: string | undefined;
  onClearSearch: () => void;
}) {
  return (
    <DataTable<AdminUserRow>
      aria-label="Users"
      rowClick={false}
      hover={false}
      bulkActionButtons={false}
      empty={<UsersListEmpty search={search} onClearSearch={onClearSearch} />}
      sx={{
        // A wide table scrolls inside its own box instead of widening the page.
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        // What this screen is for is who holds which role, so the Role column is
        // the one that must never scroll out of sight. The username goes first as
        // the screen narrows, then the join date (React Admin tags every header
        // and body cell of a column with `column-<source>`).
        "& .column-username": { display: { xs: "none", sm: "table-cell" } },
        "& .column-createdAt": { display: { xs: "none", md: "table-cell" } },
        // Tighter cells on a phone, so a name, a role badge and the action fit
        // side by side without anything sliding under the pinned action.
        "& .MuiTableCell-root": { px: { xs: 1, sm: 2 } },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminUserRow>
        source="displayName"
        label="Name"
        disableSort
        sx={{ minWidth: { xs: 100, sm: 140 } }}
        render={(row) => row.displayName ?? NONE}
      />
      <DataTable.Col<AdminUserRow>
        source="username"
        label="Username"
        disableSort
        render={(row) => row.username ?? NONE}
      />
      <DataTable.Col<AdminUserRow>
        source="role"
        label="Role"
        disableSort
        render={(row) => <RoleBadge role={row.role} />}
      />
      <DataTable.Col<AdminUserRow>
        source="createdAt"
        label="Joined"
        disableSort
        render={(row) => <Joined iso={row.createdAt} />}
      />
      {canChangeRole ? (
        <DataTable.Col<AdminUserRow>
          label={<span className="sr-only">Actions</span>}
          disableSort
          align="right"
          sx={STICKY_ACTION_SX}
          render={(row) =>
            row.id === currentUserId ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                That&apos;s you
              </Typography>
            ) : (
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                // A unique accessible name per row, so a screen-reader user can
                // tell the buttons apart ("Change role for Ana Lopez").
                aria-label={`Change role for ${personLabel(row)}`}
                sx={{ whiteSpace: "nowrap" }}
                onClick={() => onChangeRole(row)}
              >
                Change role
              </Button>
            )
          }
        />
      ) : null}
    </DataTable>
  );
}
