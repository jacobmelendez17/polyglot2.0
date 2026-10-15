"use client";

import NextLink from "next/link";
import { DataTable } from "react-admin";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Lock } from "lucide-react";

import { MappingStatusBadge } from "@/components/admin/dictionary/mapping-status-badge";
import { RegionalEvidenceBadge } from "@/components/admin/dictionary/regional-evidence-badge";
import type { AdminDictionaryRow } from "@/domains/admin";
import { REVIEW_REASON_LABELS } from "@/domains/lexicon";

import { DictionaryConfirmBar } from "./dictionary-confirm-bar";
import { DictionaryListEmpty } from "./dictionary-list-empty";

/**
 * The mapping queue's table (spec 26 Unit 9): React Admin's `DataTable`, with
 * the columns, order and meanings of the table it replaces — the curriculum
 * word, the form it is looked up as, the candidate dictionary entry, regional
 * evidence, and where the mapping stands — and the word is the **link** into its
 * own page, where the mapping panel holds every decision. The queue finds work;
 * it is not a second place that decides a mapping.
 *
 * The link is the word and not a column of its own (the table it replaces had a
 * "Review" column): on a phone a column of its own was the first thing pushed
 * out of sight, at 390 px, and the way in is the one thing the screen is for. It
 * is named "Review <word>" for assistive technology, so a screen reader can tell
 * the rows apart and still hears what activating it does. There is no row-wide
 * click target: the row's own checkbox is a control too.
 *
 * Row click is off (`rowClick={false}`): React Admin's row navigation goes
 * through its own contained router and could never reach a real Next route —
 * the word's link does that. No column sorts: the one ordering is the queue's.
 *
 * **Selection** is React Admin's and exists for one thing, the batch
 * confirmation. Only a row with a candidate that is not confirmed already can be
 * selected (`confirmable`), and only for someone who may confirm (`canConfirm`,
 * from the server's permissions — a writer may, as in the old queue).
 *
 * On a phone the table keeps what the screen is for — the word, where its
 * mapping stands, and the way in — and lets the lookup form (under 900 px) and
 * the candidate and regional columns (under 600 px) give way first; the word's
 * page has them all. It scrolls inside its own frame, never the page.
 */
export function DictionaryDataTable({
  regionCode,
  canConfirm,
}: {
  regionCode: string | null;
  canConfirm: boolean;
}) {
  return (
    <DataTable<AdminDictionaryRow>
      aria-label="Dictionary mapping queue"
      rowClick={false}
      // Truthy so the checkbox column renders (React Admin only shows it when
      // bulk actions exist); the real bar is `bulkActionsToolbar` below.
      bulkActionButtons={canConfirm ? <></> : false}
      bulkActionsToolbar={canConfirm ? <DictionaryConfirmBar /> : undefined}
      isRowSelectable={(record) => record.confirmable}
      empty={<DictionaryListEmpty />}
      sx={{
        // A wide table scrolls inside its own box instead of widening the page.
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        "& .column-lookupForm": { display: { xs: "none", md: "table-cell" } },
        "& .column-entryLemma": { display: { xs: "none", sm: "table-cell" } },
        "& .column-regionalStatus": {
          display: { xs: "none", sm: "table-cell" },
        },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminDictionaryRow>
        source="displayWord"
        label="Curriculum"
        disableSort
        sx={{ minWidth: 150 }}
        render={(row) => (
          <>
            <Link
              component={NextLink}
              href={`/admin/curriculum/items/${row.id}`}
              underline="hover"
              aria-label={`Review ${row.displayWord}`}
              sx={{
                display: "block",
                width: "fit-content",
                maxWidth: "100%",
                color: "text.primary",
                fontWeight: 500,
                overflowWrap: "break-word",
                "&:focus-visible": {
                  outline: "2px solid var(--ring)",
                  outlineOffset: 2,
                },
              }}
            >
              {row.displayWord}
            </Link>
            <Typography
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {row.translation} · Level {row.levelNumber} · {row.groupName}
            </Typography>
          </>
        )}
      />
      <DataTable.Col<AdminDictionaryRow>
        source="lookupForm"
        label="Lookup"
        disableSort
        render={(row) => (
          <Typography
            component="span"
            variant="caption"
            sx={{ fontFamily: "monospace", color: "text.secondary" }}
          >
            {row.lookupForm ?? "—"}
          </Typography>
        )}
      />
      <DataTable.Col<AdminDictionaryRow>
        source="entryLemma"
        label="Candidate"
        disableSort
        render={(row) =>
          row.entryLemma ? (
            <>
              {row.entryLemma}
              <Typography component="span" sx={{ color: "text.secondary" }}>
                {" "}
                · {row.entryPartOfSpeech}
              </Typography>
            </>
          ) : (
            "—"
          )
        }
      />
      {regionCode ? (
        <DataTable.Col<AdminDictionaryRow>
          source="regionalStatus"
          label={regionCode}
          disableSort
          // "es-MX" must not break at its hyphen into "es-" over "MX".
          sx={{ whiteSpace: "nowrap" }}
          render={(row) =>
            row.regionalStatus ? (
              <RegionalEvidenceBadge
                regionCode={regionCode}
                status={row.regionalStatus}
              />
            ) : (
              "—"
            )
          }
        />
      ) : null}
      <DataTable.Col<AdminDictionaryRow>
        source="matchStatus"
        label="Status"
        disableSort
        render={(row) => (
          <>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <MappingStatusBadge
                status={row.matchStatus}
                confidence={row.confidence}
              />
              {row.manualLock ? (
                <Lock
                  size={12}
                  aria-label="Locked against automatic replacement"
                />
              ) : null}
            </Box>
            {row.reviewReason ? (
              <Typography
                variant="caption"
                sx={{ display: "block", mt: 0.25, color: "text.secondary" }}
              >
                {REVIEW_REASON_LABELS[row.reviewReason]}
              </Typography>
            ) : null}
          </>
        )}
      />
    </DataTable>
  );
}
