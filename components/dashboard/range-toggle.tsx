"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type RangeToggleOption<T extends string> = { value: T; label: string };

type RangeToggleProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly RangeToggleOption<T>[];
  label: string;
  layoutId: string;
};

export function RangeToggle<T extends string>({
  value,
  onChange,
  options,
  label,
  layoutId,
}: RangeToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-lg bg-muted p-1"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              // `cursor-pointer` is explicit — Tailwind v4's preflight leaves
              // a <button> at the browser default `cursor: default`.
              "relative cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* No z-index on the pill (it previously used `-z-10`): none of
                this button's ancestors establish their own stacking context,
                so a negative z-index sent it all the way out to the page's
                *root* stacking context — where it painted behind every other
                card's own background, invisible, rather than just behind its
                own label. With no z-index, `position: absolute` alone
                already promotes the pill above plain in-flow text — but that
                same rule means it would paint above the label regardless of
                DOM order too, so the label is wrapped in `relative` to
                become a positioned element itself, putting both in the same
                paint layer where tree order (pill first, so it's beneath)
                decides between them. */}
            {isActive ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
