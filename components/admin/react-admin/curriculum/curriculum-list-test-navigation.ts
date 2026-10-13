import { vi } from "vitest";

/**
 * A stand-in for `next/navigation` backed by a mutable URL, so list tests can
 * watch real round trips: a filter or cursor is pushed to the "address bar",
 * `useSearchParams` reflects it, and the screen re-reads it.
 *
 * Deliberately dependency-free (only `vitest`): `vi.mock` factories load this
 * module, and it must not import anything that itself imports
 * `next/navigation`.
 */

/** The URL `next/navigation` reports, and the calls made to change it. */
export const navigation = {
  search: "",
  // Navigation applies itself: the implementation lives in the mock, and
  // `reset()` only *clears* recorded calls (`mockReset()` would also drop it).
  push: vi.fn<(url: string, options?: unknown) => void>((url) =>
    navigation.go(url),
  ),
  replace: vi.fn<(url: string, options?: unknown) => void>((url) =>
    navigation.go(url),
  ),
  rerender: () => {},
  reset(search = "language=lang-es") {
    this.search = search;
    this.push.mockClear();
    this.replace.mockClear();
    this.rerender = () => {};
  },
  go(url: string) {
    this.search = url.split("?")[1] ?? "";
    this.rerender();
  },
};

export const nextNavigationMock = () => ({
  useRouter: () => ({
    push: (url: string, options?: unknown) => navigation.push(url, options),
    replace: (url: string, options?: unknown) =>
      navigation.replace(url, options),
  }),
  usePathname: () => "/admin/curriculum",
  useSearchParams: () => new URLSearchParams(navigation.search),
});
