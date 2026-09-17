"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { grammarContentBlockAction } from "@/app/(admin)/admin/curriculum/actions";
import type { GrammarContentBlockSource } from "@/domains/curriculum";

type GrammarContentBlockEditorProps = {
  learningItemId: string;
  blocks: GrammarContentBlockSource[];
};

type NewBlockType = "text" | "note" | "example";

const BLOCK_TYPE_LABELS: Record<NewBlockType, string> = {
  text: "Text",
  note: "Polyglot note",
  example: "Example sentence",
};

/**
 * Authoring a grammar item's About content (spec 18) — the three block
 * types, their order, and their content.
 *
 * Deliberately not a rich-text editor: spec 18's scope limits rule out a
 * generic page builder, and three closed block types are what let the same
 * content render identically here, on the item page, and in a lesson.
 *
 * Every change writes immediately rather than staging a draft, which is the
 * same limit usage contexts and examples already have — `curriculum_item_drafts`
 * snapshots an item's editable *fields* and has nowhere to put an ordered
 * child collection. On a published item that means edits are live, so the
 * editor says so rather than letting an admin assume otherwise.
 */
export function GrammarContentBlockEditor({
  learningItemId,
  blocks,
}: GrammarContentBlockEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState<NewBlockType>("text");
  const [newBody, setNewBody] = useState("");
  const [newExample, setNewExample] = useState({
    targetText: "",
    translation: "",
  });

  function run(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
  ) {
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
    if (target < 0 || target >= blocks.length) return;
    const order = blocks.map((block) => block.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    run(() =>
      grammarContentBlockAction({
        learningItemId,
        idempotencyKey: key(),
        mutation: { kind: "reorder", orderedIds: order },
      }),
    );
  }

  function addBlock() {
    if (newType === "example") {
      const { targetText, translation } = newExample;
      if (targetText.trim() === "" || translation.trim() === "") return;
      setNewExample({ targetText: "", translation: "" });
      run(() =>
        grammarContentBlockAction({
          learningItemId,
          idempotencyKey: key(),
          mutation: {
            kind: "create",
            type: "example",
            targetText: targetText.trim(),
            translation: translation.trim(),
          },
        }),
      );
      return;
    }

    const body = newBody.trim();
    if (body === "") return;
    setNewBody("");
    run(() =>
      grammarContentBlockAction({
        learningItemId,
        idempotencyKey: key(),
        mutation: { kind: "create", type: newType, body },
      }),
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          About content
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Blocks render in this order beneath the item&apos;s title. Changes
          here are live immediately, even on a published item.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No blocks yet — the item still shows its original explanation field.
          Adding a block replaces it.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className="rounded-xl border border-border bg-card p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {BLOCK_TYPE_LABELS[block.type]}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move block ${index + 1} earlier`}
                  disabled={isPending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move block ${index + 1} later`}
                  disabled={isPending || index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete block ${index + 1}`}
                  disabled={isPending}
                  onClick={() =>
                    run(() =>
                      grammarContentBlockAction({
                        learningItemId,
                        idempotencyKey: key(),
                        mutation: { kind: "delete", blockId: block.id },
                      }),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {block.type === "example" ? (
              <div className="mt-2 flex flex-col gap-2">
                <Input
                  defaultValue={block.targetText}
                  aria-label={`Sentence for block ${index + 1}`}
                  onBlur={(event) => {
                    const targetText = event.target.value.trim();
                    if (targetText === "" || targetText === block.targetText)
                      return;
                    run(() =>
                      grammarContentBlockAction({
                        learningItemId,
                        idempotencyKey: key(),
                        mutation: {
                          kind: "update",
                          blockId: block.id,
                          type: "example",
                          targetText,
                          translation: block.translation,
                        },
                      }),
                    );
                  }}
                />
                <Input
                  defaultValue={block.translation}
                  aria-label={`Translation for block ${index + 1}`}
                  onBlur={(event) => {
                    const translation = event.target.value.trim();
                    if (translation === "" || translation === block.translation)
                      return;
                    run(() =>
                      grammarContentBlockAction({
                        learningItemId,
                        idempotencyKey: key(),
                        mutation: {
                          kind: "update",
                          blockId: block.id,
                          type: "example",
                          targetText: block.targetText,
                          translation,
                        },
                      }),
                    );
                  }}
                />
              </div>
            ) : (
              <Textarea
                className="mt-2"
                rows={3}
                defaultValue={block.body}
                aria-label={`Text for block ${index + 1}`}
                onBlur={(event) => {
                  const body = event.target.value.trim();
                  if (body === "" || body === block.body) return;
                  run(() =>
                    grammarContentBlockAction({
                      learningItemId,
                      idempotencyKey: key(),
                      mutation: {
                        kind: "update",
                        blockId: block.id,
                        type: block.type,
                        body,
                      },
                    }),
                  );
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
        <label className="text-sm">
          <span className="font-medium text-foreground">Add a block</span>
          <Select
            value={newType}
            onValueChange={(value) => setNewType(value as NewBlockType)}
          >
            <SelectTrigger className="mt-1 w-56" aria-label="New block type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BLOCK_TYPE_LABELS) as NewBlockType[]).map(
                (type) => (
                  <SelectItem key={type} value={type}>
                    {BLOCK_TYPE_LABELS[type]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </label>

        {newType === "example" ? (
          <div className="flex flex-col gap-2">
            <Input
              value={newExample.targetText}
              placeholder="Soy alto."
              aria-label="New example sentence"
              onChange={(event) =>
                setNewExample((previous) => ({
                  ...previous,
                  targetText: event.target.value,
                }))
              }
            />
            <Input
              value={newExample.translation}
              placeholder="I am tall."
              aria-label="New example translation"
              onChange={(event) =>
                setNewExample((previous) => ({
                  ...previous,
                  translation: event.target.value,
                }))
              }
            />
          </div>
        ) : (
          <Textarea
            rows={3}
            value={newBody}
            placeholder={
              newType === "note"
                ? "Something worth flagging to the learner."
                : "Explain the structure."
            }
            aria-label="New block text"
            onChange={(event) => setNewBody(event.target.value)}
          />
        )}

        <div>
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={addBlock}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add block
          </Button>
        </div>
      </div>
    </section>
  );
}
