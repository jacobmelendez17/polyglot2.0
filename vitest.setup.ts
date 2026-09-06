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
