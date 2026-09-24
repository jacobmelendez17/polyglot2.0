import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ExitFocusButtonProps = {
  label: string;
  onClick: () => void;
  /** `large` for sessions whose top bar is scaled up (reviews). */
  size?: "default" | "large";
};

/**
 * Icon-only exit control with an accessible name and hover tooltip, for any
 * distraction-free full-focus session (spec 07 §13/§54's lesson quiz screen;
 * spec 09 §16's review session). Moved to `components/shared/` when spec 09
 * became a second consumer — `label` (e.g. "Exit lesson"/"Exit review")
 * keeps the copy feature-specific while the control itself stays shared.
 */
export function ExitFocusButton({
  label,
  onClick,
  size = "default",
}: ExitFocusButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={size === "large" ? "size-12" : undefined}
          aria-label={label}
          onClick={onClick}
        >
          <X
            aria-hidden="true"
            className={size === "large" ? "size-7" : undefined}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
