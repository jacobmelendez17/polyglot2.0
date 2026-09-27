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

// jsdom implements no ResizeObserver at all. Chart.js (the dashboard chart
// migration, spec — 2026-09-27) uses one internally to keep a chart's canvas
// sized to its container under `responsive: true`. A no-op observer is fine
// here: no test asserts on a chart's actual pixel layout, only on the
// accessible `role="img"` summary text rendered alongside it.
if (!("ResizeObserver" in globalThis)) {
  class NoopResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = NoopResizeObserver;
}

// jsdom implements the <canvas> element but not a real 2D rendering context
// — `getContext("2d")` returns null. Chart.js needs a context object to
// construct successfully. Rather than hand-maintain a list of the dozens of
// Canvas 2D methods/properties Chart.js's drawing code might touch, a Proxy
// absorbs any of them as a no-op (methods) or a stored value (properties):
// nothing here asserts on rendered pixels, only on the accessible
// `role="img"` summary text rendered alongside the (real, but invisible)
// canvas.
function createNoopCanvasContext(canvas: HTMLCanvasElement) {
  const state: Record<string, unknown> = { canvas };
  return new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "createPattern") return () => null;
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => ({ addColorStop: () => {} });
      }
      if (prop === "getImageData") {
        return () => ({ data: new Uint8ClampedArray(0) });
      }
      return () => {};
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- interop shim for an environment (jsdom) with no real Canvas 2D context to type against
  }) as any as CanvasRenderingContext2D;
}

// Assigned directly rather than delegating to jsdom's own `getContext` first
// — jsdom has no real implementation for any context type and logs a noisy
// "Not implemented" console warning on every call, same reasoning as
// components/onboarding/onboarding-flow.test.tsx's identical per-file stub.
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  contextId: string,
) {
  if (contextId === "2d") return createNoopCanvasContext(this);
  return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reassigning an overloaded native method with one concrete signature
} as any;
