"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListContext, useNotify, useTranslate } from "react-admin";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import DialogContentText from "@mui/material/DialogContentText";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import { bulkConfirmVocabularyMappingsAction } from "@/app/(admin)/admin/dictionary/actions";
import type { AdminDictionaryRow } from "@/domains/admin";

import { BulkCommandDialog } from "../curriculum/bulk-command-dialog";
import { useCreateCommand } from "../use-create-command";
import { dictionaryActionError } from "./dictionary-action-error";

const words = (count: number) => `${count} word${count === 1 ? "" : "s"}`;

/**
 * "Confirm 3 mappings?" — the batch confirmation of reviewed matches (spec 13),
 * as a question that says what it will do to *these* words before anything is
 * sent. It is the existing `bulkConfirmVocabularyMappingsAction`, unchanged: it
 * re-checks `canManageCurriculum` itself, locks each selected match against
 * automatic replacement, and then applies each confirmed match's approved
 * dictionary fields to its item as a draft — it never publishes, and it never
 * changes a term or a primary graded meaning.
 *
 * The request is the set of words, so its idempotency key follows the *set*
 * (`useCreateCommand`): pressing "Try again" after a lost answer sends the same
 * request under the same key, and a different selection is a new intent.
 */
function ConfirmMappingsDialog({
  rows,
  onClose,
  onDone,
  onReload,
}: {
  /** A snapshot: a refetch behind the dialog cannot change what it will send. */
  rows: AdminDictionaryRow[];
  onClose: () => void;
  onDone: (confirmed: number) => void;
  onReload: () => void;
}) {
  const { create, pending, failure } = useCreateCommand<
    { vocabularyItemIds: string[] },
    { confirmed: string[] }
  >({
    resource: "dictionary",
    send: async (request, idempotencyKey) => {
      const result = await bulkConfirmVocabularyMappingsAction({
        vocabularyItemIds: request.vocabularyItemIds,
        idempotencyKey,
      });
      if (!result.ok) throw dictionaryActionError(result.error);
      return result.data;
    },
    onCreated: (result) => onDone(result.confirmed.length),
  });

  return (
    <BulkCommandDialog
      titleId="confirm-mappings-title"
      title={`Confirm ${rows.length} mapping${rows.length === 1 ? "" : "s"}?`}
      confirmLabel="Confirm"
      pendingLabel="Confirming…"
      pending={pending}
      failure={failure}
      onConfirm={() =>
        void create({ vocabularyItemIds: rows.map((row) => row.id) })
      }
      onClose={onClose}
      onReload={onReload}
    >
      <DialogContentText>
        Each selected match becomes locked against future automatic changes, and
        its approved dictionary fields are applied to the word as a draft — a
        published word is not changed until someone publishes that draft. Only
        confirm rows you&apos;ve actually reviewed: this doesn&apos;t re-check
        them for you.
      </DialogContentText>
      <Box
        component="ul"
        aria-label="Words to confirm"
        tabIndex={0}
        sx={{
          listStyle: "none",
          m: 0,
          mt: 2,
          p: 0,
          maxHeight: 176,
          overflowY: "auto",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius)",
          "&:focus-visible": { outline: "2px solid var(--ring)" },
        }}
      >
        {rows.map((row) => (
          <Box
            component="li"
            key={row.id}
            sx={{
              px: 1.5,
              py: 0.75,
              "&:not(:last-of-type)": {
                borderBottom: "1px solid var(--border-default)",
              },
            }}
          >
            <Typography variant="body2" noWrap>
              {row.displayWord}
              {row.entryLemma ? (
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ color: "text.secondary" }}
                >
                  {" "}
                  · {row.entryLemma}
                </Typography>
              ) : null}
            </Typography>
          </Box>
        ))}
      </Box>
    </BulkCommandDialog>
  );
}

/**
 * The selection bar for the mapping queue (spec 26 Unit 9), on React Admin's
 * selection state: what is selected is the list context's `selectedIds`, and
 * what the bar does with it is one explicit command — confirm the reviewed
 * matches. There is no bulk "pick for me": which entry, sense or pronunciation
 * is right is decided on the word's own page.
 *
 * Only rows with something to confirm can be selected (a candidate that is not
 * confirmed already — `confirmable`), so the count is always what the command
 * will act on. The selection is cleared by the list when the page or any filter
 * changes, and a question open about it closes with it.
 */
export function DictionaryConfirmBar() {
  const { data, selectedIds, onUnselectItems } =
    useListContext<AdminDictionaryRow>();
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<AdminDictionaryRow[] | null>(null);

  const rows = (data ?? []).filter((row) => selectedIds.includes(row.id));

  // The selection is gone (the page or the filters changed), and so is the
  // question about it. Adjusted during render, not in an effect, so a closed
  // question never paints once more against new rows.
  const openRows = rows.length > 0 ? dialog : null;
  if (dialog && !openRows) setDialog(null);

  function finish() {
    setDialog(null);
    onUnselectItems();
  }

  return (
    <>
      {rows.length > 0 ? (
        <Box
          // A labelled group, not `role="toolbar"`: a toolbar promises arrow-key
          // movement between its controls, and this is one ordinary tab stop.
          role="group"
          aria-label="Actions for the selected words"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 2,
            rowGap: 0.5,
            px: 2,
            py: 1,
            borderBottom: "1px solid var(--border-default)",
            backgroundColor: "action.hover",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <IconButton
              size="small"
              aria-label={translate("ra.action.unselect", { _: "Unselect" })}
              title={translate("ra.action.unselect", { _: "Unselect" })}
              onClick={() => onUnselectItems()}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="body2"
              aria-live="polite"
              sx={{ fontWeight: 600 }}
            >
              {words(rows.length)} selected
            </Typography>
          </Box>
          <Box sx={{ ml: { sm: "auto" } }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => setDialog(rows)}
            >
              Confirm selected
            </Button>
          </Box>
        </Box>
      ) : null}

      {openRows ? (
        <ConfirmMappingsDialog
          rows={openRows}
          onClose={() => setDialog(null)}
          onDone={(confirmed) => {
            notify(
              confirmed === openRows.length
                ? `Confirmed ${confirmed} mapping${confirmed === 1 ? "" : "s"}.`
                : `Confirmed ${confirmed} of ${openRows.length} mappings; the rest needed no change.`,
              { type: "success" },
            );
            finish();
          }}
          // After a stale refusal: look at the queue again, from nothing selected.
          onReload={() => {
            finish();
            void queryClient.invalidateQueries({ queryKey: ["dictionary"] });
          }}
        />
      ) : null}
    </>
  );
}
