"use client";

import type { ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";

import {
  isDenial,
  type AdminApiErrorKind,
  type AdminErrorDescription,
} from "../admin-api-error";
import type { BulkRow } from "./bulk-selection";

/**
 * Failures that mean *what was selected is out of date* — someone else
 * published, archived or moved some of it first, an item is gone, or the batch
 * no longer fits (an item that is not in this language, a level that is not
 * either). The answer is to look at the list again, never to resend: resending
 * would apply this person's old view on top of whatever changed underneath.
 */
const STALE_KINDS: ReadonlySet<AdminApiErrorKind> = new Set([
  "conflict",
  "not_found",
  "validation",
]);

export function isStaleFailure(failure: AdminErrorDescription | null): boolean {
  return failure !== null && STALE_KINDS.has(failure.kind);
}

/**
 * The confirmation around one bulk command (spec 26 Unit 7): what it will do
 * to what was selected, said before anything is sent, and the failure handling
 * every bulk dialog shares —
 *
 * - while the request is in flight the dialog cannot be dismissed (it must be
 *   allowed to finish and be seen), and Cancel is disabled;
 * - a refusal appears **in the dialog**, so what was chosen is not lost;
 * - a **stale** refusal offers only "Reload the list", never a blind retry;
 * - a lost permission offers only "Close", as a warning, never "Try again".
 *
 * What the command *says* is the caller's: `children` are its impact.
 */
export function BulkCommandDialog({
  titleId,
  title,
  confirmLabel,
  pendingLabel,
  destructive = false,
  canConfirm = true,
  pending,
  failure,
  onConfirm,
  onClose,
  onReload,
  children,
}: {
  titleId: string;
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  /** Style the confirm button as a warning: the command takes something out of use. */
  destructive?: boolean;
  /** Whether there is something to confirm (a target chosen, and something that would change). */
  canConfirm?: boolean;
  pending: boolean;
  failure: AdminErrorDescription | null;
  onConfirm: () => void;
  onClose: () => void;
  /** What "Reload the list" does after a stale refusal; the caller also closes the dialog. */
  onReload: () => void;
  children: ReactNode;
}) {
  const denied = isDenial(failure);
  const stale = isStaleFailure(failure);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      aria-labelledby={titleId}
      // A request in flight must be allowed to finish and be seen.
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>

      <DialogContent>
        {children}

        {failure ? (
          <Alert severity={denied ? "warning" : "error"} sx={{ mt: 2 }}>
            {failure.message}
          </Alert>
        ) : null}
      </DialogContent>

      <DialogActions>
        {stale ? (
          <Button variant="contained" onClick={onReload}>
            Reload the list
          </Button>
        ) : denied ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button color="inherit" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color={destructive ? "error" : "primary"}
              onClick={onConfirm}
              disabled={pending || !canConfirm}
            >
              {pending ? pendingLabel : failure ? "Try again" : confirmLabel}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

const TYPE_LABEL = { vocabulary: "Vocabulary", grammar: "Grammar" } as const;

/**
 * The items a command is about, so the person confirms what they are *looking
 * at* rather than a count. Scrolls inside its own box when long, and that box
 * is focusable so a keyboard can scroll it.
 */
export function SelectedItemsList({
  rows,
  label,
}: {
  rows: readonly BulkRow[];
  label: string;
}) {
  return (
    <Box
      component="ul"
      aria-label={label}
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            px: 1.5,
            py: 0.75,
            "&:not(:last-of-type)": {
              borderBottom: "1px solid var(--border-default)",
            },
          }}
        >
          <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
            {row.itemLabel}
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {TYPE_LABEL[row.type]}
            </Typography>
            <CurriculumStatusBadge status={row.status} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** A short list of what a command will and will not do, for a dialog's body. */
export function ImpactNotes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <Box
      component="ul"
      sx={{
        m: 0,
        mt: 1.5,
        pl: 2.5,
        // The app's base styles take the markers away from every list.
        listStyle: "disc",
        "& li + li": { mt: 0.5 },
      }}
    >
      {notes.map((note) => (
        <Typography component="li" variant="body2" key={note}>
          {note}
        </Typography>
      ))}
    </Box>
  );
}
