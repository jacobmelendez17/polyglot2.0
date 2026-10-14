import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import {
  buildAdminMe,
  type AdminCurriculumPage,
  type AdminCurriculumRow,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { navigation } from "../test-support/next-navigation";
import { CurriculumListScreen } from "./curriculum-list-screen";

/**
 * Test harness for the curriculum list: the real screen, inside the real
 * React Admin provider stack, over a scripted cursor-paginated fake API. The
 * URL it reads comes from `test-support/next-navigation.ts`, which each
 * test file wires into `next/navigation` with `vi.mock`.
 *
 * The navigation state is a separate module on purpose: the `vi.mock` factory
 * must load it, and if it lived here it would load *this* module — which
 * imports the screen — which imports `next/navigation`, i.e. the mock still
 * waiting on its own factory (a deadlock, not an error).
 */

export const LANGUAGES = [
  { id: "lang-es", name: "Spanish" },
  { id: "lang-fr", name: "French" },
];
export const LEVELS = [
  { id: "level-1", levelNumber: 1 },
  { id: "level-2", levelNumber: 2 },
];
export const GROUPS = [
  { id: "group-a", name: "Animals", levelNumber: 1 },
  { id: "group-b", name: "Colors", levelNumber: 2 },
];

export function row(
  n: number,
  overrides: Partial<AdminCurriculumRow> = {},
): AdminCurriculumRow {
  return {
    id: `item-${n}`,
    type: "vocabulary",
    status: "published",
    levelId: "level-1",
    levelNumber: 1,
    itemLabel: `palabra ${n}`,
    meaningLabel: `word ${n}`,
    groupId: null,
    groupName: null,
    ...overrides,
  };
}

/** A scripted API: pages keyed by the cursor asked for (`""` is the first page). */
export type FakePages = Record<string, AdminCurriculumPage>;

export function page(
  items: AdminCurriculumRow[],
  extra: Partial<AdminCurriculumPage> = {},
): AdminCurriculumPage {
  return {
    items,
    nextCursor: null,
    hasPreviousPage: false,
    previousCursor: null,
    ...extra,
  };
}

/** A scripted answer to one bulk command: given the body it was sent, return the result or throw the refusal. */
export type CommandHandler = (
  body: Record<string, unknown>,
) => unknown | Promise<unknown>;

type RenderOptions = {
  pages?: FakePages;
  /** The signed-in person's role; a function is read on every permission lookup, so a test can revoke it mid-session. */
  role?: UserRole | (() => UserRole);
  fail?: () => Error | null;
  /** Answers to the bulk commands, by endpoint path (`/curriculum/bulk-publish`). A command with no handler fails the test. */
  commands?: Record<string, CommandHandler>;
  /** Makes the permission lookup (`/api/v1/admin/me`) fail, as a refusal or an outage. */
  meFails?: () => Error | null;
  /** Holds the permission lookup until this settles, while the list itself is already answered. */
  meGate?: Promise<unknown>;
};

export function renderCurriculumList({
  pages = { "": page([row(1), row(2), row(3)]) },
  role = "admin",
  fail = () => null,
  commands = {},
  meFails = () => null,
  meGate,
}: RenderOptions = {}) {
  const requests: string[] = [];
  /** Every command sent, in order, with the body it carried. */
  const commandCalls: { path: string; body: Record<string, unknown> }[] = [];
  const request = vi.fn(
    async (path: string, _schema?: unknown, options?: { body?: unknown }) => {
      if (options?.body !== undefined) {
        // A command, not a list read: its own scripted answer, and recorded.
        const body = options.body as Record<string, unknown>;
        commandCalls.push({ path, body });
        const handler = commands[path];
        if (!handler) throw new Error(`no scripted command for "${path}"`);
        return handler(body);
      }
      const failure = fail();
      if (failure) throw failure;
      requests.push(path);
      const cursor =
        new URLSearchParams(path.split("?")[1]).get("cursor") ?? "";
      const found = pages[cursor];
      if (!found) throw new Error(`no scripted page for cursor "${cursor}"`);
      return found;
    },
  );
  const fetchMe = vi.fn(async () => {
    await meGate;
    const failure = meFails();
    if (failure) throw failure;
    return buildAdminMe({
      id: "u",
      role: typeof role === "function" ? role() : role,
    });
  });
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
        <CurriculumListScreen
          languages={LANGUAGES}
          levels={LEVELS}
          groups={GROUPS}
        />
      </ReactAdminProvider>
    );
  }

  const view = render(<Harness />);
  return {
    ...view,
    request,
    requests,
    commandCalls,
    fetchMe,
    redirect,
    queryClient,
  };
}
