"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

import type { AppearanceSettings } from "./appearance-settings";
import {
  applyAppearanceToDocument,
  readAppearanceSettings,
  writeAppearanceSettings,
} from "./appearance-storage";

type AppearanceContextValue = {
  settings: AppearanceSettings;
  updateSettings: (partial: Partial<AppearanceSettings>) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * Spec 20 Appearance's client-side source of truth. The lazy `useState`
 * initializer reads real localStorage on the client and safely no-ops to
 * the defaults during the server render pass (`readAppearanceSettings`'s
 * own `typeof window === "undefined"` guard) — no hydration mismatch,
 * since nothing this component renders through JSX depends on `settings`;
 * only `document.documentElement` (already painted correctly before this
 * ever runs, by `appearance-bootstrap.ts`'s inline script) does.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(() =>
    readAppearanceSettings(),
  );

  useEffect(() => {
    applyAppearanceToDocument(settings);
  }, [settings]);

  // Spec 20 Theme: "System follows prefers-color-scheme" — live, not just at
  // load, so a learner who switches their OS theme mid-session sees it
  // update without reloading.
  useEffect(() => {
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyAppearanceToDocument(settings);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<AppearanceSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...partial };
      writeAppearanceSettings(next);
      return next;
    });
  }, []);

  return (
    <AppearanceContext.Provider value={{ settings, updateSettings }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context)
    throw new Error("useAppearance must be used within an AppearanceProvider");
  return context;
}
