"use client";

import { useState, useSyncExternalStore } from "react";

import { LevelContentFilter } from "@/components/levels/level-content-filter";
import type { LevelContentFilterValue } from "@/components/levels/level-content-filter";
import { LevelContentSection } from "@/components/levels/level-content-section";
import { LevelEmptyState } from "@/components/levels/level-empty-state";
import { LevelItemGrid } from "@/components/levels/level-item-grid";
import { LevelItemList } from "@/components/levels/level-item-list";
import { LevelStageDistributionBar } from "@/components/levels/level-stage-distribution-bar";
import { LevelStageLegend } from "@/components/levels/level-stage-legend";
import {
  LevelViewControls,
  type LevelViewMode,
} from "@/components/levels/level-view-controls";
import type {
  LevelCardItem,
  LevelLessonSection,
  LevelStageDistribution,
} from "@/domains/curriculum";

const VIEW_MODE_STORAGE_KEY = "polyglot:levels-view-mode";
const DEFAULT_VIEW_MODE: LevelViewMode = "normal";

function isLevelViewMode(value: unknown): value is LevelViewMode {
  return (
    value === "large" ||
    value === "normal" ||
    value === "compact" ||
    value === "list"
  );
}

/**
 * A minimal external store over `localStorage`'s view-mode key, read via
 * `useSyncExternalStore` rather than a `useState` lazy initializer (reads
 * `localStorage` directly, mismatching the server's render — the exact bug
 * already documented in `reveal.tsx`) or a `useEffect` that calls
 * `setState` (flagged by `react-hooks/set-state-in-effect`; effects should
 * subscribe to external changes, not push state synchronously).
 * `useSyncExternalStore` is the primitive React provides for exactly this:
 * an external-system value that must render one way on the server
 * (`getServerSnapshot`) and reconcile to the real value on the client
 * without a mismatch warning.
 */
const viewModeListeners = new Set<() => void>();
/** Fallback for when `localStorage` throws (private browsing/blocked storage) — keeps a same-session change visible even though it won't persist. */
let inMemoryFallback: LevelViewMode | null = null;

function subscribeToViewMode(listener: () => void) {
  viewModeListeners.add(listener);
  return () => viewModeListeners.delete(listener);
}

function getViewModeSnapshot(): LevelViewMode {
  try {
    // A key that is simply absent (never set, or genuinely cleared) is a
    // normal "no preference recorded" state — always the fixed default,
    // never the in-memory fallback below. That fallback exists only for
    // when `localStorage` access itself throws, not for an ordinary miss.
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return isLevelViewMode(stored) ? stored : DEFAULT_VIEW_MODE;
  } catch {
    return inMemoryFallback ?? DEFAULT_VIEW_MODE;
  }
}

function getViewModeServerSnapshot(): LevelViewMode {
  return DEFAULT_VIEW_MODE;
}

function setStoredViewMode(mode: LevelViewMode) {
  inMemoryFallback = mode;
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Non-critical preference — the in-memory fallback above still reflects
    // it for the rest of this session even though it won't persist.
  }
  viewModeListeners.forEach((listener) => listener());
}

type LevelContentViewProps = {
  grammar: LevelCardItem[];
  lessons: LevelLessonSection[];
  stageDistribution: LevelStageDistribution;
};

/**
 * Spec 26: the stage-distribution bar, the view-mode/filter controls, the
 * stage-color legend, the flat Grammar section, and one collapsible section
 * per vocabulary "Lesson", as one client boundary. Display mode and the
 * type filter are both non-authoritative UI state — the filter never
 * touches the URL or database, matching code-standards.md's rule that
 * browser state may hold per-viewer UI convenience only.
 */
export function LevelContentView({
  grammar,
  lessons,
  stageDistribution,
}: LevelContentViewProps) {
  const viewMode = useSyncExternalStore(
    subscribeToViewMode,
    getViewModeSnapshot,
    getViewModeServerSnapshot,
  );
  const [filter, setFilter] = useState<LevelContentFilterValue>("all");

  const showGrammar = filter !== "vocabulary";
  const showVocabulary = filter !== "grammar";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <LevelStageLegend />
        <div className="flex items-center gap-2">
          <LevelContentFilter value={filter} onChange={setFilter} />
          <LevelViewControls value={viewMode} onChange={setStoredViewMode} />
        </div>
      </div>

      <LevelStageDistributionBar distribution={stageDistribution} />

      {showGrammar ? (
        <LevelContentSection title="Grammar">
          {grammar.length > 0 ? (
            <LevelContentCollection items={grammar} viewMode={viewMode} />
          ) : (
            <LevelEmptyState message="No grammar items have been published for this level yet." />
          )}
        </LevelContentSection>
      ) : null}

      {showVocabulary ? (
        lessons.length > 0 ? (
          lessons.map((lesson) => (
            <LevelContentSection
              key={lesson.groupId}
              title={`Lesson ${lesson.lessonNumber} — ${lesson.name}`}
              subtitle={`${lesson.items.length} word${lesson.items.length === 1 ? "" : "s"}`}
              trailing={`${lesson.qualifyingCount} of ${lesson.items.length} at Familiar+`}
            >
              <LevelContentCollection items={lesson.items} viewMode={viewMode} />
            </LevelContentSection>
          ))
        ) : (
          <LevelContentSection title="Vocabulary">
            <LevelEmptyState message="No vocabulary items have been published for this level yet." />
          </LevelContentSection>
        )
      ) : null}
    </div>
  );
}

function LevelContentCollection({
  items,
  viewMode,
}: {
  items: LevelCardItem[];
  viewMode: LevelViewMode;
}) {
  if (viewMode === "list") return <LevelItemList items={items} />;
  return <LevelItemGrid items={items} density={viewMode} />;
}
