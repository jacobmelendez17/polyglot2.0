"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { itemExampleAction, seedUsageContextsAction, usageContextAction } from "@/app/(admin)/admin/curriculum/actions";

export type UsageContextValue = { id: string; label: string; note: string | null; position: number; sourceForm: string | null };
export type ExampleValue = { id: string; usageContextId: string | null; position: number; targetText: string; translation: string };

type UsageContextEditorProps = {
  learningItemId: string;
  itemType: "vocabulary" | "grammar";
  contexts: UsageContextValue[];
  examples: ExampleValue[];
  /** True when a confirmed dictionary mapping exists, so seeding has something to read. */
  canSeedFromDictionary: boolean;
};

/** The tab an example with no context belongs to — spec 17's default, so nothing authored before contexts existed is stranded. */
const GENERAL = "general";

/**
 * Authoring a word's usage contexts and its examples (spec 17).
 *
 * Nothing in the application could write an example before this: the tables
 * existed and rendered to learners, but no surface created one. So this is
 * the example editor as much as it is the tab editor.
 *
 * Grammar items get the examples half only — they have no inflected forms
 * and no dictionary integration, so tabs would be an empty ceremony.
 */
export function UsageContextEditor({ learningItemId, itemType, contexts, examples, canSeedFromDictionary }: UsageContextEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newContextLabel, setNewContextLabel] = useState("");
  const [newExample, setNewExample] = useState({ targetText: "", translation: "", contextId: GENERAL });

  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>, message?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error?.message ?? "Something went wrong.");
        return;
      }
      if (message) setNotice(message);
      router.refresh();
    });
  }

  const key = () => crypto.randomUUID();

  function seed() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await seedUsageContextsAction({ learningItemId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setNotice(result.data.reason ?? `Added ${result.data.created} tab${result.data.created === 1 ? "" : "s"} from the dictionary.`);
      router.refresh();
    });
  }

  function moveContext(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= contexts.length) return;
    const order = contexts.map((context) => context.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    run(() => usageContextAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "reorder", learningItemId, orderedIds: order } }));
  }

  const examplesFor = (contextId: string | null) => examples.filter((example) => example.usageContextId === contextId);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {itemType === "vocabulary" ? "Usage contexts & examples" : "Examples"}
        </h2>
        {itemType === "vocabulary" && canSeedFromDictionary ? (
          <Button type="button" variant="outline" size="sm" onClick={seed} disabled={isPending}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Fill tabs from dictionary
          </Button>
        ) : null}
      </div>

      {itemType === "vocabulary" && !canSeedFromDictionary ? (
        <p className="text-sm text-muted-foreground">
          Confirm a dictionary match below and the word&apos;s forms can fill these tabs for you. You can always write them by hand.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {itemType === "vocabulary" ? (
        <div className="flex flex-col gap-3">
          {contexts.map((context, index) => (
            <div key={context.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-40"
                  defaultValue={context.label}
                  aria-label={`Label for ${context.label}`}
                  onBlur={(event) => {
                    const label = event.target.value.trim();
                    if (label === "" || label === context.label) return;
                    run(() => usageContextAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "update", usageContextId: context.id, label } }));
                  }}
                />
                <Input
                  className="min-w-48 flex-1"
                  defaultValue={context.note ?? ""}
                  placeholder="When this form is used (optional)"
                  aria-label={`Note for ${context.label}`}
                  onBlur={(event) => {
                    const note = event.target.value.trim();
                    if (note === (context.note ?? "")) return;
                    run(() => usageContextAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "update", usageContextId: context.id, note: note === "" ? null : note } }));
                  }}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${context.label} earlier`} disabled={isPending || index === 0} onClick={() => moveContext(index, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${context.label} later`} disabled={isPending || index === contexts.length - 1} onClick={() => moveContext(index, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${context.label}`}
                  disabled={isPending}
                  onClick={() => run(() => usageContextAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "delete", usageContextId: context.id } }), "Tab removed — its examples moved to General.")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <ExampleList examples={examplesFor(context.id)} isPending={isPending} onDelete={(exampleId) => run(() => itemExampleAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "delete", exampleId } }))} />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-40"
              value={newContextLabel}
              placeholder="New tab, e.g. como"
              aria-label="New usage context label"
              onChange={(event) => setNewContextLabel(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || newContextLabel.trim() === ""}
              onClick={() => {
                const label = newContextLabel.trim();
                setNewContextLabel("");
                run(() => usageContextAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "create", learningItemId, label } }));
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add tab
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-border p-3">
        <h3 className="text-sm font-medium text-foreground">{itemType === "vocabulary" ? "General" : "Examples"}</h3>
        <ExampleList examples={examplesFor(null)} isPending={isPending} onDelete={(exampleId) => run(() => itemExampleAction({ learningItemId, idempotencyKey: key(), mutation: { kind: "delete", exampleId } }))} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="font-medium text-foreground">Example</span>
          <Input
            className="mt-1 w-56"
            value={newExample.targetText}
            placeholder="Yo como pan."
            onChange={(event) => setNewExample((previous) => ({ ...previous, targetText: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-foreground">Translation</span>
          <Input
            className="mt-1 w-56"
            value={newExample.translation}
            placeholder="I eat bread."
            onChange={(event) => setNewExample((previous) => ({ ...previous, translation: event.target.value }))}
          />
        </label>
        {itemType === "vocabulary" && contexts.length > 0 ? (
          <label className="text-sm">
            <span className="font-medium text-foreground">Tab</span>
            <Select value={newExample.contextId} onValueChange={(value) => setNewExample((previous) => ({ ...previous, contextId: value }))}>
              <SelectTrigger className="mt-1 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GENERAL}>General</SelectItem>
                {contexts.map((context) => (
                  <SelectItem key={context.id} value={context.id}>
                    {context.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        <Button
          type="button"
          disabled={isPending || newExample.targetText.trim() === "" || newExample.translation.trim() === ""}
          onClick={() => {
            const { targetText, translation, contextId } = newExample;
            setNewExample({ targetText: "", translation: "", contextId: GENERAL });
            run(() =>
              itemExampleAction({
                learningItemId,
                idempotencyKey: key(),
                mutation: { kind: "create", targetText: targetText.trim(), translation: translation.trim(), usageContextId: contextId === GENERAL ? null : contextId },
              }),
            );
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add example
        </Button>
      </div>
    </section>
  );
}

function ExampleList({ examples, isPending, onDelete }: { examples: ExampleValue[]; isPending: boolean; onDelete: (exampleId: string) => void }) {
  if (examples.length === 0) return <p className="mt-2 text-sm text-muted-foreground">No examples yet.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {examples.map((example) => (
        <li key={example.id} className="flex items-center gap-3 text-sm">
          <span className="flex-1 text-foreground">{example.targetText}</span>
          <span className="flex-1 text-muted-foreground">{example.translation}</span>
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete example ${example.targetText}`} disabled={isPending} onClick={() => onDelete(example.id)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
