"use client";

import { useState, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  AdminContext,
  Notification,
  defaultI18nProvider,
  type AuthProvider,
  type DataProvider,
} from "react-admin";
import { MemoryRouter } from "react-router";

import { createAdminAuthProvider, buildSignInUrl } from "./admin-auth-provider";
import { createAdminDataProvider } from "./admin-data-provider";
import { createAdminQueryClient } from "./admin-query-client";
import { usePolyglotThemeOptions } from "./polyglot-theme";

type ReactAdminProviderProps = {
  children: ReactNode;
  /**
   * Clerk's sign-in route (`NEXT_PUBLIC_CLERK_SIGN_IN_URL`). Handed down by
   * the server page, which reads it through the typed `lib/env` module —
   * that module validates server secrets at import and cannot load in the
   * browser, so client code receives the one value it needs as a prop
   * instead of reading `process.env` itself.
   */
  signInPath: string;
  /** Test seams. Production always uses the Polyglot providers below. */
  dataProvider?: DataProvider;
  authProvider?: AuthProvider;
  queryClient?: QueryClient;
};

/**
 * The client-only React Admin boundary (spec 26 §3 "Integration strategy").
 *
 * It lives *inside* the server-protected `app/(admin)/admin/layout.tsx` and
 * does not replace it: Next's App Router still owns every URL, and the
 * layout's role guard still runs first. What this adds is React Admin's
 * *context* — data fetching, caching, auth/permissions hooks, notifications —
 * without React Admin's own `<Admin>` shell, resources, or root router.
 *
 * Routing: React Admin's hooks need *a* router. Given none it mounts a
 * `HashRouter` (`/admin#/...`), which the spec forbids as a navigation
 * scheme. This `MemoryRouter` satisfies the requirement and is otherwise
 * inert: it is never wired to the address bar, so it can neither change nor
 * react to a Next URL, and nothing here may navigate through it. Screens link
 * with `next/link`.
 *
 * Providers are built once per mount (`useState` initialisers), so their
 * in-flight-request de-duplication and the React Query cache persist for the
 * life of the screen without leaking between visits.
 */
export function ReactAdminProvider({
  children,
  signInPath,
  dataProvider: injectedDataProvider,
  authProvider: injectedAuthProvider,
  queryClient: injectedQueryClient,
}: ReactAdminProviderProps) {
  const [dataProvider] = useState(
    () => injectedDataProvider ?? createAdminDataProvider(),
  );
  const [authProvider] = useState(
    () =>
      injectedAuthProvider ??
      createAdminAuthProvider({
        signInUrl: () => buildSignInUrl(signInPath, window.location),
      }),
  );
  const [queryClient] = useState(
    () => injectedQueryClient ?? createAdminQueryClient(),
  );
  const theme = usePolyglotThemeOptions();

  return (
    <MemoryRouter>
      <AdminContext
        dataProvider={dataProvider}
        authProvider={authProvider}
        queryClient={queryClient}
        i18nProvider={defaultI18nProvider}
        theme={theme}
      >
        {children}
        <Notification />
      </AdminContext>
    </MemoryRouter>
  );
}
