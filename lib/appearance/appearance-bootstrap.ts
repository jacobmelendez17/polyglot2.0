import { APPEARANCE_STORAGE_KEY } from "./appearance-storage";

/**
 * Spec 20 Appearance — "Avoid Theme Flash": "Apply saved theme preference
 * before normal hydration... Use a small early appearance bootstrap."
 *
 * Returns raw JS source for an inline `<script>` rendered in `<head>`
 * (`app/layout.tsx`), so it runs and paints correctly *before* any visible
 * body content — a `<script src>` or anything deferred to after hydration
 * would let the default (light, Cozy, Sage) flash first. This necessarily
 * duplicates a small slice of `appearance-settings.ts`'s/
 * `appearance-storage.ts`'s logic inline, in plain ES5-safe JS with no
 * imports — a bootstrap script can't import modules, and browser support
 * for the syntax has to assume nothing about bundler transforms having run.
 * Deliberately lenient (a malformed stored value is simply ignored here,
 * not validated) — `AppearanceProvider` re-parses the real value properly
 * on mount and corrects anything this missed; the bootstrap's only job is
 * avoiding a *visible flash*, not being the source of truth.
 */
export function getAppearanceBootstrapScript(): string {
  return `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)})||"{}");var t=s.theme;var dark=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(dark)r.classList.add("dark");if(s.palette)r.setAttribute("data-palette",s.palette);if(s.fontFamily)r.setAttribute("data-font-family",s.fontFamily);if(s.fontScale)r.setAttribute("data-font-scale",s.fontScale);if(s.colorBlindAssistance)r.setAttribute("data-color-blind","true");}catch(e){}})();`;
}
