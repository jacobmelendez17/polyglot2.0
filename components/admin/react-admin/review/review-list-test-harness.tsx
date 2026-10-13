import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import {
  buildAdminMe,
  type AdminReviewPage,
  type AdminReviewPublishRequest,
  type AdminReviewPublishResult,
  type AdminReviewRow,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { createAdminAuthProvider } from "../admin-auth-provider";
import { createAdminDataProvider } from "../admin-data-provider";
import { ReactAdminProvider } from "../react-admin-provider";
import { navigation } from "../test-support/next-navigation";
import { ReviewListScreen } from "./review-list-screen";

/**
 * Test harness for the review queue: the real screen, inside the real React
 * Admin provider stack, over a scripted API that serves queue pages by cursor
 * and records every publish command it is sent. The URL it reads comes from
 * `test-support/next-navigation.ts`, which each test file wires into
 * `next/navigation` with `vi.mock`.
 */

export const ONE_LANGUAGE = [{ id: "lang-es", name: "Spanish" }];
export const TWO_LANGUAGES = [
  { id: "lang-es", name: "Spanish" },
  { id: "lang-fr", name: "French" },
];

const NOW = Date.now();
/** An ISO time `minutes` ago — so the relative "Updated" column is deterministic. */
export const minutesAgo = (minutes: number) =>
  new Date(NOW - minutes * 60_000).toISOString();

export function reviewRow(
  n: number,
  overrides: Partial<AdminReviewRow> = {},
): AdminReviewRow {
  return {
    id: `item-${n}`,
    kind: "new",
    itemLabel: `palabra ${n}`,
    meaningLabel: `word ${n}`,
    levelNumber: 1,
    groupName: null,
    authorName: null,
    updatedAt: minutesAgo(5),
    version: 3,
    ...overrides,
  };
}

export function reviewPage(
  items: AdminReviewRow[],
  extra: Partial<AdminReviewPage> = {},
): AdminReviewPage {
  return {
    items,
    nextCursor: null,
    hasPreviousPage: false,
    previousCursor: null,
    ...extra,
  };
}

type RenderOptions = {
  /** Pages by the cursor asked for; `""` is the first page. */
  pages?: Record<string, AdminReviewPage>;
  role?: UserRole;
  languages?: { id: string; name: string }[];
  /** Fails list requests while it returns an error. */
  failList?: () => Error | null;
  /** The server's answer to a publish command. Defaults to success. */
  publish?: (
    body: AdminReviewPublishRequest,
  ) => Promise<AdminReviewPublishResult>;
};

export function renderReviewList({
  pages = { "": reviewPage([reviewRow(1), reviewRow(2)]) },
  role = "admin",
  languages = ONE_LANGUAGE,
  failList = () => null,
  publish = async (body) => ({ itemId: body.itemId }),
}: RenderOptions = {}) {
  const listRequests: string[] = [];
  const commands: AdminReviewPublishRequest[] = [];

  const request = vi.fn(
    async (
      path: string,
      _schema: unknown,
      options?: { body?: unknown },
    ): Promise<unknown> => {
      if (options?.body !== undefined) {
        const body = options.body as AdminReviewPublishRequest;
        commands.push(body);
        return publish(body);
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
        <ReviewListScreen languages={languages} />
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
