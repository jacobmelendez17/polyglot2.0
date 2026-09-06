import { CurriculumStatusBadge } from "./curriculum-status-badge";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

const TYPE_LABEL = { vocabulary: "Vocab", grammar: "Gram" } as const;

type CurriculumTableProps = {
  items: AdminCurriculumListItem[];
};

/**
 * Spec 11 §9's admin curriculum table. Editing isn't built until Unit 5, so
 * there's no Actions column yet — adding one with nothing to click would be
 * clutter, not a feature; it returns once there's a real destination.
 */
export function CurriculumTable({ items }: CurriculumTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">No curriculum items match these filters</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a different search term, or clear a filter.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th scope="col" className="px-3 py-2">
              Type
            </th>
            <th scope="col" className="px-3 py-2">
              Item
            </th>
            <th scope="col" className="px-3 py-2">
              Meaning
            </th>
            <th scope="col" className="px-3 py-2">
              Level
            </th>
            <th scope="col" className="px-3 py-2">
              Group
            </th>
            <th scope="col" className="px-3 py-2">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 text-muted-foreground">{TYPE_LABEL[item.type]}</td>
              <td className="px-3 py-2 font-medium text-foreground">{item.itemLabel}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.meaningLabel}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.levelNumber}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.groupName ?? "—"}</td>
              <td className="px-3 py-2">
                <CurriculumStatusBadge status={item.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
