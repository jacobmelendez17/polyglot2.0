"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

import { reorderVocabularyGroupsAction } from "@/app/(admin)/admin/curriculum/actions";
import type { CurriculumStatus } from "@/domains/curriculum";

import { CurriculumStatusBadge } from "./curriculum-status-badge";

type GroupRow = { id: string; name: string; status: CurriculumStatus };

type GroupReorderListProps = {
  levelId: string;
  groups: GroupRow[];
};

/**
 * Spec 11 rewrite's "Curriculum Ordering" requirement for groups: Up/Down
 * buttons are the primary, keyboard-operable interaction ("Drag-and-drop
 * cannot be the only interaction") — there is no drag-and-drop here at all,
 * which satisfies that rule trivially rather than needing a separate
 * fallback bolted onto one.
 */
export function GroupReorderList({ levelId, groups }: GroupReorderListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(() => groups.map((g) => g.id));
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const dirty = order.some((id, index) => id !== groups[index]?.id);

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
      const result = await reorderVocabularyGroupsAction({ levelId, orderedGroupIds: order, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No vocabulary groups yet in this level.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {order.map((id, index) => {
          const group = byId.get(id);
          if (!group) return null;
          return (
            <li key={id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/admin/curriculum/groups/${id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline">
                {group.name}
              </Link>
              <CurriculumStatusBadge status={group.status} />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Move ${group.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Move ${group.name} down`}
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
