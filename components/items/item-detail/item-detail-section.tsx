import type { ReactNode } from "react";

import type { ItemDetailSectionId } from "@/domains/curriculum";
import { ITEM_DETAIL_SECTION_LABELS } from "@/domains/curriculum";

type ItemDetailSectionProps = {
  id: ItemDetailSectionId;
  /** Overrides the tab label as the visible heading — Progress reads "Your Progress" (spec 18). */
  title?: string;
  children: ReactNode;
};

/**
 * One scroll target. The `data-item-section` attribute is the contract
 * `ItemDetailShell` observes and scrolls to, so a section is registered by
 * rendering it rather than by being listed anywhere.
 *
 * `scroll-mt` keeps the heading clear of the two stacked fixed headers when
 * scrolled to; `tabIndex={-1}` lets the shell move focus here after a tab
 * activation without putting the section into the tab order.
 */
export function ItemDetailSection({ id, title, children }: ItemDetailSectionProps) {
  return (
    <section
      id={`item-section-${id}`}
      data-item-section={id}
      tabIndex={-1}
      aria-labelledby={`item-section-heading-${id}`}
      className="scroll-mt-[calc(var(--nav-h)+5rem)] focus-visible:outline-none"
    >
      <h2 id={`item-section-heading-${id}`} className="font-heading text-xl font-semibold text-foreground sm:text-2xl">
        {title ?? ITEM_DETAIL_SECTION_LABELS[id]}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
