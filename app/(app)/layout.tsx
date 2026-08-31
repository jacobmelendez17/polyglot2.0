import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

import { AppHeader } from "@/components/shared/app-header";
import { AppNavMobile } from "@/components/shared/app-nav-mobile";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AppHeader />
      <main id="main" className="flex-1 pb-20 md:pb-0">
        {children}
      </main>
      <AppNavMobile />
    </MotionConfig>
  );
}
