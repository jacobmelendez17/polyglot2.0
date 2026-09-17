"use client";

import { useState } from "react";

import type { MappingQueueRow } from "@/domains/lexicon";

import { BulkConfirmMappingsBar } from "./bulk-confirm-mappings-bar";
import {
  isConfirmableMappingRow,
  MappingQueueTable,
} from "./mapping-queue-table";

type MappingQueueTableSectionProps = {
  rows: MappingQueueRow[];
  regionCode: string | null;
};

/**
 * Owns batch-selection state so it survives table re-renders, and clears it
 * whenever the underlying row list changes — mirrors
 * `components/admin/curriculum/curriculum-table-section.tsx`'s exact
 * pattern (state adjusted during render on a `rows !== priorRows` prop
 * change, not inside a `useEffect`, for the same hydration-timing reason
 * that file documents).
 */
export function MappingQueueTableSection({
  rows,
  regionCode,
}: MappingQueueTableSectionProps) {
  const [priorRows, setPriorRows] = useState(rows);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (rows !== priorRows) {
    setPriorRows(rows);
    setSelectedIds(new Set());
  }

  const confirmableRows = rows.filter(isConfirmableMappingRow);

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      confirmableRows.length > 0 &&
      confirmableRows.every((row) => prev.has(row.vocabularyItemId))
        ? new Set()
        : new Set(confirmableRows.map((row) => row.vocabularyItemId)),
    );
  }

  return (
    <div>
      {selectedIds.size > 0 ? (
        <BulkConfirmMappingsBar
          vocabularyItemIds={[...selectedIds]}
          onDone={() => setSelectedIds(new Set())}
        />
      ) : null}
      <MappingQueueTable
        rows={rows}
        regionCode={regionCode}
        selectedIds={selectedIds}
        onToggleItem={toggleItem}
        onToggleAll={toggleAll}
      />
    </div>
  );
}
