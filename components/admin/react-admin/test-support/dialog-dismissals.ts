import { fireEvent, screen } from "@testing-library/react";

/**
 * Ways to dismiss a dialog without pressing one of its buttons. They are aimed
 * at the dialog itself, not at whatever has focus: a confirm button is disabled
 * mid-request, so focus has left it, and a keystroke sent "to the page" would
 * never reach the dialog — a test of the in-flight guard would then pass for
 * the wrong reason (a mutation check caught exactly that once).
 *
 * Use with `it.each(DISMISSALS)` — once expecting the dialog to close (idle),
 * once expecting it to stay (a request in flight).
 */
export const DISMISSALS: [string, () => void][] = [
  [
    "pressing Escape",
    () =>
      fireEvent.keyDown(screen.getByRole("dialog"), {
        key: "Escape",
        code: "Escape",
      }),
  ],
  [
    "clicking outside it",
    () => {
      const outside = document.querySelector(".MuiDialog-container")!;
      fireEvent.mouseDown(outside);
      fireEvent.click(outside);
    },
  ],
];
