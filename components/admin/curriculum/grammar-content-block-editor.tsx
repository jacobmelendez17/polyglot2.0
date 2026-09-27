"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";

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
import { AuthoredText } from "@/components/shared/authored-text";
import { stripEmphasisMarks } from "@/lib/authored-text";
import { cn } from "@/lib/utils";

import { saveGrammarContentBlocksAction } from "@/app/(admin)/admin/curriculum/actions";
import type { GrammarContentBlockSource } from "@/domains/curriculum";

type GrammarContentBlockEditorProps = {
  learningItemId: string;
  blocks: GrammarContentBlockSource[];
};

type BlockType = "text" | "note" | "example";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  text: "Text",
  note: "Polyglot note",
  example: "Example sentence",
};

/**
 * One block as the admin is editing it. `clientId` is stable for the life of
 * the editor (drag-and-drop needs an id even for a block that has never been
 * saved); `serverId` is set only for a block that already exists.
 */
type DraftBlock = {
  clientId: string;
  serverId?: string;
  type: BlockType;
  body: string;
  targetText: string;
  translation: string;
};

function toDraft(block: GrammarContentBlockSource): DraftBlock {
  return {
    clientId: block.id,
    serverId: block.id,
    type: block.type,
    body: block.type === "example" ? "" : block.body,
    targetText: block.type === "example" ? block.targetText : "",
    translation: block.type === "example" ? block.translation : "",
  };
}

function isComplete(block: DraftBlock): boolean {
  return block.type === "example"
    ? block.targetText.trim() !== "" && block.translation.trim() !== ""
    : block.body.trim() !== "";
}

/** What is sent to the server for one block — content only, trimmed. */
function toPayload(block: DraftBlock) {
  const id = block.serverId;
  return block.type === "example"
    ? {
        ...(id ? { id } : {}),
        type: "example" as const,
        targetText: block.targetText.trim(),
        translation: block.translation.trim(),
      }
    : {
        ...(id ? { id } : {}),
        type: block.type,
        body: block.body.trim(),
      };
}

/** Whether the staged list differs from what is saved, by content and order. */
function isDirty(drafts: DraftBlock[], saved: DraftBlock[]): boolean {
  return (
    JSON.stringify(drafts.map(toPayload)) !==
    JSON.stringify(saved.map(toPayload))
  );
}

/**
 * The About content builder (spec 18) — the three block types, their order,
 * and their content.
 *
 * Nothing here writes until Save. Adding a block puts it in the list above
 * the form (marked "New") so the admin can see it landed, blocks can be
 * dragged (or moved with the arrow buttons / keyboard) into order, and one
 * Save applies the whole list in a single transaction. What Save returns is
 * the list the database actually holds, so the editor shows what persisted
 * rather than what it hoped to.
 *
 * Deliberately not a rich-text editor: spec 18's scope limits rule out a
 * generic page builder, and three closed block types are what let the same
 * content render identically here, on the item page, and in a lesson.
 *
 * On a published item the saved blocks are live immediately —
 * `curriculum_item_drafts` snapshots an item's editable *fields* and has
 * nowhere to put an ordered child collection — so the editor says so.
 */
