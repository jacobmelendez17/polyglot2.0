import { vi } from "vitest";

/**
 * A stand-in for `next/navigation` backed by a mutable URL, so the Admin list
 * tests (curriculum, review) can watch real round trips: a filter or cursor is
 * pushed to the "address bar", `useSearchParams` reflects it, and the screen
 * re-reads it.
 *
 * Deliberately dependency-free (only `vitest`): `vi.mock` factories load this
 * module, and it must not import anything that itself imports
 * `next/navigation`.
 */

/** The URL `next/navigation` reports, and the calls made to change it. */
export const navigation = {
  pathname: "/admin/curriculum",
  search: "",
  // Navigation applies itself: the implementation lives in the mock, and
  // `reset()` only *clears* recorded calls (`mockReset()` would also drop it).
  push: vi.fn<(url: string, options?: unknown) => void>((url) =>
    navigation.go(url),
  ),
  replace: vi.fn<(url: string, options?: unknown) => void>((url) =>
    navigation.go(url),
  ),
  // Re-renders the server components of the current route; the stand-in only
  // records that it was asked to.
  refresh: vi.fn<() => void>(),
  rerender: () => {},
  reset(search = "language=lang-es", pathname = "/admin/curriculum") {
    this.pathname = pathname;
    this.search = search;
    this.push.mockClear();
    this.replace.mockClear();
    this.refresh.mockClear();
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
    refresh: () => navigation.refresh(),
  }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
});
