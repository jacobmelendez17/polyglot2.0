"use client";

import { TextInput, useDataProvider } from "react-admin";
import { useRouter } from "next/navigation";

import type {
  AdminGroupCreateRequest,
  AdminGroupCreateResult,
} from "@/domains/admin";

import type { AdminDataProvider } from "../admin-data-provider";
import { AdminFormDialog } from "../admin-form-dialog";
import { useCreateCommand } from "../use-create-command";
import { checkGroupName } from "./group-edit-model";

type FormValues = { name: string | null };

/**
 * "Add group" (spec 26 Unit 5): the form the old dialog was, on React Admin's
 * form primitives, calling the explicit `createGroup` command.
 *
 * A group is added to **the level the list is showing**, and the dialog says
 * which. (The dialog it replaces had its own level select, seeded once from the
 * page and so stale after the filter changed; the filter is the one place a
 * level is chosen now.) It is appended after the level's existing groups — the
 * server computes the position, and there is no position here to type — and
 * creating one changes nothing learners see: a group's own status is not what
 * hides its content.
 *
 * The dialog's behavior (a refusal shown in it with what was typed kept, a
 * denial offering only Close, no dismissal mid-request) is `AdminFormDialog`'s;
 * the request's idempotency key follows the request (`useCreateCommand`). The
 * new group's page opens on success, as before.
 */
export function CreateGroupDialog({
  languageId,
  levelId,
  levelNumber,
  onClose,
}: {
  languageId: string;
  levelId: string;
  /** Only to say which level the group goes in. */
  levelNumber: number | undefined;
  onClose: () => void;
}) {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const router = useRouter();

  const { create, pending, failure } = useCreateCommand<
    Omit<AdminGroupCreateRequest, "idempotencyKey">,
    AdminGroupCreateResult
  >({
    resource: "groups",
    send: (request, idempotencyKey) =>
      dataProvider.createGroup({ ...request, idempotencyKey }),
    onCreated: ({ groupId }) => {
      onClose();
      router.push(`/admin/curriculum/groups/${groupId}`);
    },
  });

  return (
    <AdminFormDialog<FormValues>
      titleId="create-group-title"
      title="Add a vocabulary group"
      description={
        levelNumber === undefined
          ? "New groups are added after the existing groups in the level."
          : `New groups are added after the existing groups in Level ${levelNumber}.`
      }
      defaultValues={{ name: null }}
      onSubmit={(values) =>
        create({ languageId, levelId, name: (values.name ?? "").trim() })
      }
      submitLabel="Add group"
      pendingLabel="Adding…"
      pending={pending}
      failure={failure}
      onClose={onClose}
    >
      <TextInput
        source="name"
        label="Name"
        validate={checkGroupName}
        autoFocus
        fullWidth
      />
    </AdminFormDialog>
  );
}
