import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom implements neither the Pointer Capture APIs nor `scrollIntoView` —
// Radix's `Select` (first used in this project by `components/ui/select.tsx`,
// spec 11 Unit 3) calls all three internally and throws under
// `userEvent.click()` without them. This is Radix's own documented jsdom
// workaround, not project-specific behavior — safe to no-op in every test.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom implements no IntersectionObserver at all. `ItemDetailShell`
// (spec 18) uses one to track the active section and the hero's visibility,
// deliberately in place of a scroll handler, so rendering the item layout
// throws without this. A no-op observer is the honest stub: it never fires,
// which leaves the component in its initial state — first section active,
// hero visible — and every test that cares about observed behavior would
// need to drive the callback itself rather than rely on jsdom.
if (!("IntersectionObserver" in globalThis)) {
  class NoopIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = NoopIntersectionObserver;
}
