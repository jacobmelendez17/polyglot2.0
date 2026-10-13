"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import { isDenial, type AdminErrorDescription } from "./admin-api-error";
import type { StatusImpact } from "./status-impact";

/**
 * The explicit confirmation before a status change that matters (spec 26 §5:
 * "A UI save must not implicitly publish"; the level screen's going live or
 * dark, the group screen's archive). A plain Save never carries such a change
 * through on its own: it is a decision, so it is asked about.
 *
 * Nothing is sent until the person confirms. While the request is in flight it
 * cannot be dismissed (it must be allowed to finish and be seen), a failure is
 * reported here — in the dialog that caused it — and a lost permission offers
 * only "Close".
 */
export function StatusImpactDialog({
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
  const denied = isDenial(failure);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      aria-labelledby="status-impact-title"
      aria-describedby="status-impact-body"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <DialogTitle id="status-impact-title">{impact.title}</DialogTitle>

      <DialogContent>
        <DialogContentText id="status-impact-body">
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
            <Button
              variant="contained"
              color={impact.destructive ? "error" : "primary"}
              onClick={onConfirm}
              disabled={saving}
            >
              {saving ? "Saving…" : failure ? "Try again" : impact.confirmLabel}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
