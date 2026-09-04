"use client";

import { useSyncExternalStore } from "react";

import { LevelContentSection } from "@/components/levels/level-content-section";
import { LevelEmptyState } from "@/components/levels/level-empty-state";
import { LevelItemGrid } from "@/components/levels/level-item-grid";
import { LevelItemList } from "@/components/levels/level-item-list";
import { LevelViewControls, type LevelViewMode } from "@/components/levels/level-view-controls";
import type { LevelCardItem } from "@/domains/curriculum";

const VIEW_MODE_STORAGE_KEY = "polyglot:levels-view-mode";
const DEFAULT_VIEW_MODE: LevelViewMode = "normal";

function isLevelViewMode(value: unknown): value is LevelViewMode {
  return value === "large" || value === "normal" || value === "compact" || value === "list";
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
  vocabulary: LevelCardItem[];
};

/**
 * Spec 10 §17-§22: the view-mode controls plus the Grammar/Vocabulary
 * sections they affect, as one client boundary. Display mode is
 * non-authoritative UI state (§22) — it never touches the URL/route and is
 * only ever read from `localStorage` as a per-viewer convenience, matching
 * code-standards.md's rule that browser storage may hold non-authoritative
 * UI state only.
 *
 * Reads the persisted mode via `useSyncExternalStore` (see the store
 * functions above) rather than a `useState` lazy initializer or a
 * `useEffect` that calls `setState` — both reproduce known problems
 * (respectively: a server/client hydration mismatch, since a `"use client"`
 * component still renders once on the server; and an ESLint
 * `react-hooks/set-state-in-effect` violation). `useSyncExternalStore` is
 * the primitive React provides for exactly this case and handles the
 * server/client reconciliation without a mismatch warning.
 */
export function LevelContentView({ grammar, vocabulary }: LevelContentViewProps) {
  const viewMode = useSyncExternalStore(subscribeToViewMode, getViewModeSnapshot, getViewModeServerSnapshot);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <LevelViewControls value={viewMode} onChange={setStoredViewMode} />
      </div>

      <LevelContentSection title="Grammar">
        {grammar.length > 0 ? (
          <LevelContentCollection items={grammar} viewMode={viewMode} />
        ) : (
          <LevelEmptyState message="No grammar items have been published for this level yet." />
        )}
      </LevelContentSection>

      <LevelContentSection title="Vocabulary">
        {vocabulary.length > 0 ? (
          <LevelContentCollection items={vocabulary} viewMode={viewMode} />
        ) : (
          <LevelEmptyState message="No vocabulary items have been published for this level yet." />
        )}
      </LevelContentSection>
    </div>
  );
}

function LevelContentCollection({ items, viewMode }: { items: LevelCardItem[]; viewMode: LevelViewMode }) {
  if (viewMode === "list") return <LevelItemList items={items} />;
  return <LevelItemGrid items={items} density={viewMode} />;
}
