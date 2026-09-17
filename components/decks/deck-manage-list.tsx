"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

import {
  removeDeckItemAction,
  reorderDeckItemsAction,
} from "@/app/(app)/decks/actions";
import { SrsStageBadge } from "@/components/shared/srs-stage-badge";
import { Button } from "@/components/ui/button";
import type { DeckItemRow } from "@/domains/decks";
import { cn } from "@/lib/utils";

const TYPE_ACCENT: Record<DeckItemRow["itemType"], string> = {
  vocabulary: "border-l-learning-vocabulary",
  grammar: "border-l-learning-grammar",
};

const TYPE_LABEL: Record<DeckItemRow["itemType"], string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
};

type DeckManageListProps = {
  deckId: string;
  items: DeckItemRow[];
};

/**
 * The editable item list for a personal deck (spec 14: reorder, remove).
 * Reordering uses Up/Down buttons rather than drag-and-drop, so it is fully
 * keyboard operable — the same interaction `ItemReorderList` already
 * establishes in the Admin curriculum editor.
 *
 * The last remaining item's Remove button is disabled with an explanation,
 * because a deck cannot exist with zero items; deleting the deck instead is
 * a separate, deliberate action. The server rejects the same case regardless
 * of what the button does.
 */
export function DeckManageList({ deckId, items }: DeckManageListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(() =>
    items.map((item) => item.learningItemId),
  );
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(
    () => new Map(items.map((item) => [item.learningItemId, item])),
    [items],
  );
  const isDirty = order.some(
    (id, index) => id !== items[index]?.learningItemId,
  );
  const isLastItem = items.length === 1;

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  }

  function handleSaveOrder() {
    setError(null);
    startTransition(async () => {
      const result = await reorderDeckItemsAction({
        deckId,
        orderedLearningItemIds: order,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleRemove(learningItemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeDeckItemAction({ deckId, learningItemId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOrder((current) => current.filter((id) => id !== learningItemId));
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {isDirty ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <p className="flex-1 text-sm text-muted-foreground">
            You have unsaved order changes.
          </p>
          <Button
            variant="ghost"
            onClick={() => setOrder(items.map((item) => item.learningItemId))}
            disabled={isPending}
          >
            Reset
          </Button>
          <Button onClick={handleSaveOrder} disabled={isPending}>
            Save order
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {order.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              className={cn(
                "flex items-center gap-2 border-l-2 px-3 py-2",
                TYPE_ACCENT[item.itemType],
              )}
            >
              <Link
                href={`/items/${item.learningItemId}`}
                className="min-w-0 flex-1 rounded-md px-1 py-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.primary}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.secondary} · {TYPE_LABEL[item.itemType]}
                </span>
              </Link>

              <SrsStageBadge stage={item.srsStage} />

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${item.primary} up`}
                  disabled={index === 0 || isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${item.primary} down`}
                  disabled={index === order.length - 1 || isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.primary} from this deck`}
                  title={
                    isLastItem ? "A deck needs at least one item" : undefined
                  }
                  disabled={isLastItem || isPending}
                  onClick={() => handleRemove(item.learningItemId)}
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
          A deck needs at least one item. Add another item before removing this
          one, or delete the deck.
        </p>
      ) : null}
    </div>
  );
}
