import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import {
  buildAdminMe,
  type AdminLogPage,
  type AdminLogRow,
} from "@/domains/admin";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { navigation } from "../test-support/next-navigation";
import { LogsListScreen } from "./logs-list-screen";

/**
 * Test harness for the audit log: the real screen, inside the real React Admin
 * provider stack, over a scripted API that serves log pages by cursor and
 * records every request. The URL it reads comes from
 * `test-support/next-navigation.ts`, which each test file wires into
 * `next/navigation` with `vi.mock`.
 */

export const ADA = "a0000000-0000-4000-8000-000000000001";
export const TARGET = "b0000000-0000-4000-8000-000000000002";

export function logRow(
  n: number,
  overrides: Partial<AdminLogRow> = {},
): AdminLogRow {
  return {
    id: `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    createdAt: "2026-10-14T22:46:21.710Z",
    actorId: ADA,
    actorName: "Ada Admin",
    action: "USER_ROLE_CHANGED",
    resourceType: "user",
    resourceId: TARGET,
    reason: "Reviews lessons",
    correlationId: `correlation-${n}`,
    beforeData: { role: "user" },
    afterData: { role: "writer" },
    ...overrides,
  };
}

export function logPage(
  items: AdminLogRow[],
  extra: Partial<AdminLogPage> = {},
): AdminLogPage {
  return {
    items,
    nextCursor: null,
    hasPreviousPage: false,
    previousCursor: null,
    ...extra,
  };
}

type RenderOptions = {
  /** Pages by the cursor asked for; `""` is the first page. A test may change it while the screen is open. */
  pages?: Record<string, AdminLogPage>;
  /** Fails list requests while it returns an error. */
  failList?: () => Error | null;
  /** Holds the answer for the page at a cursor until its promise settles — a slow page. */
  pageGates?: Record<string, Promise<unknown>>;
};

export function renderLogsList({
  pages = { "": logPage([logRow(1), logRow(2)]) },
  failList = () => null,
  pageGates = {},
}: RenderOptions = {}) {
  const listRequests: string[] = [];

  const request = vi.fn(async (path: string): Promise<unknown> => {
    const failure = failList();
    if (failure) throw failure;
    listRequests.push(path);
    const cursor = new URLSearchParams(path.split("?")[1]).get("cursor") ?? "";
    await pageGates[cursor];
    const found = pages[cursor];
    if (!found) throw new Error(`no scripted page for cursor "${cursor}"`);
    return found;
  });
  // The screen never asks who the caller is (the log is read-only, and the
  // endpoint says who may read it); the auth provider still needs one.
  const fetchMe = vi.fn(async () =>
    buildAdminMe({ id: "u", role: "developer" }),
  );
  const redirect = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

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
        <LogsListScreen />
      </ReactAdminProvider>
    );
  }

  const view = render(<Harness />);
  return { ...view, request, listRequests, fetchMe, redirect, queryClient };
}
