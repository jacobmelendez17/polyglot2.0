"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

import {
  addPolyglotDeckItemsAction,
  deletePolyglotDeckAction,
  removePolyglotDeckItemAction,
  reorderPolyglotDeckItemsAction,
  searchPublishedItemsAction,
  updatePolyglotDeckAction,
} from "@/app/(admin)/admin/decks/actions";
import { DeckAvailabilityFields } from "@/components/admin/decks/deck-availability-fields";
import type { AdminDeckLevelOption } from "@/components/admin/decks/deck-availability-fields";
import { DeckItemPicker } from "@/components/decks/deck-item-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DECK_DESCRIPTION_MAX_LENGTH,
  DECK_NAME_MAX_LENGTH,
} from "@/domains/decks";
import type { DeckAvailability, DeckItemRow } from "@/domains/decks";

type PolyglotDeckEditorProps = {
  deckId: string;
  languageId: string;
  name: string;
  description: string | null;
  availability: DeckAvailability;
  gateLevelId: string | null;
  levels: AdminDeckLevelOption[];
  items: DeckItemRow[];
};

/**
 * The Admin editor for one Polyglot deck (spec 14's "Admin"): details,
 * availability, membership, ordering, and deletion. Every control here calls
 * a Server Action that re-checks `canManageCurriculum` on the server — this
 * page being reachable is not authorization, and each mutation writes its
 * own admin audit event.
 */
export function PolyglotDeckEditor({
  deckId,
  languageId,
  name,
  description,
  availability,
  gateLevelId,
  levels,
  items,
}: PolyglotDeckEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nameDraft, setNameDraft] = useState(name);
  const [descriptionDraft, setDescriptionDraft] = useState(description ?? "");
  const [availabilityDraft, setAvailabilityDraft] = useState<{
    availability: DeckAvailability;
    gateLevelId: string | null;
  }>({ availability, gateLevelId });
  const [order, setOrder] = useState(() =>
    items.map((item) => item.learningItemId),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(items.map((item) => [item.learningItemId, item])),
    [items],
  );
  const isOrderDirty = order.some(
    (id, index) => id !== items[index]?.learningItemId,
  );
  const isLastItem = items.length === 1;

  function run(
    action: () => Promise<
      { ok: true } | { ok: false; error: { message: string } }
    >,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Details
        </h2>

        <label className="block text-sm">
          <span className="font-medium text-foreground">Name</span>
          <Input
            className="mt-1"
            value={nameDraft}
            maxLength={DECK_NAME_MAX_LENGTH}
            onChange={(event) => setNameDraft(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-foreground">
            Description (optional)
          </span>
          <Textarea
            className="mt-1"
            rows={2}
            value={descriptionDraft}
            maxLength={DECK_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescriptionDraft(event.target.value)}
          />
        </label>

        <DeckAvailabilityFields
          availability={availabilityDraft.availability}
          gateLevelId={availabilityDraft.gateLevelId}
          levels={levels}
          onChange={setAvailabilityDraft}
        />

        <Button
          disabled={isPending}
          onClick={() =>
            run(() =>
              updatePolyglotDeckAction({
                deckId,
                name: nameDraft,
                description: descriptionDraft,
                ...(availabilityDraft.availability === "level"
                  ? {
                      availability: "level" as const,
                      gateLevelId: availabilityDraft.gateLevelId ?? "",
                    }
                  : { availability: "theme" as const, gateLevelId: null }),
              }),
            )
          }
        >
          Save details
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-semibold text-foreground">
            Items ({items.length})
          </h2>
          <div className="flex items-center gap-2">
            {isOrderDirty ? (
              <>
                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    setOrder(items.map((item) => item.learningItemId))
                  }
                >
                  Reset order
                </Button>
                <Button
                  disabled={isPending}
                  onClick={() =>
                    run(() =>
                      reorderPolyglotDeckItemsAction({
                        deckId,
                        orderedLearningItemIds: order,
                      }),
                    )
                  }
                >
                  Save order
                </Button>
              </>
            ) : null}

            <Dialog
              open={isAddOpen}
              onOpenChange={(nextOpen) => {
                setAddOpen(nextOpen);
                if (!nextOpen) setSelectedIds([]);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">Add items</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add items</DialogTitle>
                  <DialogDescription>
                    Only published curriculum items can be added to an official
                    deck.
                  </DialogDescription>
                </DialogHeader>
                <DeckItemPicker
                  selectedIds={selectedIds}
                  onChange={setSelectedIds}
                  search={(query) =>
                    searchPublishedItemsAction({ languageId, search: query })
                  }
                  alreadyInDeckIds={items.map((item) => item.learningItemId)}
                  emptyMessage="No published curriculum items match."
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={isPending || selectedIds.length === 0}
                    onClick={() =>
                      run(
                        () =>
                          addPolyglotDeckItemsAction({
                            deckId,
                            learningItemIds: selectedIds,
                          }),
                        () => {
                          setAddOpen(false);
                          setSelectedIds([]);
                        },
                      )
                    }
                  >
                    Add items
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {order.map((id, index) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {item.primary}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.secondary} ·{" "}
                    {item.itemType === "vocabulary" ? "Vocabulary" : "Grammar"}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move ${item.primary} up`}
                    disabled={index === 0 || isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move ${item.primary} down`}
                    disabled={index === order.length - 1 || isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${item.primary} from this deck`}
                    title={
                      isLastItem ? "A deck needs at least one item" : undefined
                    }
                    disabled={isLastItem || isPending}
                    onClick={() =>
                      run(
                        () =>
                          removePolyglotDeckItemAction({
                            deckId,
                            learningItemId: item.learningItemId,
                          }),
                        () =>
                          setOrder((current) =>
                            current.filter(
                              (current_) => current_ !== item.learningItemId,
                            ),
                          ),
                      )
                    }
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {isLastItem ? (
          <p className="text-xs text-muted-foreground">
            A deck needs at least one item. Add another before removing this
            one, or delete the deck.
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-xl border border-destructive/30 bg-card p-4">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Delete deck
        </h2>
        <p className="text-sm text-muted-foreground">
          Removes the deck for every learner. The curriculum items it
          references, and all learner progress on them, are untouched.
        </p>
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            run(
              () => deletePolyglotDeckAction({ deckId }),
              () => router.push("/admin/decks"),
            )
          }
        >
          Delete deck
        </Button>
      </section>
    </div>
  );
}
