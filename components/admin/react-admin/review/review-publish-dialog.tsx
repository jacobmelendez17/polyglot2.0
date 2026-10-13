"use client";

import { useState } from "react";
import { useNotify } from "react-admin";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

import type { AdminReviewRow } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import {
  usePublishReviewItem,
  useReloadReview,
} from "./use-publish-review-item";

/**
 * What publishing does, in terms of what learners will see — the same two
 * statements the item page's `PublishDialog` makes (an edit replaces live
 * content and keeps learner progress; a new item appears for the first time),
 * worded for a reviewer looking at someone else's work.
 */
const IMPACT = {
  edit: "This will replace the currently live content with the edited version. Existing learner progress stays attached to this item.",
  new: "This item will become visible to learners for the first time.",
} as const;

/**
 * Failures that mean *the row on screen is out of date* — someone else
 * published it first, it was removed, or it can no longer be published. The
 * answer is to look at the queue again, never to resend: resending blind would
 * apply this person's outdated view on top of whatever changed underneath.
 */
const STALE_KINDS = new Set(["conflict", "not_found", "validation"]);

/** Failures a second attempt cannot fix: the person is signed out or not allowed. */
const DENIED_KINDS = new Set(["forbidden", "unauthenticated"]);

/**
 * The explicit confirmation before publishing a queued item (spec 26 Unit 3:
 * "explicit confirmation/impact when publication can change learner-visible
 * content"). The old queue published on a single click.
 *
 * **Idempotency.** The key is generated once, when the dialog opens, and
 * reused for every attempt while it stays open — so pressing "Try again" after
 * a network failure whose request *did* reach the server is answered from the
 * stored result instead of publishing twice. Closing and reopening is a new
 * intent and gets a new key. (The caller mounts this component only while a
 * row is selected, which is what ties the key's life to the dialog's.)
 *
 * **Concurrency.** The row's `version` rides along as `expectedVersion`. If the
 * item changed since the list loaded, the server answers 409 and this dialog
 * offers "Reload" instead of a retry.
 */
export function ReviewPublishDialog({
  row,
  onClose,
}: {
  row: AdminReviewRow;
  onClose: () => void;
}) {
  const notify = useNotify();
  const publish = usePublishReviewItem();
  const reload = useReloadReview();
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const failure = publish.error ? describeAdminError(publish.error) : null;
  const stale = failure !== null && STALE_KINDS.has(failure.kind);
  const denied = failure !== null && DENIED_KINDS.has(failure.kind);

  function confirm() {
    publish.mutate(
      { itemId: row.id, expectedVersion: row.version, idempotencyKey },
      {
        onSuccess: () => {
          notify(`Published “${row.itemLabel}”`, { type: "success" });
          onClose();
        },
      },
    );
  }

  function reloadQueue() {
    void reload();
    onClose();
  }

  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      aria-labelledby="review-publish-title"
      aria-describedby="review-publish-impact"
      // A request in flight must be allowed to finish and be seen.
      onClose={() => {
        if (!publish.isPending) onClose();
      }}
    >
      <DialogTitle id="review-publish-title">
        Publish “{row.itemLabel}”?
      </DialogTitle>

      <DialogContent>
        <DialogContentText id="review-publish-impact">
          {IMPACT[row.kind]}
        </DialogContentText>

        <Box component="dl" sx={{ m: 0, mt: 2, display: "grid", gap: 0.5 }}>
          <Detail label="Meaning" value={row.meaningLabel} />
          <Detail
            label="Where"
            value={`Level ${row.levelNumber}${row.groupName ? ` · ${row.groupName}` : ""}`}
          />
          {row.authorName ? (
            <Detail label="Edited by" value={row.authorName} />
          ) : null}
        </Box>

        {failure ? (
          <Alert severity={denied ? "warning" : "error"} sx={{ mt: 2 }}>
            {failure.message}
          </Alert>
        ) : null}
      </DialogContent>

      <DialogActions>
        {stale ? (
          <Button variant="contained" onClick={reloadQueue}>
            Reload
          </Button>
        ) : denied ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button
              color="inherit"
              onClick={onClose}
              disabled={publish.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={confirm}
              disabled={publish.isPending}
            >
              {publish.isPending
                ? "Publishing…"
                : failure
                  ? "Try again"
                  : "Publish"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Typography
        component="dt"
        variant="body2"
        sx={{ color: "text.secondary", minWidth: "5.5rem" }}
      >
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0 }}>
        {value}
      </Typography>
    </Box>
  );
}
