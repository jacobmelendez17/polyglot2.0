import type { ReactNode } from "react";

import { SiteHeader } from "@/components/shared/site-header";
import { Footer } from "@/components/shared/footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
