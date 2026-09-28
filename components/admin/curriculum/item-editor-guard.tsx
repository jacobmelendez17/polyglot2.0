"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Spec 25 §17 — "Unsaved manual edits require a navigation warning." Scoped
 * deliberately: this catches an actual browser-level unload (refresh, close,
 * typed URL, bookmark — `beforeunload`) and the item editor's own
 * Previous/Next/Next Incomplete Item/Return to Results links (`GuardedLink`
 * below). It does not intercept the broader admin sidebar or other
 * in-app navigation — Next.js's App Router has no general "block this
 * transition" hook, and building one would be a much larger, separate
 * change than this unit's own scope (item-editor navigation).
 *
 * A plain mutable ref, not `useState`, backs the dirty flag: nothing here
 * needs to re-render when it flips (`beforeunload`'s handler and
 * `GuardedLink`'s click handler both just read the current value at the
 * moment they fire), and a ref avoids re-rendering the whole editor on every
 * keystroke.
 */
type ItemEditorGuardContextValue = {
  dirtyRef: { current: boolean };
  setDirty: (dirty: boolean) => void;
};

const NOOP_CONTEXT: ItemEditorGuardContextValue = {
  dirtyRef: { current: false },
  setDirty: () => {},
};

const ItemEditorGuardContext =
  createContext<ItemEditorGuardContextValue>(NOOP_CONTEXT);

export function useItemEditorGuard(): ItemEditorGuardContextValue {
  return useContext(ItemEditorGuardContext);
}

const UNSAVED_CHANGES_MESSAGE =
  "You have unsaved changes. Leave this page and lose them?";

export function ItemEditorGuardProvider({ children }: { children: ReactNode }) {
  const dirtyRef = useRef(false);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      // The modern, standards-track way to trigger the browser's own
      // native confirmation prompt — its text is never actually shown
      // (every major browser replaces it with a fixed message for
      // security reasons), but the prompt itself only appears when
      // `returnValue` is set.
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const value: ItemEditorGuardContextValue = {
    dirtyRef,
    setDirty: (dirty: boolean) => {
      dirtyRef.current = dirty;
    },
  };

  return (
    <ItemEditorGuardContext.Provider value={value}>
      {children}
    </ItemEditorGuardContext.Provider>
  );
}

/** A `Link` that confirms before navigating away from unsaved edits — otherwise identical to `next/link`'s own `Link`. */
export function GuardedLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const { dirtyRef } = useItemEditorGuard();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (dirtyRef.current && !window.confirm(UNSAVED_CHANGES_MESSAGE)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </Link>
  );
}
