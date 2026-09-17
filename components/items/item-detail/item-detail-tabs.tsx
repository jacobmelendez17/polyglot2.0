"use client";

import { ITEM_DETAIL_SECTION_LABELS } from "@/domains/curriculum";
import type { ItemDetailSectionId } from "@/domains/curriculum";
import { cn } from "@/lib/utils";

type ItemDetailTabsProps = {
  sections: ItemDetailSectionId[];
  activeSection: ItemDetailSectionId;
  onSelect: (section: ItemDetailSectionId) => void;
  /** `full` is the tab row at the top of the content card; `compact` is the copy inside the sticky header. */
  variant: "full" | "compact";
  disabled?: boolean;
};

/**
 * Spec 18's section navigation: "Tabs are anchor navigation, not separate
 * mini-pages." So these are buttons that scroll, and every section stays
 * mounted and reachable by ordinary scrolling — nothing is hidden behind a
 * tab, which also means Ctrl+F finds content the learner has not clicked to.
 *
 * `aria-current` rather than `role="tab"`/`aria-selected` for exactly that
 * reason: a tablist promises panels that show and hide, which would
 * misdescribe what these do to a screen reader.
 */
export function ItemDetailTabs({
  sections,
  activeSection,
  onSelect,
  variant,
  disabled = false,
}: ItemDetailTabsProps) {
  return (
    <nav
      aria-label="Item sections"
      className={cn(
        "flex items-center",
        variant === "full" ? "flex-wrap gap-1 sm:gap-2" : "gap-0.5 sm:gap-1",
      )}
    >
      {sections.map((section) => {
        const isActive = section === activeSection;
        return (
          <button
            key={section}
            type="button"
            onClick={() => onSelect(section)}
            disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "cursor-pointer rounded-full font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              variant === "full"
                ? "px-4 py-1.5 text-base sm:text-lg"
                : "px-2.5 py-1 text-sm sm:px-3 sm:text-base",
              isActive
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {ITEM_DETAIL_SECTION_LABELS[section]}
          </button>
        );
      })}
    </nav>
  );
}
