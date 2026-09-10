"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

import { moveItemAction, reorderItemsAction } from "@/app/(admin)/admin/curriculum/actions";
import { CurriculumStatusBadge } from "./curriculum-status-badge";

type LevelOption = { id: string; levelNumber: number };
type GroupOption = { id: string; name: string; levelId: string };

type LevelItemBoardProps = {
  levelId: string;
  items: AdminCurriculumListItem[];
  levels: LevelOption[];
  groups: GroupOption[];
};

/**
 * Everything a level contains, in the order a learner will actually meet it
 * (spec 17).
 *
 * One list per item type rather than a list per vocabulary group: the order
 * that matters is the level's own lesson queue, which is level-and-type
 * wide, so nesting by group would show an order that does not exist. Each
 * row names its group instead, and can be moved to a different one — the
 * group is a property of the word, not the shape of this page.
 *
 * Up/Down rather than drag-and-drop, matching `ItemReorderList`: the whole
 * interaction is keyboard-operable without a second mechanism to build.
 */
export function LevelItemBoard({ levelId, items, levels, groups }: LevelItemBoardProps) {
  const vocabulary = useMemo(() => items.filter((item) => item.type === "vocabulary"), [items]);
  const grammar = useMemo(() => items.filter((item) => item.type === "grammar"), [items]);

  return (
    <div className="flex flex-col gap-8">
      <ItemTypeSection levelId={levelId} type="vocabulary" heading="Vocabulary" items={vocabulary} levels={levels} groups={groups} />
      <ItemTypeSection levelId={levelId} type="grammar" heading="Grammar" items={grammar} levels={levels} groups={groups} />
    </div>
  );
}

function ItemTypeSection({
  levelId,
  type,
  heading,
  items,
  levels,
  groups,
}: {
  levelId: string;
  type: "vocabulary" | "grammar";
  heading: string;
  items: AdminCurriculumListItem[];
  levels: LevelOption[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(() => items.map((item) => item.id));
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const dirty = order.length === items.length && order.some((id, index) => id !== items[index]?.id);
  const groupsInThisLevel = groups.filter((group) => group.levelId === levelId);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  }

  function saveOrder() {
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

  function moveItem(learningItemId: string, changes: { levelId?: string; vocabularyGroupId?: string }) {
    setError(null);
    startTransition(async () => {
      const result = await moveItemAction({ learningItemId, ...changes, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {heading} <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
        </h2>
        {dirty ? (
          <Button type="button" size="sm" onClick={saveOrder} disabled={isPending}>
            Save order
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        In the order lessons will teach them. Reordering here sets that order.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in this level yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {order.map((id, index) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <li key={id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                <span className="w-6 text-sm text-muted-foreground" aria-hidden="true">
                  {index + 1}
                </span>

                <div className="flex min-w-40 flex-1 flex-col">
                  <Link href={`/admin/curriculum/items/${item.id}`} className="font-medium text-foreground hover:underline">
                    {item.itemLabel}
                  </Link>
                  <span className="text-sm text-muted-foreground">{item.meaningLabel}</span>
                </div>

                <CurriculumStatusBadge status={item.status} />

                {type === "vocabulary" ? (
                  <label className="text-sm">
                    <span className="sr-only">Group for {item.itemLabel}</span>
                    <Select
                      value={item.groupId ?? ""}
                      onValueChange={(value) => moveItem(item.id, { vocabularyGroupId: value })}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="No group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groupsInThisLevel.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ) : null}

                <label className="text-sm">
                  <span className="sr-only">Level for {item.itemLabel}</span>
                  <Select value={item.levelId} onValueChange={(value) => moveItem(item.id, { levelId: value })} disabled={isPending}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((level) => (
                        <SelectItem key={level.id} value={level.id}>
                          Level {level.levelNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${item.itemLabel} earlier`}
                    disabled={isPending || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${item.itemLabel} later`}
                    disabled={isPending || index === order.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
