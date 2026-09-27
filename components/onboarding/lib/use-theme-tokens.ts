"use client";

// Resolves the onboarding colour tokens (`--ob-*` in onboarding.css, each an
// alias of one of the app's own theme tokens) to RGB triplets, for the canvas
// and SVG parts that can't take a CSS variable. Re-reads whenever the theme or
// accent palette changes, so those colours stay in step with the page.

import { useCallback, useEffect, useState } from "react";

import { parseComputedColor } from "./color";
import type { RGB } from "./tower";

export function useThemeTokens(root: React.RefObject<HTMLElement | null>): {
  read: (name: string) => RGB;
  version: number;
} {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const observer = new MutationObserver(bump);
    // The app toggles a `dark` class on <html>; the accent palette is a data attribute.
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-palette", "style"],
    });
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", bump);
    bump();
    return () => {
      observer.disconnect();
      query.removeEventListener("change", bump);
    };
  }, []);

  const read = useCallback(
    (name: string): RGB => {
      if (typeof document === "undefined") return [0, 0, 0];
      const host = root.current ?? document.documentElement;
      // A probe element resolves `var()` and `color-mix()` the browser's own
      // way, instead of parsing token values by hand.
      const probe = document.createElement("span");
      probe.style.color = `var(--ob-${name})`;
      probe.style.display = "none";
      host.appendChild(probe);
      const resolved = parseComputedColor(getComputedStyle(probe).color);
      host.removeChild(probe);
      return resolved ?? [0, 0, 0];
    },
    // `version` is a dependency on purpose: a new function identity tells consumers to re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, version],
  );

  return { read, version };
}
