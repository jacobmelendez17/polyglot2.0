"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { itemResourceAction } from "@/app/(admin)/admin/curriculum/actions";
import type { ItemDetailResourceSource } from "@/domains/curriculum";

type ItemResourceEditorProps = {
  learningItemId: string;
  resources: ItemDetailResourceSource[];
};

/**
 * Authoring an item's external resource links (spec 18).
 *
 * Official content only — a learner's own notes and examples are private and
 * never appear here, so this editor has no notion of them.
 *
 * The URL is validated server-side (`http`/`https` only, in the action's
 * schema) rather than here alone: this control is convenience, the action is
 * the boundary. Like the other child collections, changes are live rather
 * than drafted.
 */
export function ItemResourceEditor({ learningItemId, resources }: ItemResourceEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", url: "" });

  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error?.message ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  const key = () => crypto.randomUUID();

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= resources.length) return;
    const order = resources.map((resource) => resource.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    run(() => itemResourceAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "reorder", orderedIds: order } }));
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Resources</h2>
        <p className="mt-1 text-sm text-muted-foreground">External links shown to learners. Changes are live immediately.</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      {resources.length === 0 ? <p className="text-sm text-muted-foreground">No resources yet.</p> : null}

      <div className="flex flex-col gap-2">
        {resources.map((resource, index) => (
          <div key={resource.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Input
              className="w-44"
              defaultValue={resource.label}
              aria-label={`Label for ${resource.label}`}
              onBlur={(event) => {
                const label = event.target.value.trim();
                if (label === "" || label === resource.label) return;
                run(() => itemResourceAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "update", resourceId: resource.id, label } }));
              }}
            />
            <Input
              className="min-w-56 flex-1"
              defaultValue={resource.url}
              aria-label={`Link for ${resource.label}`}
              onBlur={(event) => {
                const url = event.target.value.trim();
                if (url === "" || url === resource.url) return;
                run(() => itemResourceAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "update", resourceId: resource.id, url } }));
              }}
            />
            <Button type="button" variant="ghost" size="icon" aria-label={`Move ${resource.label} earlier`} disabled={isPending || index === 0} onClick={() => move(index, -1)}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move ${resource.label} later`}
              disabled={isPending || index === resources.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete ${resource.label}`}
              disabled={isPending}
              onClick={() => run(() => itemResourceAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "delete", resourceId: resource.id } }))}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
        <label className="text-sm">
          <span className="font-medium text-foreground">Label</span>
          <Input
            className="mt-1 w-44"
            value={draft.label}
            placeholder="Conjugation table"
            onChange={(event) => setDraft((previous) => ({ ...previous, label: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-foreground">Link</span>
          <Input
            className="mt-1 w-72"
            value={draft.url}
            placeholder="https://..."
            onChange={(event) => setDraft((previous) => ({ ...previous, url: event.target.value }))}
          />
        </label>
        <Button
          type="button"
          disabled={isPending || draft.label.trim() === "" || draft.url.trim() === ""}
          onClick={() => {
            const { label, url } = draft;
            setDraft({ label: "", url: "" });
            run(() => itemResourceAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "create", label: label.trim(), url: url.trim() } }));
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add resource
        </Button>
      </div>
    </section>
  );
}
