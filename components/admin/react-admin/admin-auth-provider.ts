import type { AuthProvider } from "react-admin";

import { adminMeSchema, type AdminMe } from "@/domains/admin";

import { requestAdminApi } from "./admin-api-client";
import { isAdminApiError } from "./admin-api-error";

type AdminAuthProviderOptions = {
  /** Loads `GET /api/v1/admin/me`. Injected in tests. */
  fetchMe?: () => Promise<AdminMe>;
  /** Absolute-or-relative URL of Clerk's existing sign-in page for this location. */
  signInUrl: () => string;
  /** Navigates the *browser* (not React Admin's router). Injected in tests. */
  redirect?: (url: string) => void;
};

/**
 * Builds the sign-in URL Clerk's own page expects: the existing first-party
 * sign-in route, plus a `redirect_url` so the person lands back where they
 * were. Pure so it can be tested without a browser.
 */
export function buildSignInUrl(
  signInPath: string,
  location: { pathname: string; search: string },
): string {
  const returnTo = `${location.pathname}${location.search}`;
  return `${signInPath}?redirect_url=${encodeURIComponent(returnTo)}`;
}

/**
 * React Admin's `authProvider` for Polyglot (spec 26 §3 "No second
 * authentication system").
 *
 * Clerk owns credentials and sessions; this provider owns none. It is
 * *presentation coordination*: it asks the server who the caller is and what
 * they may do (`GET /api/v1/admin/me`), mirrors that answer to React Admin's
 * hooks (`usePermissions`, `useCanAccess`), and reacts to access failures —
 * and nothing it says is ever trusted by the server, which re-checks the
 * database role on every request.
 *
 * - **401** -> send the browser to Clerk's existing sign-in page.
 * - **403** -> *not* a logout: the person is signed in, just not allowed, so
 *   the screen renders its own access-denied state.
 * - Sign-out stays Clerk's operation; `logout` here changes nothing.
 *
 * **`checkError` never rejects, on purpose.** React Admin's `useDataProvider`
 * wrapper treats a rejected `checkError` as "the user is being logged out"
 * and *swallows the original error, handing the screen an empty successful
 * response instead* (`{ data: {} }`, or `[]` for lists). For an authorization
 * failure that is exactly the wrong answer — "never return an empty
 * successful list on authorization failure" (spec 26 §3) — so this provider
 * performs its side effect and resolves, which makes React Admin re-throw the
 * real 401/403 into the query for the screen to render.
 */
export function createAdminAuthProvider({
  fetchMe = () => requestAdminApi("/me", adminMeSchema),
  signInUrl,
  redirect = (url) => window.location.assign(url),
}: AdminAuthProviderOptions): AuthProvider {
  // One `/me` request serves every concurrent caller (React Admin fires
  // `getPermissions` and several `canAccess` checks together on mount). The
  // result is *not* kept afterwards: a role that changed since the last call
  // must be seen by the next one, so staleness is bounded by React Query's
  // own refetch policy, never by this provider.
  let inflight: Promise<AdminMe> | null = null;
  function loadMe(): Promise<AdminMe> {
    inflight ??= fetchMe().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  let redirecting = false;
  function sendToSignIn(): void {
    if (redirecting) return;
    redirecting = true;
    redirect(signInUrl());
  }

  return {
    // Sign-in is Clerk's, not a React Admin login screen.
    login: async () => {
      sendToSignIn();
      return { redirectTo: false };
    },

    // Sign-out is Clerk's operation; returning `false` tells React Admin not
    // to navigate anywhere itself.
    logout: async () => false,

    checkAuth: async () => {
      try {
        await loadMe();
      } catch (error) {
        if (isAdminApiError(error) && error.kind === "unauthenticated") {
          sendToSignIn();
        }
        throw error;
      }
    },

    checkError: async (error) => {
      // Resolve in every case (see the note above). A 403 needs no side
      // effect at all — the screen shows it — and any other failure says
      // nothing about who the caller is.
      if (error?.status === 401) sendToSignIn();
    },

    getPermissions: async () => (await loadMe()).permissions,

    canAccess: async ({ resource, action }) => {
      const { resources } = (await loadMe()).permissions;
      // Own properties only: `resources["toString"]` would otherwise resolve
      // to `Object.prototype.toString` and throw on `.includes`.
      if (!Object.hasOwn(resources, resource)) return false;
      return (resources[resource] as readonly string[]).includes(action);
    },
  };
}
