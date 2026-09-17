import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * Full-screen shell for the onboarding slideshow (spec 15). No header, no
 * bottom nav, no footer — onboarding provides its own navigation and is the
 * only thing on screen.
 *
 * `reducedMotion="user"` is what makes the slide transitions honour the
 * operating-system setting; the looping demonstrations inside each slide are
 * CSS and are disabled by their own `prefers-reduced-motion` rule in
 * `globals.css`. Between the two, reduced motion removes movement without
 * removing any content or control.
 */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <main id="main" className="flex-1">
        {children}
      </main>
    </MotionConfig>
  );
}
