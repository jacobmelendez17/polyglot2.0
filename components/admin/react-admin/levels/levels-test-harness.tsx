import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { vi } from "vitest";

import {
  buildAdminMe,
  type AdminLevelCreateResult,
  type AdminLevelList,
  type AdminLevelRow,
  type AdminLevelUpdateResult,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { navigation } from "../test-support/next-navigation";

/**
 * Shared test harness for the Levels screens: the real components, inside the
 * real React Admin provider stack, over a scripted API that serves levels per
 * language and records every command it is sent. The URL it reads comes from
 * `test-support/next-navigation.ts`, which each test file wires into
 * `next/navigation` with `vi.mock`.
 */

export const ONE_LANGUAGE = [{ id: "lang-es", name: "Spanish" }];
export const TWO_LANGUAGES = [
  { id: "lang-es", name: "Spanish" },
  { id: "lang-fr", name: "French" },
];

export function levelRow(
  n: number,
  overrides: Partial<AdminLevelRow> = {},
): AdminLevelRow {
  return {
    id: `level-${n}`,
    levelNumber: n,
    name: null,
    status: "draft",
    cefrLevel: null,
    vocabularyItems: 0,
    grammarItems: 0,
    vocabularyGroups: 0,
    ...overrides,
  };
}

export function levelList(
  items: AdminLevelRow[],
  truncated = false,
): AdminLevelList {
  return { items, truncated };
}

/** One command the screen sent, as the API saw it. */
export type SentCommand = {
  path: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
};

type Script = {
  /** The levels the server holds, by language. */
  levels?: Record<string, AdminLevelList>;
  role?: UserRole;
  /** Fails list requests while it returns an error. */
  failList?: () => Error | null;
  /**
   * The server's answer to a command. Defaults to success; throw to refuse.
   * Receives what was sent, including the idempotency key.
   */
  answer?: (
    command: SentCommand,
  ) => Promise<AdminLevelCreateResult | AdminLevelUpdateResult>;
};

/** The scripted API, the providers around it, and what a test needs to observe. */
/**
 * `ui` is a *function*, evaluated on every render of the harness. A fixed
 * element would be skipped by React when the harness re-renders (same element,
 * same props), so a simulated URL change would never reach the hooks under test.
 */
export function renderWithLevelsApi(
  ui: () => ReactNode,
  {
    levels = { "lang-es": levelList([levelRow(1), levelRow(2)]) },
    role = "admin",
    failList = () => null,
    answer = async (command) => ({
      levelId:
        command.method === "PATCH"
          ? command.path.split("/").at(-1)!
          : "level-new",
    }),
  }: Script = {},
) {
  const listRequests: string[] = [];
  const commands: SentCommand[] = [];

  const request = vi.fn(
    async (
      path: string,
      _schema: unknown,
      options?: { body?: unknown; method?: "POST" | "PATCH" },
    ): Promise<unknown> => {
      if (options?.body !== undefined) {
        const command: SentCommand = {
          path,
          method: options.method ?? "POST",
          body: options.body as Record<string, unknown>,
        };
        commands.push(command);
        return answer(command);
      }
      const failure = failList();
      if (failure) throw failure;
      listRequests.push(path);
      const language = new URLSearchParams(path.split("?")[1]).get("language");
      const found = levels[language ?? ""];
      if (!found) throw new Error(`no scripted levels for "${language}"`);
      return found;
    },
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
    listRequests,
    commands,
    fetchMe,
    redirect,
    queryClient,
    invalidate,
    setRole: (next: UserRole) => {
      currentRole = next;
    },
  };
}
