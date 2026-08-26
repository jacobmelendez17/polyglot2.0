import type { ReactNode } from "react";

import { SiteHeader } from "@/components/shared/site-header";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-8 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <span className="font-heading text-base font-semibold text-foreground">
            Polyglot
          </span>
          <span>&copy; {new Date().getFullYear()} Polyglot. All rights reserved.</span>
        </div>
      </footer>
    </>
  );
}
