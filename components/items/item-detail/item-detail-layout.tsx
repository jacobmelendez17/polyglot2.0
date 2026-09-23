import { AboutDefinition } from "./about-definition";
import { ContextSection } from "./context-section";
import { ExamplesSection } from "./examples-section";
import { InfoSummary } from "./info-summary";
import { ItemDetailSection } from "./item-detail-section";
import { ItemDetailShell } from "./item-detail-shell";
import { ItemHero } from "./item-hero";
import { ProgressSection } from "./progress-section";
import { ResourcesSection } from "./resources-section";
import type { ReactNode } from "react";

import { itemDetailSections } from "@/domains/curriculum";
import type {
  CurriculumStatus,
  ItemDetailMode,
  ItemDetailView,
  ItemNavigationView,
} from "@/domains/curriculum";
import type { ItemProgress } from "@/domains/progress";

type ItemDetailLayoutProps = {
  view: ItemDetailView;
  navigation: ItemNavigationView | null;
  languageCode: string;
  /** `page` renders Progress; `lesson` omits it (spec 18). */
  mode: ItemDetailMode;
  status?: CurriculumStatus;
  /** Item page only — required whenever `mode` is `page`. */
  progress?: ItemProgress | null;
  levelUnlockedAt?: Date | null;
  timeZone?: string;
  now?: Date;
  hrefForItem?: (itemId: string) => string;
  onNavigate?: (itemId: string) => void;
  /**
   * Admin editing controls, one per section (spec 18). Rendered directly
   * beneath the content each one edits rather than gathered into a toolbar.
   *
   * `ReactNode` slots rather than an `isAdmin` flag on purpose: this layout
   * is shared with the lesson, and it should not know what an admin is, how
   * to check a role, or which editor belongs to which section. The page
   * decides all of that and hands over finished nodes; a lesson passes none.
   */
  adminSlots?: {
    banner?: ReactNode;
    details?: ReactNode;
    about?: ReactNode;
    context?: ReactNode;
    examples?: ReactNode;
    resources?: ReactNode;
  };
};

/**
 * Spec 18's shared item layout, assembled once and configured by `mode`.
 *
 * This is the component the item page renders and the one a lesson renders;
 * "vocabulary and grammar share the same shell but render type-specific
 * content" is handled entirely by the view model, so nothing here branches on
 * item type except where the shape of the page genuinely differs (a grammar
 * point has no pronunciation card).
 *
 * Not a `"use client"` module — see `ItemHero` for why that matters. The one
 * client boundary is `ItemDetailShell`, which receives everything below it as
 * already-rendered children.
 */
export function ItemDetailLayout({
  view,
  navigation,
  languageCode,
  mode,
  status,
  progress = null,
  levelUnlockedAt = null,
  timeZone = "UTC",
  now,
  hrefForItem,
  onNavigate,
  adminSlots,
}: ItemDetailLayoutProps) {
  const sections = itemDetailSections(mode);

  return (
    <ItemDetailShell
      hero={
        <ItemHero
          view={view}
          navigation={navigation}
          languageCode={languageCode}
          status={status}
          hrefForItem={hrefForItem}
          onNavigate={onNavigate}
        />
      }
      headline={view.headline}
      translation={view.translation}
      sections={sections}
    >
      {adminSlots?.banner}

      <ItemDetailSection id="info">
        <div className="flex flex-col gap-6">
          <div>
            <InfoSummary view={view} languageCode={languageCode} />
            {adminSlots?.details}
          </div>
          <div className="border-t border-border" role="separator" />
          <div>
            <AboutDefinition about={view.about} languageCode={languageCode} />
            {adminSlots?.about}
          </div>
          {/*
            The Context card renders only when the item actually has patterns
            — an empty one would be chrome with nothing in it. An admin still
            needs a way to create the first pattern, so their slot renders
            whether or not the card does.
          */}
          <div>
            {view.patterns.length > 0 ? (
              <ContextSection
                patterns={view.patterns}
                languageCode={languageCode}
              />
            ) : null}
            {adminSlots?.context}
          </div>
        </div>
      </ItemDetailSection>

      <ItemDetailSection id="examples">
        <ExamplesSection examples={view.examples} languageCode={languageCode} />
        {adminSlots?.examples}
      </ItemDetailSection>

      {mode === "page" ? (
        <ItemDetailSection id="progress" title="Your Progress">
          <ProgressSection
            progress={progress}
            levelUnlockedAt={levelUnlockedAt}
            timeZone={timeZone}
            now={now ?? new Date()}
          />
        </ItemDetailSection>
      ) : null}

      <ItemDetailSection id="resources">
        <ResourcesSection resources={view.resources} />
        {adminSlots?.resources}
      </ItemDetailSection>
    </ItemDetailShell>
  );
}
