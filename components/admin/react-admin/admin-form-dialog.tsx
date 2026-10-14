"use client";

import type { ReactNode } from "react";
import { Form, SaveButton } from "react-admin";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import { isDenial, type AdminErrorDescription } from "./admin-api-error";

/**
 * The dialog around an Admin "add one" form (spec 26 Units 4-5): React Admin's
 * `Form` with its validators — not the browser's tooltips (`noValidate`) — a
 * submit that waits until something is typed, and the failure handling every
 * such dialog shares:
 *
 * - a refusal appears **in the dialog** with what was typed kept, so it can be
 *   fixed and sent again;
 * - a lost permission offers only **Close**, as a warning, never "Try again";
 * - while the request is in flight the dialog cannot be dismissed (it must be
 *   allowed to finish and be seen), the submit says so, and Cancel is disabled.
 *
 * What the form *asks* is the caller's: `children` are its fields.
 */
export function AdminFormDialog<Values extends Record<string, unknown>>({
  titleId,
  title,
  description,
  defaultValues,
  onSubmit,
  submitLabel,
  pendingLabel,
  pending,
  failure,
  onClose,
  closeOnly,
  children,
}: {
  titleId: string;
  title: string;
  description: string;
  defaultValues: Values;
  onSubmit: (values: Partial<Values>) => Promise<void>;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  failure: AdminErrorDescription | null;
  onClose: () => void;
  /**
   * Whether this failure can only be answered by closing. By default that is a
   * lost permission; a screen adds the refusals it knows a retry cannot fix (a
   * stale view, "that would leave no Admin").
   */
  closeOnly?: boolean;
  children: ReactNode;
}) {
  const denied = closeOnly ?? isDenial(failure);

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
      <Form<Record<string, unknown>>
        // React Admin types a form's values loosely (`any`); `Values` is what
        // the caller's fields declare, so this is where one is read as the other.
        onSubmit={(values: Record<string, unknown>) =>
          onSubmit(values as Partial<Values>)
        }
        defaultValues={defaultValues}
        // React Admin's validators say what is wrong, in the page, in the
        // app's own words. Without this the browser's native `min`/`step`
        // check blocks the submit first, with its own tooltip and no
        // message in the form.
        noValidate
      >
        <DialogTitle id={titleId}>{title}</DialogTitle>

        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>{description}</DialogContentText>

          {children}

          {failure ? (
            <Alert severity={denied ? "warning" : "error"} sx={{ mt: 1 }}>
              {failure.message}
            </Alert>
          ) : null}
        </DialogContent>

        <DialogActions>
          {denied ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button color="inherit" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <SaveButton
                label={pending ? pendingLabel : submitLabel}
                icon={<></>}
              />
            </>
          )}
        </DialogActions>
      </Form>
    </Dialog>
  );
}
