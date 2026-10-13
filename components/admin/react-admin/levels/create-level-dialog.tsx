"use client";

import {
  NumberInput,
  TextInput,
  minValue,
  required,
  useDataProvider,
} from "react-admin";
import { useRouter } from "next/navigation";

import type {
  AdminLevelCreateRequest,
  AdminLevelCreateResult,
} from "@/domains/admin";

import { AdminFormDialog } from "../admin-form-dialog";
import type { AdminDataProvider } from "../admin-data-provider";
import { useCreateCommand } from "../use-create-command";

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
 * The dialog's behavior (a refusal shown in it with what was typed kept, a
 * denial offering only Close, no dismissal mid-request) is `AdminFormDialog`'s;
 * the request's idempotency key follows the request (`useCreateCommand`). A
 * level number the language already has comes back as a plain sentence and
 * leaves the form open.
 */
export function CreateLevelDialog({
  languageId,
  onClose,
}: {
  languageId: string;
  onClose: () => void;
}) {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const router = useRouter();

  const { create, pending, failure } = useCreateCommand<
    Omit<AdminLevelCreateRequest, "idempotencyKey">,
    AdminLevelCreateResult
  >({
    resource: "levels",
    send: (request, idempotencyKey) =>
      dataProvider.createLevel({ ...request, idempotencyKey }),
    onCreated: ({ levelId }) => {
      onClose();
      router.push(`/admin/curriculum/levels/${levelId}`);
    },
  });

  return (
    <AdminFormDialog<FormValues>
      titleId="create-level-title"
      title="Add a level"
      description="New levels start as drafts until their curriculum is built out and published."
      defaultValues={{ levelNumber: null, name: null }}
      onSubmit={(values) => {
        const name = values.name?.trim() ?? "";
        return create({
          languageId,
          levelNumber: Number(values.levelNumber),
          ...(name === "" ? {} : { name }),
        });
      }}
      submitLabel="Add level"
      pendingLabel="Adding…"
      pending={pending}
      failure={failure}
      onClose={onClose}
    >
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
    </AdminFormDialog>
  );
}
