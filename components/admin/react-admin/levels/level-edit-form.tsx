"use client";

import { useState } from "react";
import {
  Form,
  FormDataConsumer,
  SaveButton,
  SelectInput,
  TextInput,
  required,
  useDataProvider,
} from "react-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import CheckIcon from "@mui/icons-material/Check";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type {
  AdminLevelUpdateRequest,
  AdminLevelUpdateResult,
} from "@/domains/admin";

import { describeAdminError, type AdminApiError } from "../admin-api-error";
import type { AdminErrorDescription } from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";
import { useIntentKey } from "../use-intent-key";
import {
  CEFR_CHOICES,
  CEFR_NONE,
  CEFR_NONE_TEXT,
  STATUS_CHOICES,
  changedFields,
  describeLevelContents,
  readLevelFields,
  statusImpact,
  type LevelFields,
  type LevelFormValues,
} from "./level-edit-model";
import { LevelStatusDialog } from "./level-status-dialog";

type Counts = {
  vocabularyItems: number;
  grammarItems: number;
  vocabularyGroups: number;
};

/** A save held back until the person confirms what it will do to learners. */
type Confirming = {
  changes: Omit<AdminLevelUpdateRequest, "idempotencyKey">;
  next: LevelFields;
  from: LevelFields["status"];
  to: LevelFields["status"];
};

const label = (status: string) =>
  STATUS_CHOICES.find((choice) => choice.id === status)?.name ?? status;

/**
 * The level's metadata form (spec 26 Unit 4): name, CEFR band, and status, on
 * React Admin's form primitives, saving through the explicit `updateLevel`
 * command. It replaces the hand-built form on the same page; the specialist
 * `LevelItemBoard` below it is untouched.
 *
 * - **Only what changed is sent.** A level has no version to check (the schema
 *   is unchanged in this unit), so saving is last-write-wins; sending just the
 *   changed fields keeps an edit to the name from also overwriting a status
 *   someone else changed meanwhile.
 * - **A status change that alters what learners see asks first** (see
 *   `statusImpact`): publishing a level or taking one off-line is a decision,
 *   never a side effect of Save.
 * - **Idempotency** follows `useIntentKey`: a retry of an identical failed save
 *   reuses its key (it may have got through, and is then answered from the
 *   stored result); a changed save gets a new one.
 *
 * Counts are shown for information. A level holds any number of any kind of
 * item and publishing it is an Admin's call (spec 17; no 48/12 gate).
 */
export function LevelEditForm({
  levelId,
  levelNumber,
  initial,
  counts,
}: {
  levelId: string;
  levelNumber: number;
  initial: LevelFields;
  counts: Counts;
}) {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const keys = useIntentKey();

  // What the server holds, as far as this screen knows — moved forward by a
  // save that succeeded, which is also what resets the form to "unchanged".
  const [baseline, setBaseline] = useState<LevelFields>(initial);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [failure, setFailure] = useState<AdminErrorDescription | null>(null);
  const [saved, setSaved] = useState(false);

  const update = useMutation<
    AdminLevelUpdateResult,
    AdminApiError,
    { levelId: string; input: AdminLevelUpdateRequest }
  >({
    mutationFn: ({ levelId: id, input }) => dataProvider.updateLevel(id, input),
    // A command is retried by a person pressing the button again.
    retry: false,
  });

  /** Sends the change. Resolves whether it was accepted; a refusal is shown, not thrown. */
  async function send(
    changes: Confirming["changes"],
    next: LevelFields,
  ): Promise<boolean> {
    setFailure(null);
    try {
      await update.mutateAsync({
        levelId,
        input: {
          ...changes,
          idempotencyKey: keys.keyFor({ levelId, ...changes }),
        },
      });
      // Spent. Moving the baseline below already makes an identical next
      // request impossible (it would change nothing), so this is belt and
      // braces — but it states the rule, for whoever decouples the two.
      keys.completed();
      setBaseline(next);
      setSaved(true);
      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: ["levels"] });
      // The page's own heading and the board beneath it are server-rendered.
      router.refresh();
      return true;
    } catch (error) {
      setFailure(describeAdminError(error));
      return false;
    }
  }

  async function submit(values: LevelFormValues) {
    const next = readLevelFields(values, baseline);
    const changes = changedFields(baseline, next);
    if (Object.keys(changes).length === 0) return;

    setSaved(false);
    setFailure(null);
    if (statusImpact(levelNumber, baseline.status, next.status)) {
      setConfirming({
        changes,
        next,
        from: baseline.status,
        to: next.status,
      });
      return;
    }
    await send(changes, next);
  }

  const impact = confirming
    ? statusImpact(levelNumber, confirming.from, confirming.to)
    : null;

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Form<LevelFormValues>
        onSubmit={submit}
        defaultValues={{
          name: baseline.name,
          cefrLevel: baseline.cefrLevel ?? CEFR_NONE,
          status: baseline.status,
        }}
        // React Admin's validators, not the browser's tooltips.
        noValidate
      >
        <TextInput
          source="name"
          label="Name"
          helperText="Optional."
          fullWidth
        />
        <SelectInput
          source="cefrLevel"
          label="CEFR band"
          choices={CEFR_CHOICES}
          emptyValue={CEFR_NONE}
          emptyText={CEFR_NONE_TEXT}
          helperText="Shown on every item page in this level. Leave unset and item pages simply omit it."
          fullWidth
        />
        <SelectInput
          source="status"
          label="Status"
          choices={STATUS_CHOICES}
          validate={required()}
          helperText={false}
          fullWidth
        />

        <Typography
          variant="body2"
          sx={{ color: "text.secondary", mt: 1, mb: 2 }}
        >
          {describeLevelContents(counts)}
        </Typography>

        {failure && !confirming ? (
          <Alert
            severity={
              failure.kind === "forbidden" || failure.kind === "unauthenticated"
                ? "warning"
                : "error"
            }
            sx={{ mb: 2 }}
          >
            {failure.message}
          </Alert>
        ) : null}

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <SaveButton label="Save" />
          {/* Always in the page, so assistive technology announces its text
              when it appears; it is shown only while nothing has changed since. */}
          <Box role="status" aria-live="polite">
            <FormDataConsumer<LevelFormValues>>
              {({ formData }) =>
                saved &&
                Object.keys(
                  changedFields(baseline, readLevelFields(formData, baseline)),
                ).length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      color: "success.main",
                    }}
                  >
                    <CheckIcon fontSize="small" aria-hidden="true" />
                    Saved
                  </Typography>
                ) : null
              }
            </FormDataConsumer>
          </Box>
        </Box>
      </Form>

      {confirming && impact ? (
        <LevelStatusDialog
          impact={impact}
          from={label(confirming.from)}
          to={label(confirming.to)}
          saving={update.isPending}
          failure={failure}
          onConfirm={() => void send(confirming.changes, confirming.next)}
          onClose={() => {
            setConfirming(null);
            setFailure(null);
          }}
        />
      ) : null}
    </Box>
  );
}
