"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

import { reorderItemsAction } from "@/app/(admin)/admin/curriculum/actions";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

import { CurriculumStatusBadge } from "./curriculum-status-badge";

type ItemReorderListProps = {
  levelId: string;
  type: "vocabulary" | "grammar";
  items: AdminCurriculumListItem[];
};

/**
 * Spec 11 rewrite's "Curriculum Ordering" for items ("item position inside
 * group" / "grammar order") — Up/Down buttons, the same keyboard-operable-
 * only interaction as `GroupReorderList` (no drag-and-drop, so the "cannot
 * be the only interaction" rule is satisfied trivially). Only ever rendered
 * once the admin has filtered to exactly one level and one type — matching
 * `reorderLearningItems`'s own constraint that `position` is unique within
 * `(level, type)`, never across either.
 */
export function ItemReorderList({ levelId, type, items }: ItemReorderListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(() => items.map((item) => item.id));
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const dirty = order.some((id, index) => id !== items[index]?.id);

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
      const result = await reorderItemsAction({ levelId, type, orderedLearningItemIds: order, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No items match these filters yet.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {order.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li key={id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.itemLabel}</p>
                <p className="truncate text-xs text-muted-foreground">{item.meaningLabel}</p>
              </div>
              <CurriculumStatusBadge status={item.status} />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Move ${item.itemLabel} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Move ${item.itemLabel} down`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      <Button onClick={handleSaveOrder} disabled={!dirty || isPending}>
        Save order
      </Button>
    </div>
  );
}
