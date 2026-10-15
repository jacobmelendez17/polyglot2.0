"use client";

import { DataTable, useExpanded, useRecordContext } from "react-admin";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { AdminLogRow } from "@/domains/admin";

import { LogsListEmpty } from "./logs-list-empty";

/** A moment as a date and time in the person's own locale, with the exact instant for assistive technology. */
function When({ iso }: { iso: string }) {
  const at = new Date(iso);
  return (
    <time dateTime={iso} title={at.toISOString()}>
      {at.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      })}
    </time>
  );
}

/** An id in the form the table shows: its first eight characters. The whole id is in the row's details. */
const shortId = (id: string) => `${id.slice(0, 8)}…`;

/**
 * The row's own control for its details — a real button, with the state it
 * controls: React Admin's built-in expand button is an icon the keyboard and
 * assistive technology cannot reach (`aria-hidden`, `tabIndex={-1}`, meant to be
 * clicked through the row). This one drives the same state (`useExpanded`), so
 * the panel under the row is React Admin's own; only one is open at a time.
 */
function DetailsToggle() {
  const row = useRecordContext<AdminLogRow>();
  const [expanded, toggle] = useExpanded("logs", row?.id ?? "", true);
  if (!row) return null;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <IconButton
      size="small"
      aria-label={expanded ? "Hide details" : "Show details"}
      aria-expanded={expanded}
      aria-controls={`logs-${row.id}-expand`}
      onClick={toggle}
      sx={{
        "&:focus-visible": {
          outline: "2px solid var(--ring)",
          outlineOffset: 2,
        },
      }}
    >
      <Chevron size={16} aria-hidden="true" />
    </IconButton>
  );
}

/** What one recorded JSON value says, as the old table showed it: indented, or the word `null`. */
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{ display: "block", fontWeight: 600, color: "text.secondary" }}
      >
        {label}
      </Typography>
      <Box
        component="pre"
        // Scrollable, so the keyboard must be able to scroll it.
        tabIndex={0}
        role="region"
        aria-label={label}
        sx={{
          m: 0,
          mt: 0.5,
          p: 1,
          maxHeight: 320,
          overflow: "auto",
          fontSize: 12,
          fontFamily: "monospace",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius)",
          backgroundColor: "background.paper",
          "&:focus-visible": { outline: "2px solid var(--ring)" },
        }}
      >
        {JSON.stringify(value, null, 2) ?? "null"}
      </Box>
    </Box>
  );
}

function Detail({ term, children }: { term: string; children: string }) {
  return (
    <>
      <Typography
        component="dt"
        variant="caption"
        sx={{ color: "text.secondary", fontWeight: 600 }}
      >
        {term}
      </Typography>
      <Typography
        component="dd"
        variant="body2"
        sx={{ m: 0, overflowWrap: "anywhere" }}
      >
        {children}
      </Typography>
    </>
  );
}

/**
 * What opens under a row: everything the narrow table leaves out — the actor, the
 * resource with its whole id, the reason, the correlation and event ids — and
 * the recorded before and after. It is the one place a phone gets the columns
 * the table gives up first.
 */
function LogDetails() {
  const row = useRecordContext<AdminLogRow>();
  if (!row) return null;
  return (
    <Box
      role="group"
      aria-label={`Details of ${row.action}`}
      sx={{ display: "grid", gap: 2, py: 1.5 }}
    >
      <Box
        component="dl"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "max-content 1fr" },
          columnGap: 2,
          rowGap: 0.5,
          m: 0,
        }}
      >
        <Detail term="Actor">{`${row.actorName} (${row.actorId})`}</Detail>
        <Detail term="Resource">
          {row.resourceId
            ? `${row.resourceType} · ${row.resourceId}`
            : row.resourceType}
        </Detail>
        <Detail term="Reason">{row.reason ?? "—"}</Detail>
        <Detail term="Correlation ID">{row.correlationId ?? "—"}</Detail>
        <Detail term="Event ID">{row.id}</Detail>
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            sm: "repeat(2, minmax(0, 1fr))",
          },
        }}
      >
        <JsonBlock label="Before" value={row.beforeData} />
        <JsonBlock label="After" value={row.afterData} />
      </Box>
    </Box>
  );
}

/**
 * The audit log's table: React Admin's `DataTable` with what the table it
 * replaces showed — when, who, what, to what, and why — and a **Show details**
 * button on each row that opens the recorded before and after (one row open at a
 * time — the button asks `useExpanded` for that; the table's own `expandSingle`
 * would only govern the click on a row, which is off), through React Admin's own
 * row expansion.
 *
 * Read-only: no checkboxes, no sorting (the log has the one ordering its cursors
 * depend on), no row click. On a phone the table keeps *when* and *what* and the
 * button; the actor, the resource and the reason give way first (from 600 and 900
 * px) and are all in the details, which are one tap away.
 */
export function LogsDataTable() {
  return (
    <DataTable<AdminLogRow>
      aria-label="Audit log"
      rowClick={false}
      // Rows are not clickable, so a hover highlight would promise something
      // that is not there.
      hover={false}
      bulkActionButtons={false}
      expand={<LogDetails />}
      empty={<LogsListEmpty />}
      sx={{
        // A wide table scrolls inside its own box instead of widening the page.
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        // React Admin's own expand column holds an icon the keyboard cannot
        // reach; the "Show details" column below replaces it.
        "& .RaDataTable-expandHeader, & .RaDataTable-expandIconCell": {
          display: "none",
        },
        "& .column-actorName": { display: { xs: "none", sm: "table-cell" } },
        "& .column-resourceType": { display: { xs: "none", md: "table-cell" } },
        "& .column-reason": { display: { xs: "none", md: "table-cell" } },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminLogRow>
        source="createdAt"
        label="When"
        disableSort
        // On one line when there is room; wrapped on a phone, where the date and
        // time on one line would push the button out of the frame.
        sx={{ whiteSpace: { xs: "normal", sm: "nowrap" } }}
        render={(row) => <When iso={row.createdAt} />}
      />
      <DataTable.Col<AdminLogRow>
        source="actorName"
        label="Actor"
        disableSort
        render={(row) => (
          <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
            {row.actorName}
          </Typography>
        )}
      />
      <DataTable.Col<AdminLogRow>
        source="action"
        label="Action"
        disableSort
        render={(row) => (
          <Typography
            component="span"
            variant="caption"
            sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
          >
            {row.action}
          </Typography>
        )}
      />
      <DataTable.Col<AdminLogRow>
        source="resourceType"
        label="Resource"
        disableSort
        render={(row) => (
          <>
            {row.resourceType}
            {row.resourceId ? (
              <Typography component="span" sx={{ color: "text.secondary" }}>
                {" "}
                · {shortId(row.resourceId)}
              </Typography>
            ) : null}
          </>
        )}
      />
      <DataTable.Col<AdminLogRow>
        source="reason"
        label="Reason"
        disableSort
        render={(row) => (
          <Typography
            component="span"
            variant="body2"
            sx={{ color: "text.secondary" }}
          >
            {row.reason ?? "—"}
          </Typography>
        )}
      />
      <DataTable.Col<AdminLogRow>
        label={<span className="sr-only">Details</span>}
        disableSort
        align="right"
        render={() => <DetailsToggle />}
      />
    </DataTable>
  );
}
