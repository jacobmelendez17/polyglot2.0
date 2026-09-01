import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * Minimal shell for full-focus learning experiences (spec 07 §1). No
 * `AppHeader`/`AppNavMobile` — lessons (and later, reviews and practice)
 * provide their own exit control, context, and progress navigation.
 */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <main id="main" className="min-h-svh bg-background">
        {children}
      </main>
    </MotionConfig>
  );
}
