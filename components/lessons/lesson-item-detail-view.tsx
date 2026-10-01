"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AboutDefinition } from "@/components/items/item-detail/about-definition";
import { ContextSection } from "@/components/items/item-detail/context-section";
import { ExamplesSection } from "@/components/items/item-detail/examples-section";
import { InfoSummary } from "@/components/items/item-detail/info-summary";
import { ItemDetailSection } from "@/components/items/item-detail/item-detail-section";
import { ItemDetailTabs } from "@/components/items/item-detail/item-detail-tabs";
import { ItemNavigation } from "@/components/items/item-detail/item-navigation";
import { ResourcesSection } from "@/components/items/item-detail/resources-section";
import { PronunciationButton } from "@/components/shared/pronunciation-button";
import { itemDetailSections } from "@/domains/curriculum";
import type {
  ItemDetailSectionId,
  ItemDetailView,
  ItemNavigationView,
} from "@/domains/curriculum";

type LessonItemDetailViewProps = {
  view: ItemDetailView;
  navigation: ItemNavigationView | null;
  languageCode: string;
  onNavigate: (itemId: string) => void;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Lessons' own shell around spec 18's item-detail content — a divergence
 * from `ItemDetailLayout`/`ItemDetailShell` (the item page and Reviews'
 * shared shell) requested directly by the user: the word and its tabs stay
 * permanently pinned at the top, and only the info card beneath them
 * scrolls, rather than the item page's "hero scrolls away, a compact header
 * fades in" pattern. That pattern is built entirely around window-level
 * scroll (`ItemDetailShell`'s `IntersectionObserver`s and its fixed Back to
 * Top assume the whole page scrolls); reusing it here would mean bypassing
 * most of it, so this is a separate, simpler shell instead. It reuses every
 * *content* piece the item page does unchanged (`InfoSummary`,
 * `AboutDefinition`, `ContextSection`, `ExamplesSection`, `ResourcesSection`,
 * `ItemDetailTabs`, `ItemNavigation`) — nothing about what an item's info
 * *is* is duplicated, only how it's framed on screen. No admin slots and no
 * Progress section, matching `mode: "lesson"` elsewhere (an item being
 * taught for the first time has neither).
 */
export function LessonItemDetailView({
  view,
  navigation,
  languageCode,
  onNavigate,
}: LessonItemDetailViewProps) {
  const sections = itemDetailSections("lesson");
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<ItemDetailSectionId>(
    sections[0] ?? "info",
  );

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const elements = Array.from(
      root.querySelectorAll<HTMLElement>("[data-item-section]"),
    );
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
        const active = elements.find((element) =>
          visible.has(element.getAttribute("data-item-section") ?? ""),
        );
        const id = active?.getAttribute("data-item-section");
        if (id)
          setActiveSection((current) =>
            current === id ? current : (id as ItemDetailSectionId),
          );
      },
      // Scoped to this scrollable card, not the viewport — there is no
      // overlapping fixed header here to band away as `ItemDetailShell`'s
      // own observer does, since the word+tabs bar sits outside this
      // scroll container entirely rather than floating over it.
      { root, rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  const scrollToSection = useCallback((section: ItemDetailSectionId) => {
    const target = contentRef.current?.querySelector<HTMLElement>(
      `[data-item-section="${section}"]`,
    );
    if (!target) return;
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col items-center gap-3 pt-2 pb-4">
        <div className="flex w-full items-center justify-center gap-2 sm:gap-4">
          {navigation ? (
            <ItemNavigation
              navigation={navigation}
              direction="previous"
              onNavigate={onNavigate}
              className="h-9 w-9 sm:h-10 sm:w-10"
            />
          ) : (
            <div className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" aria-hidden="true" />
          )}

          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-3xl font-semibold break-words text-foreground sm:text-4xl">
                {view.headline}
              </h1>
              {view.pronunciation ? (
                <PronunciationButton
                  text={view.pronunciation.spokenText}
                  languageCode={languageCode}
                  audioUrl={view.pronunciation.audioUrl}
                  label={view.headline}
                  size="sm"
                />
              ) : null}
            </div>
            <p className="text-base text-muted-foreground">
              {view.translation}
            </p>
          </div>

          {navigation ? (
            <ItemNavigation
              navigation={navigation}
              direction="next"
              onNavigate={onNavigate}
              className="h-9 w-9 sm:h-10 sm:w-10"
            />
          ) : (
            <div className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" aria-hidden="true" />
          )}
        </div>

        <ItemDetailTabs
          sections={sections}
          activeSection={activeSection}
          onSelect={scrollToSection}
          variant="full"
        />
      </div>

      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <div className="flex flex-col gap-10">
            <ItemDetailSection id="info">
              <div className="flex flex-col gap-6">
                <div>
                  <InfoSummary view={view} languageCode={languageCode} />
                </div>
                <div className="border-t border-border" role="separator" />
                <div>
                  <AboutDefinition
                    about={view.about}
                    languageCode={languageCode}
                  />
                </div>
                {view.patterns.length > 0 ? (
                  <div>
                    <ContextSection
                      patterns={view.patterns}
                      languageCode={languageCode}
                    />
                  </div>
                ) : null}
              </div>
            </ItemDetailSection>

            <ItemDetailSection id="examples">
              <ExamplesSection
                examples={view.examples}
                languageCode={languageCode}
              />
            </ItemDetailSection>

            <ItemDetailSection id="resources">
              <ResourcesSection resources={view.resources} />
            </ItemDetailSection>
          </div>
        </div>
      </div>
    </div>
  );
}
