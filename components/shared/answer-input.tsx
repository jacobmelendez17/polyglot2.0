import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export type AnswerInputState = "default" | "correct" | "incorrect";

type AnswerInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  state?: AnswerInputState;
};

const STATE_CLASSES: Record<AnswerInputState, string> = {
  default: "border-border focus:border-primary",
  correct: "border-b-[3px] border-state-success",
  incorrect: "border-b-[3px] border-destructive",
};

/**
 * A single underline, per spec 07 §26: bottom border only, no side/top
 * border, no fill, no radius, no shadow. Focus thickens the rule as well as
 * changing color, so focus stays visible without relying on color alone.
 * Shared across any typed-answer flow — moved here from `components/lessons/`
 * when spec 09's review UI became its second consumer.
 */
export const AnswerInput = forwardRef<HTMLInputElement, AnswerInputProps>(function AnswerInput(
  { className, state = "default", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className={cn(
        "w-full max-w-md rounded-none border-0 border-b-2 bg-transparent px-1 py-2 text-center text-2xl text-foreground outline-none transition-[border-color,border-width] duration-150 placeholder:text-muted-foreground focus:border-b-[3px]",
        STATE_CLASSES[state],
        className,
      )}
      {...props}
    />
  );
});