export function GrammarContentBlockEditor({
  learningItemId,
  blocks,
}: GrammarContentBlockEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState<DraftBlock[]>(() => blocks.map(toDraft));
  const [drafts, setDrafts] = useState<DraftBlock[]>(saved);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [newType, setNewType] = useState<BlockType>("text");
  const [newBody, setNewBody] = useState("");
  const [newExample, setNewExample] = useState({
    targetText: "",
    translation: "",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const dirty = isDirty(drafts, saved);
  const allComplete = drafts.every(isComplete);

  function stage(next: DraftBlock[]) {
    setDrafts(next);
    setJustSaved(false);
    setError(null);
  }

  function updateBlock(clientId: string, changes: Partial<DraftBlock>) {
    stage(
      drafts.map((block) =>
        block.clientId === clientId ? { ...block, ...changes } : block,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= drafts.length) return;
    stage(arrayMove(drafts, index, target));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = drafts.findIndex((block) => block.clientId === active.id);
    const to = drafts.findIndex((block) => block.clientId === over.id);
    if (from === -1 || to === -1) return;
    stage(arrayMove(drafts, from, to));
  }

  function addBlock() {
    const draft: DraftBlock = {
      clientId: `new-${crypto.randomUUID()}`,
      type: newType,
      body: "",
      targetText: "",
      translation: "",
    };
    if (newType === "example") {
      if (
        newExample.targetText.trim() === "" ||
        newExample.translation.trim() === ""
      )
        return;
      draft.targetText = newExample.targetText;
      draft.translation = newExample.translation;
      setNewExample({ targetText: "", translation: "" });
    } else {
      if (newBody.trim() === "") return;
      draft.body = newBody;
      setNewBody("");
    }
    stage([...drafts, draft]);
  }

  function handleSave() {
    if (!dirty || !allComplete) return;
    setError(null);
    startTransition(async () => {
      const result = await saveGrammarContentBlocksAction({
        learningItemId,
        idempotencyKey: crypto.randomUUID(),
        blocks: drafts.map(toPayload),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const persisted = result.data.blocks.map(toDraft);
      setSaved(persisted);
      setDrafts(persisted);
      setJustSaved(true);
      router.refresh();
    });
  }

  function handleDiscard() {
    setDrafts(saved);
    setError(null);
    setJustSaved(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          About content
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add blocks, drag them into order, then save. Nothing changes until you
          save, and saved blocks are live immediately, even on a published item.
          Put a word in single quotes, like &apos;también&apos;, to show it bold
          and green.
        </p>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No blocks yet — the item still shows its original explanation field.
          Saving a block replaces it.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={drafts.map((block) => block.clientId)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-3" aria-label="Blocks, in order">
              {drafts.map((block, index) => (
                <SortableBlock
                  key={block.clientId}
                  block={block}
                  index={index}
                  count={drafts.length}
                  disabled={isPending}
                  onChange={(changes) => updateBlock(block.clientId, changes)}
                  onMove={(direction) => move(index, direction)}
                  onDelete={() =>
                    stage(drafts.filter((b) => b.clientId !== block.clientId))
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
        <label className="text-sm">
          <span className="font-medium text-foreground">Add a block</span>
          <Select
            value={newType}
            onValueChange={(value) => setNewType(value as BlockType)}
          >
            <SelectTrigger className="mt-1 w-56" aria-label="New block type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {BLOCK_TYPE_LABELS[type]}
                </SelectItem>
              ))}
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
            variant="outline"
            disabled={isPending}
            onClick={addBlock}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add block
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      {!allComplete ? (
        <p className="text-sm text-muted-foreground">
          Every block needs its text filled in before you can save.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        {dirty ? (
          <>
            <Button
              type="button"
              disabled={isPending || !allComplete}
              onClick={handleSave}
            >
              {isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={handleDiscard}
            >
              Discard
            </Button>
          </>
        ) : justSaved ? (
          <p
            role="status"
            className="flex items-center gap-1 text-sm text-state-success"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Saved — {saved.length} {saved.length === 1 ? "block" : "blocks"}{" "}
            live
          </p>
        ) : null}
      </div>
    </section>
  );
}

type SortableBlockProps = {
  block: DraftBlock;
  index: number;
  count: number;
  disabled: boolean;
  onChange: (changes: Partial<DraftBlock>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
};

function SortableBlock({
  block,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onDelete,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.clientId, disabled });

  const isNew = block.serverId === undefined;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border bg-card p-3",
        isNew ? "border-accent-primary/60" : "border-border",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Drag block ${index + 1}`}
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {BLOCK_TYPE_LABELS[block.type]}
          </span>
          {isNew ? (
            <span className="rounded-full bg-accent-primary/15 px-2 py-0.5 text-xs font-medium text-foreground">
              New
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move block ${index + 1} earlier`}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move block ${index + 1} later`}
            disabled={disabled || index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete block ${index + 1}`}
            disabled={disabled}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {block.type === "example" ? (
        <div className="mt-2 flex flex-col gap-2">
          <Input
            value={block.targetText}
            aria-label={`Sentence for block ${index + 1}`}
            disabled={disabled}
            onChange={(event) => onChange({ targetText: event.target.value })}
          />
          <Input
            value={block.translation}
            aria-label={`Translation for block ${index + 1}`}
            disabled={disabled}
            onChange={(event) => onChange({ translation: event.target.value })}
          />
        </div>
      ) : (
        <Textarea
          className="mt-2"
          rows={3}
          value={block.body}
          aria-label={`Text for block ${index + 1}`}
          disabled={disabled}
          onChange={(event) => onChange({ body: event.target.value })}
        />
      )}
      <EmphasisPreview
        texts={
          block.type === "example"
            ? [block.targetText, block.translation]
            : [block.body]
        }
      />
    </li>
  );
}

/**
 * Shows how the 'word'/"word" emphasis shortcuts will render, only when a
 * block actually uses one — the inputs have to stay raw text to be editable.
 * `whitespace-pre-line` preserves the author's own line breaks, including a
 * blank line as a paragraph break, matching how the same text renders on the
 * learner-facing item page (`grammar-content-blocks.tsx`).
 */
function EmphasisPreview({ texts }: { texts: string[] }) {
  const used = texts.filter((text) => stripEmphasisMarks(text) !== text);
  if (used.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Preview
      </p>
      {used.map((text, index) => (
        <p key={index} className="whitespace-pre-line text-foreground">
          <AuthoredText text={text} />
        </p>
      ))}
    </div>
  );
}
