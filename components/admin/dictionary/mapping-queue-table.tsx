import Link from "next/link";
import { Lock } from "lucide-react";

import { REVIEW_REASON_LABELS } from "@/domains/lexicon";
import type { MappingQueueRow } from "@/domains/lexicon";

import { MappingStatusBadge } from "./mapping-status-badge";
import { RegionalEvidenceBadge } from "./regional-evidence-badge";

/**
 * Spec 12 "Admin Mapping Review"'s table: curriculum item, the lookup form
 * it resolves through, the candidate entry, regional evidence, and mapping
 * state. Each row links to the item editor, where the mapping panel holds
 * the controls — the queue's job is to find work, not to be a second place
 * that mutates it.
 */
export function MappingQueueTable({ rows, regionCode }: { rows: MappingQueueRow[]; regionCode: string | null }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">No vocabulary matches these filters</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a different filter, or clear one.</p>
      </div>
    );
  }

  /*
   * `[contain:paint]` on the scroll container below is load-bearing, not
   * cosmetic. `overflow-x-auto` alone scrolls the table inside its box
   * correctly, but the page itself still became horizontally draggable at a
   * 390px viewport — measured in a real browser as
   * `documentElement.scrollWidth` 563 against a 390px client width, with
   * `window.scrollX` reaching 123 after a scroll attempt. Of every candidate
   * tried live (`width:100%`, `max-width:100%`, `overflow-x:clip`,
   * `display:grid`), only paint containment stopped it. Safe here: nothing
   * inside is absolutely or fixed positioned, so the containing-block and
   * stacking-context side effects have nothing to act on.
   * `/admin/curriculum`'s table has the identical pre-existing problem and is
   * deliberately not changed here — see progress-tracker.md.
   */
  return (
    <div className="overflow-x-auto rounded-xl border border-border [contain:paint]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th scope="col" className="px-3 py-2">Curriculum</th>
            <th scope="col" className="px-3 py-2">Lookup</th>
            <th scope="col" className="px-3 py-2">Candidate</th>
            {regionCode ? (
              <th scope="col" className="px-3 py-2">{regionCode}</th>
            ) : null}
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.vocabularyItemId} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{row.displayWord}</div>
                <div className="text-xs text-muted-foreground">
                  {row.translation} · Level {row.levelNumber} · {row.groupName}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.lookupForm ?? "—"}</td>
              <td className="px-3 py-2">
                {row.entryLemma ? (
                  <span className="text-foreground">
                    {row.entryLemma}
                    <span className="text-muted-foreground"> · {row.entryPartOfSpeech}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              {regionCode ? (
                <td className="px-3 py-2">
                  {row.regionalStatus ? (
                    <RegionalEvidenceBadge regionCode={regionCode} status={row.regionalStatus} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ) : null}
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <MappingStatusBadge status={row.matchStatus} confidence={row.confidence} />
                  {row.manualLock ? (
                    <Lock className="h-3 w-3 text-muted-foreground" aria-label="Locked against automatic replacement" />
                  ) : null}
                </div>
                {row.reviewReason ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{REVIEW_REASON_LABELS[row.reviewReason]}</div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/admin/curriculum/items/${row.vocabularyItemId}`}
                  className="rounded-md px-2 py-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
