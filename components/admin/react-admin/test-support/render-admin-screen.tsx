import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { vi } from "vitest";

import { buildAdminMe } from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { navigation } from "./next-navigation";

/** What the screen asked the API for, as the scripted API sees it. */
export type ScriptedRequest = {
  path: string;
  /** Present for a command (POST/PATCH); absent for a list read. */
  options?: { body?: unknown; method?: "POST" | "PATCH" };
};

/**
 * The part of every Admin screen test that does not depend on the screen: the
 * real components inside the real React Admin provider stack (data provider,
 * auth provider, query client), over a scripted API.
 *
 * `respond` is the scripted API — it answers (or throws for) each request the
 * real data provider makes. The URL the screens read comes from
 * `next-navigation.ts`, which each test file wires into `next/navigation` with
 * `vi.mock`.
 *
 * `ui` is a *function*, evaluated on every render of the harness. A fixed
 * element would be skipped by React when the harness re-renders (same element,
 * same props), so a simulated URL change would never reach the hooks under test.
 */
export function renderAdminScreen({
  ui,
  respond,
  role,
}: {
  ui: () => ReactNode;
  respond: (request: ScriptedRequest) => Promise<unknown>;
  role: UserRole;
}) {
  const request = vi.fn(
    async (
      path: string,
      _schema: unknown,
      options?: ScriptedRequest["options"],
    ): Promise<unknown> => respond({ path, options }),
  );
  // Mutable, so a test can change the caller's role mid-session.
  let currentRole = role;
  const fetchMe = vi.fn(async () =>
    buildAdminMe({ id: "u", role: currentRole }),
  );
  const redirect = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");

  function Harness() {
    const [, setTick] = useState(0);
    navigation.rerender = () => setTick((tick) => tick + 1);
    return (
      <ReactAdminProvider
        signInPath="/sign-in"
        queryClient={queryClient}
        dataProvider={createAdminDataProvider({ request: request as never })}
        authProvider={createAdminAuthProvider({
          fetchMe,
          signInUrl: () => "/sign-in",
          redirect,
        })}
      >
        {ui()}
      </ReactAdminProvider>
    );
  }

  const view = render(<Harness />);
  return {
    ...view,
    request,
    fetchMe,
    redirect,
    queryClient,
    invalidate,
    setRole: (next: UserRole) => {
      currentRole = next;
    },
  };
}
