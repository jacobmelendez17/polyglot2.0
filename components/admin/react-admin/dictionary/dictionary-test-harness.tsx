import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import {
  buildAdminMe,
  type AdminDictionaryCounts,
  type AdminDictionaryPage,
  type AdminDictionaryRow,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { navigation } from "../test-support/next-navigation";
import { DictionaryListScreen } from "./dictionary-list-screen";

/**
 * Test harness for the dictionary mapping queue: the real screen, inside the
 * real React Admin provider stack, over a scripted API that serves pages by
 * offset and records every request. The URL it reads comes from
 * `test-support/next-navigation.ts`, which each test file wires into
 * `next/navigation` with `vi.mock`.
 */

export const ONE_LANGUAGE = [{ id: "lang-es", name: "Spanish" }];
export const TWO_LANGUAGES = [
  { id: "lang-es", name: "Spanish" },
  { id: "lang-fr", name: "French" },
];
export const LEVELS = [
  { id: "level-1", levelNumber: 1 },
  { id: "level-2", levelNumber: 2 },
];
export const GROUPS = [
  { id: "group-1a", name: "Animals", levelNumber: 1 },
  { id: "group-1b", name: "Colors", levelNumber: 1 },
  { id: "group-2a", name: "Travel", levelNumber: 2 },
];
export const REGIONS = ["es-MX", "es"];

export const COUNTS: AdminDictionaryCounts = {
  unmatched: 3,
  source_data_not_imported: 1,
  auto_matched: 20,
  review_required: 4,
  manual: 9,
  no_mapping: 0,
};

export function word(
  n: number,
  overrides: Partial<AdminDictionaryRow> = {},
): AdminDictionaryRow {
  return {
    id: `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    displayWord: `palabra ${n}`,
    translation: `word ${n}`,
    levelNumber: 1,
    groupName: "Animals",
    lookupForm: `palabra${n}`,
    matchStatus: "auto_matched",
    confidence: "high",
    reviewReason: null,
    manualLock: false,
    entryLemma: `lema ${n}`,
    entryPartOfSpeech: "noun",
    confirmable: true,
    regionalStatus: "recognized",
    ...overrides,
  };
}

export function dictionaryPage(
  items: AdminDictionaryRow[],
  extra: Partial<AdminDictionaryPage> = {},
): AdminDictionaryPage {
  return {
    items,
    total: items.length,
    counts: COUNTS,
    regionCode: "es-MX",
    regionCodes: REGIONS,
    ...extra,
  };
}

type RenderOptions = {
  /** Pages by the offset asked for; `"0"` is the first. A test may change it while the screen is open. */
  pages?: Record<string, AdminDictionaryPage>;
  role?: UserRole;
  languages?: { id: string; name: string }[];
  levels?: { id: string; levelNumber: number }[];
  groups?: { id: string; name: string; levelNumber: number }[];
  regionCodes?: string[];
  /** Fails list requests while it returns an error. */
  failList?: () => Error | null;
  /** Holds the answer for the page at an offset until its promise settles — a slow page. */
  pageGates?: Record<string, Promise<unknown>>;
  /** Holds the permission lookup until this settles, while the list itself is already answered. */
  meGate?: Promise<unknown>;
  /** Makes the permission lookup fail, as a refusal or an outage. */
  meFails?: () => Error | null;
};

export function renderDictionaryList({
  pages = { "0": dictionaryPage([word(1), word(2)]) },
  role = "admin",
  languages = ONE_LANGUAGE,
  levels = LEVELS,
  groups = GROUPS,
  regionCodes = REGIONS,
  failList = () => null,
  pageGates = {},
  meGate,
  meFails = () => null,
}: RenderOptions = {}) {
  const listRequests: string[] = [];

  const request = vi.fn(async (path: string): Promise<unknown> => {
    const failure = failList();
    if (failure) throw failure;
    listRequests.push(path);
    const offset = new URLSearchParams(path.split("?")[1]).get("offset") ?? "0";
    await pageGates[offset];
    const found = pages[offset];
    if (!found) throw new Error(`no scripted page for offset "${offset}"`);
    return found;
  });
  const fetchMe = vi.fn(async () => {
    await meGate;
    const failure = meFails();
    if (failure) throw failure;
    return buildAdminMe({ id: "u", role });
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
        <DictionaryListScreen
          languages={languages}
          levels={levels}
          groups={groups}
          regionCodes={regionCodes}
        />
      </ReactAdminProvider>
    );
  }

  const view = render(<Harness />);
  return {
    ...view,
    request,
    listRequests,
    fetchMe,
    redirect,
    queryClient,
    invalidate,
  };
}
