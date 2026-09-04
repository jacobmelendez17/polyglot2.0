"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { LevelLink } from "@/components/shared/level-link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LEVEL_NUMBER_MAX, LEVEL_NUMBER_MIN } from "@/domains/curriculum";

const LEVEL_NUMBERS = Array.from({ length: LEVEL_NUMBER_MAX - LEVEL_NUMBER_MIN + 1 }, (_, i) => i + LEVEL_NUMBER_MIN);

/**
 * Header Levels control (spec 10 §3/§4). A `Popover`, not shadcn's
 * `DropdownMenu` — WAI-ARIA's menu/menuitem pattern (roving tabindex,
 * arrow-key-only navigation, no Tab) is meant for application command
 * menus, not a grid of plain navigation links; a Popover keeps these 50
 * links normally tabbable while still opening/closing exactly like the
 * spec's "dropdown" (click to open, outside-click/Escape to close).
 */
export function LevelsDropdown() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const currentLevel = getCurrentLevelFromPathname(pathname);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-expanded:text-foreground"
        aria-label="Levels"
      >
        Levels
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <div className="grid grid-cols-10 gap-1">
          {LEVEL_NUMBERS.map((levelNumber) => (
            <LevelLink
              key={levelNumber}
              levelNumber={levelNumber}
              isCurrent={levelNumber === currentLevel}
              onClick={() => setOpen(false)}
              className="h-8 w-8"
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getCurrentLevelFromPathname(pathname: string): number | null {
  const match = /^\/levels\/(\d+)$/.exec(pathname);
  return match ? Number(match[1]) : null;
}
