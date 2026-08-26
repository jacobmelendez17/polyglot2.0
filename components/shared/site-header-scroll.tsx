"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const SCROLL_THRESHOLD_PX = 24;

export function SiteHeaderScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;

    const updateScrolled = () => {
      setIsScrolled(window.scrollY > SCROLL_THRESHOLD_PX);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateScrolled);
      }
    };

    updateScrolled();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={isScrolled}
      className={cn(
        "site-header sticky top-0 z-[var(--z-header)] h-[var(--nav-h)] w-full border-b border-transparent bg-transparent transition-[background-color,border-color] duration-[var(--dur-base)] ease-[var(--ease-soft)]",
        className
      )}
    >
      {children}
    </header>
  );
}
