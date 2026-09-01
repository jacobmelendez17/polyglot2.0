import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ExitLessonButtonProps = {
  onClick: () => void;
};

/** Icon-only exit control with an accessible name and hover tooltip, per spec 07 §13/§54. */
export function ExitLessonButton({ onClick }: ExitLessonButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Exit lesson"
          onClick={onClick}
        >
          <X aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Exit lesson</TooltipContent>
    </Tooltip>
  );
}
