"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUp } from "lucide-react";

import { ItemDetailTabs } from "./item-detail-tabs";
import type { ItemDetailSectionId } from "@/domains/curriculum";
import { cn } from "@/lib/utils";

type ItemDetailShellProps = {
  /** The hero, rendered on the server and passed through — the shell only needs to observe it. */
  hero: ReactNode;
  /** The item and its translation, repeated in the sticky header once the hero scrolls away. */
  headline: string;
  translation: string;
  sections: ItemDetailSectionId[];
  children: ReactNode;
};

/** Matches `SECTION_SCROLL_MARGIN` in `item-detail-section.tsx` — the sticky header's height plus the site header's. */
const STICKY_HEADER_HEIGHT = 56;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The chrome around spec 18's item layout: section tabs, the sticky item
 * header that replaces the hero once it scrolls away, and Back to Top.
 *
 * This is the only client component in the layout. Every section is rendered
 * on the server and passed in as `children`; the shell never needs their
 * data, only their DOM elements, which it finds by the `data-item-section`
 * attribute `ItemDetailSection` stamps on each one. That keeps the whole
 * content tree server-rendered while one component owns the scroll behavior.
 *
 * Scroll position is read by IntersectionObserver, never by a scroll
 * handler, and `setState` runs only when the *answer* changes — a scroll
 * through one long section produces no re-renders at all (spec 18: "do not
 * continuously update React state from scroll position unnecessarily").
 */
export function ItemDetailShell({ hero, headline, translation, sections, children }: ItemDetailShellProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isHeroVisible, setHeroVisible] = useState(true);
  const [activeSection, setActiveSection] = useState<ItemDetailSectionId>(sections[0] ?? "info");

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      // A sliver of hero still counts as visible; the sticky header appears
      // only once the item itself has genuinely left the screen.
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-item-section]"));
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-item-section");
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }

        // The topmost section currently in the band below the header is the
        // active one — document order, not intersection ratio, so a short
        // section never loses to a tall one scrolling past beneath it.
        const active = elements.find((element) => visible.has(element.getAttribute("data-item-section") ?? ""));
        const id = active?.getAttribute("data-item-section");
        if (id) setActiveSection((current) => (current === id ? current : (id as ItemDetailSectionId)));
      },
      // Only the band just below the sticky header counts as "here".
      { rootMargin: `-${STICKY_HEADER_HEIGHT + 80}px 0px -55% 0px`, threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  const scrollToSection = useCallback((section: ItemDetailSectionId) => {
    const target = contentRef.current?.querySelector<HTMLElement>(`[data-item-section="${section}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    // Move focus as well as the viewport: a keyboard user who activates a
    // tab must land in the section, not stay behind in the tab list.
    target.focus({ preventScroll: true });
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  return (
    <>
      <div ref={heroRef}>{hero}</div>

      {/*
        `aria-hidden` while the hero is on screen, not merely translated out
        of view: the sticky bar duplicates the hero's tabs, and two identical
        tab lists in the accessibility tree would be read twice.
      */}
      <div
        aria-hidden={isHeroVisible}
        className={cn(
          "fixed inset-x-0 top-(--nav-h) z-30 border-b border-border bg-background/95 backdrop-blur transition-opacity duration-(--dur-fast)",
          isHeroVisible ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate font-heading text-base font-semibold text-foreground">{headline}</p>
            <p className="truncate text-xs text-muted-foreground">{translation}</p>
          </div>
          <ItemDetailTabs
            sections={sections}
            activeSection={activeSection}
            onSelect={scrollToSection}
            disabled={isHeroVisible}
            variant="compact"
          />
        </div>
      </div>

      <div ref={contentRef} className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6 lg:p-8">
          <div className="mb-6 border-b border-border pb-3">
            <ItemDetailTabs sections={sections} activeSection={activeSection} onSelect={scrollToSection} variant="full" />
          </div>
          <div className="flex flex-col gap-10">{children}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={scrollToTop}
        aria-hidden={isHeroVisible}
        tabIndex={isHeroVisible ? -1 : 0}
        className={cn(
          "fixed right-4 bottom-20 z-30 inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-opacity duration-(--dur-fast) md:bottom-6",
          "hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          isHeroVisible ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
        Back to Top
      </button>
    </>
  );
}
