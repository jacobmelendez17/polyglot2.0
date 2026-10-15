import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import {
  buildAdminMe,
  type AdminImportPage,
  type AdminImportRow,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { navigation } from "../test-support/next-navigation";
import { ImportsListScreen } from "./imports-list-screen";

/**
 * Test harness for the import history: the real screen, inside the real React
 * Admin provider stack, over a scripted API that serves history pages by cursor
 * and records every command it is sent. The URL it reads comes from
 * `test-support/next-navigation.ts`, which each test file wires into
 * `next/navigation` with `vi.mock`.
 */

export const ONE_LANGUAGE = [{ id: "lang-es", name: "Spanish" }];
export const TWO_LANGUAGES = [
  { id: "lang-es", name: "Spanish" },
  { id: "lang-fr", name: "French" },
];

export function importRow(
  n: number,
  overrides: Partial<AdminImportRow> = {},
): AdminImportRow {
  return {
    id: `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    originalFilename: `level-${n}.csv`,
    status: "completed",
    totalRows: 61,
    createCount: 43,
    updateCount: 8,
    moveCount: 2,
    unchangedCount: 6,
    reviewCount: 0,
    skippedCount: 0,
    attemptCount: 1,
    createdAt: "2026-09-10T11:59:00.123Z",
    archivedAt: null,
    ...overrides,
  };
}

export function importPage(
  items: AdminImportRow[],
  extra: Partial<AdminImportPage> = {},
): AdminImportPage {
  return {
    items,
    nextCursor: null,
    hasPreviousPage: false,
    previousCursor: null,
    ...extra,
  };
}

export type ImportCommand = {
  verb: "archive" | "restore" | "delete";
  importId: string;
  body: unknown;
};

type RenderOptions = {
  /** Pages by the cursor asked for; `""` is the first page. A test may change it while the screen is open. */
  pages?: Record<string, AdminImportPage>;
  archived?: boolean;
  role?: UserRole;
  languages?: { id: string; name: string }[];
  /** Fails list requests while it returns an error. */
  failList?: () => Error | null;
  /** The server's answer to a history command. Defaults to success. */
  command?: (command: ImportCommand) => unknown | Promise<unknown>;
  /** How soon the screen reads itself again while an import is being worked on. */
  refreshMs?: number;
  /** Holds the permission lookup until this settles, while the list itself is already answered. */
  meGate?: Promise<unknown>;
  /** Makes the permission lookup fail, as a refusal or an outage. */
  meFails?: () => Error | null;
};

export function renderImportsList({
  pages = { "": importPage([importRow(1), importRow(2)]) },
  archived = false,
  role = "admin",
  languages = ONE_LANGUAGE,
  failList = () => null,
  command = ({ importId }) => ({ importId }),
  refreshMs,
  meGate,
  meFails = () => null,
}: RenderOptions = {}) {
  const listRequests: string[] = [];
  const commands: ImportCommand[] = [];

  const request = vi.fn(
    async (
      path: string,
      _schema: unknown,
      options?: { body?: unknown },
    ): Promise<unknown> => {
      if (options?.body !== undefined) {
        const [, , importId, verb] = path.split("/");
        const sent: ImportCommand = {
          verb: verb as ImportCommand["verb"],
          importId: decodeURIComponent(importId!),
          body: options.body,
        };
        commands.push(sent);
        return command(sent);
      }
      const failure = failList();
      if (failure) throw failure;
      listRequests.push(path);
      const cursor =
        new URLSearchParams(path.split("?")[1]).get("cursor") ?? "";
      const found = pages[cursor];
      if (!found) throw new Error(`no scripted page for cursor "${cursor}"`);
      return found;
    },
  );
  // Mutable, so a test can change the caller's role mid-session.
  let currentRole = role;
  const fetchMe = vi.fn(async () => {
    await meGate;
    const failure = meFails();
    if (failure) throw failure;
    return buildAdminMe({ id: "u", role: currentRole });
  });
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
        <ImportsListScreen
          languages={languages}
          archived={archived}
          refreshMs={refreshMs}
        />
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
