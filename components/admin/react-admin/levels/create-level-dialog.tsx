"use client";

import { useState } from "react";
import {
  Form,
  NumberInput,
  SaveButton,
  TextInput,
  minValue,
  required,
  useDataProvider,
} from "react-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import type {
  AdminLevelCreateRequest,
  AdminLevelCreateResult,
} from "@/domains/admin";

import {
  describeAdminError,
  type AdminApiError,
  type AdminErrorDescription,
} from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";
import { useIntentKey } from "../use-intent-key";

/** Failures a second attempt cannot fix: the person is signed out or not allowed. */
const DENIED_KINDS = new Set(["forbidden", "unauthenticated"]);

/** The level number is a whole number; `minValue(1)` and `required()` cover the rest of the rule. */
const wholeNumber = (value: unknown) =>
  value == null || Number.isInteger(value) ? undefined : "Enter a whole number";

type FormValues = { levelNumber: number | null; name: string | null };

/**
 * "Add level" (spec 26 Unit 4): the form the old dialog was, on React Admin's
 * form primitives, calling the explicit `createLevel` command.
 *
 * A new level starts as a draft with nothing attached — content is built out
 * afterwards from the Curriculum page — so this asks only for a number and an
 * optional name, and **creating it makes nothing visible to learners** (a level
 * is only live once an Admin publishes it). That is why there is no impact
 * confirmation here, unlike changing a level's status.
 *
 * **Idempotency.** This request can change between attempts (a taken number is
 * fixed and sent again), which one key per dialog could not handle; see
 * `useIntentKey` for the rule. A level number the language already has comes
 * back as a plain sentence and leaves the form open with what was typed.
 */
export function CreateLevelDialog({
  languageId,
  onClose,
}: {
  languageId: string;
  onClose: () => void;
}) {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const keys = useIntentKey();
  const [failure, setFailure] = useState<AdminErrorDescription | null>(null);

  const create = useMutation<
    AdminLevelCreateResult,
    AdminApiError,
    AdminLevelCreateRequest
  >({
    mutationFn: (input) => dataProvider.createLevel(input),
    // A command is retried by a person pressing the button again, under the
    // rule in `useIntentKey` — never automatically.
    retry: false,
  });

  async function submit(values: Partial<FormValues>) {
    const name = values.name?.trim() ?? "";
    const request = {
      languageId,
      levelNumber: Number(values.levelNumber),
      ...(name === "" ? {} : { name }),
    };
    setFailure(null);
    try {
      const { levelId } = await create.mutateAsync({
        ...request,
        idempotencyKey: keys.keyFor(request),
      });
      // No `keys.completed()`: the dialog closes (unmounts) on success, and a
      // reopened one starts with a new hook and so a new key. A form that
      // stays mounted after saving — the level edit form — must spend it.
      void queryClient.invalidateQueries({ queryKey: ["levels"] });
      onClose();
      router.push(`/admin/curriculum/levels/${levelId}`);
    } catch (error) {
      setFailure(describeAdminError(error));
    }
  }

  const denied = failure !== null && DENIED_KINDS.has(failure.kind);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      aria-labelledby="create-level-title"
      // A request in flight must be allowed to finish and be seen.
      onClose={() => {
        if (!create.isPending) onClose();
      }}
    >
      <Form<FormValues>
        onSubmit={submit}
        defaultValues={{ levelNumber: null, name: null }}
        // React Admin's validators say what is wrong, in the page, in the
        // app's own words. Without this the browser's native `min`/`step`
        // check blocks the submit first, with its own tooltip and no
        // message in the form.
        noValidate
      >
        <DialogTitle id="create-level-title">Add a level</DialogTitle>

        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            New levels start as drafts until their curriculum is built out and
            published.
          </DialogContentText>

          <NumberInput
            source="levelNumber"
            label="Level number"
            validate={[required(), minValue(1), wholeNumber]}
            min={1}
            step={1}
            autoFocus
            fullWidth
          />
          <TextInput source="name" label="Name (optional)" fullWidth />

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
              <Button
                color="inherit"
                onClick={onClose}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <SaveButton
                label={create.isPending ? "Adding…" : "Add level"}
                icon={<></>}
              />
            </>
          )}
        </DialogActions>
      </Form>
    </Dialog>
  );
}
