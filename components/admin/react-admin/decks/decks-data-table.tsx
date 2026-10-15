"use client";

import NextLink from "next/link";
import { DataTable } from "react-admin";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import type { AdminDeckRow } from "@/domains/admin";

import { DecksListEmpty } from "./decks-list-empty";

/**
 * One deck's link into its own page, where its membership and order are edited
 * (the specialist editor). Its `::after` stretches over the whole row, so the
 * entire row is the click target while the deck's name stays the one real,
 * focusable, screen-reader-announced link — the same pattern as the levels
 * list.
 */
function DeckLink({ record }: { record: AdminDeckRow }) {
  return (
    <Link
      component={NextLink}
      href={`/admin/decks/${record.id}`}
      underline="hover"
      sx={{
        color: "text.primary",
        fontWeight: 500,
        overflowWrap: "break-word",
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

/** When learners see the deck — the words the old list used. */
export function deckAvailabilityText(deck: AdminDeckRow): string {
  return deck.availability === "level"
    ? `Hidden until Level ${deck.gateLevelNumber ?? "?"}`
    : "Theme — reveals learned items";
}

/**
 * The official-decks table (spec 26 Unit 10): React Admin's `DataTable` with
 * what the card list it replaces showed — the deck, its description, how many
 * items it holds, and when learners see it.
 *
 * Row click is off (`rowClick={false}`): React Admin's row navigation goes
 * through its own contained router and could never reach a real Next route —
 * the deck link does that. No column sorts (one ordering, by name), and there
 * are no checkboxes: nothing here acts on several decks at once. On a phone the
 * description gives way first, so the deck's name and size stay on screen.
 */
export function DecksDataTable() {
  return (
    <DataTable<AdminDeckRow>
      aria-label="Polyglot decks"
      rowClick={false}
      bulkActionButtons={false}
      empty={<DecksListEmpty />}
      rowSx={() => ({ position: "relative" })}
      sx={{
        // A wide table scrolls inside its own box instead of widening the page.
        "& .RaDataTable-tableWrapper": { overflowX: "auto" },
        "& .column-description": { display: { xs: "none", md: "table-cell" } },
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <DataTable.Col<AdminDeckRow>
        source="name"
        label="Deck"
        disableSort
        sx={{ minWidth: 140 }}
        render={(record) => <DeckLink record={record} />}
      />
      <DataTable.Col<AdminDeckRow>
        source="description"
        label="Description"
        disableSort
        render={(record) =>
          record.description ? (
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {record.description}
            </Typography>
          ) : (
            "—"
          )
        }
      />
      <DataTable.Col<AdminDeckRow>
        source="itemCount"
        label="Items"
        disableSort
        align="right"
      />
      <DataTable.Col<AdminDeckRow>
        source="availability"
        label="Availability"
        disableSort
        render={(record) => deckAvailabilityText(record)}
      />
    </DataTable>
  );
}
