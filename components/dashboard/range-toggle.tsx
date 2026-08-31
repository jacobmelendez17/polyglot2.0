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
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-md bg-primary"
                transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
              />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
