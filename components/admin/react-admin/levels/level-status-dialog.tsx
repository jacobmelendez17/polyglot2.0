"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import type { AdminErrorDescription } from "../admin-api-error";
import type { StatusImpact } from "./level-edit-model";

/** Failures a second attempt cannot fix: the person is signed out or not allowed. */
const DENIED_KINDS = new Set(["forbidden", "unauthenticated"]);

/**
 * The explicit confirmation before a level goes live or dark (spec 26 §5: "A UI
 * save must not implicitly publish"). A level's `published` status gates the
 * level page, lessons, decks and item pages, so changing it is a decision about
 * what learners can reach — not a side effect of pressing Save.
 *
 * Nothing is sent until the person confirms. While the request is in flight it
 * cannot be dismissed (it must be allowed to finish and be seen), and a failure
 * is reported here, in the dialog that caused it.
 */
export function LevelStatusDialog({
  impact,
  from,
  to,
  saving,
  failure,
  onConfirm,
  onClose,
}: {
  impact: StatusImpact;
  /** Display labels for the change being confirmed, e.g. "Draft" and "Published". */
  from: string;
  to: string;
  saving: boolean;
  failure: AdminErrorDescription | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const denied = failure !== null && DENIED_KINDS.has(failure.kind);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      aria-labelledby="level-status-title"
      aria-describedby="level-status-impact"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <DialogTitle id="level-status-title">{impact.title}</DialogTitle>

      <DialogContent>
        <DialogContentText id="level-status-impact">
          {impact.body}
        </DialogContentText>
        <DialogContentText sx={{ mt: 1.5, fontWeight: 500 }}>
          Status: {from} → {to}
        </DialogContentText>

        {failure ? (
          <Alert severity={denied ? "warning" : "error"} sx={{ mt: 2 }}>
            {failure.message}
          </Alert>
        ) : null}
      </DialogContent>

      <DialogActions>
        {denied ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button color="inherit" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={onConfirm} disabled={saving}>
              {saving ? "Saving…" : failure ? "Try again" : impact.confirmLabel}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
