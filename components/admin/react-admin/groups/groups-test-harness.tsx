import type { ReactNode } from "react";

import type {
  AdminGroupCreateResult,
  AdminGroupList,
  AdminGroupRow,
  AdminGroupUpdateResult,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { renderAdminScreen } from "../test-support/render-admin-screen";

/**
 * Test harness for the Groups screens: the real components, inside the real
 * React Admin provider stack (`renderAdminScreen`), over a scripted API that
 * serves groups per level and records every command it is sent.
 */

export const ONE_LANGUAGE = [{ id: "lang-es", name: "Spanish" }];
export const TWO_LANGUAGES = [
  { id: "lang-es", name: "Spanish" },
  { id: "lang-fr", name: "French" },
];

/** The levels the page would supply for each language — in level order. */
export const LEVELS_BY_LANGUAGE: Record<
  string,
  { id: string; levelNumber: number }[]
> = {
  "lang-es": [
    { id: "level-1", levelNumber: 1 },
    { id: "level-2", levelNumber: 2 },
  ],
  "lang-fr": [{ id: "level-7", levelNumber: 7 }],
  "lang-empty": [],
};

export function groupRow(
  n: number,
  overrides: Partial<AdminGroupRow> = {},
): AdminGroupRow {
  return {
    id: `group-${n}`,
    levelId: "level-1",
    name: `Group ${n}`,
    status: "draft",
    position: n,
    ...overrides,
  };
}

export function groupList(
  items: AdminGroupRow[],
  truncated = false,
): AdminGroupList {
  return { items, truncated };
}

/** One command the screen sent, as the API saw it. */
export type SentCommand = {
  path: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
};

type Script = {
  /** The groups the server holds, by level id. */
  groups?: Record<string, AdminGroupList>;
  role?: UserRole;
  /** Fails list requests while it returns an error. */
  failList?: () => Error | null;
  /**
   * The server's answer to a command. Defaults to success; throw to refuse.
   * Receives what was sent, including the idempotency key.
   */
  answer?: (
    command: SentCommand,
  ) => Promise<AdminGroupCreateResult | AdminGroupUpdateResult>;
};

export function renderWithGroupsApi(
  ui: () => ReactNode,
  {
    groups = {
      "level-1": groupList([groupRow(1), groupRow(2)]),
      "level-2": groupList([
        groupRow(1, { id: "l2-group-1", levelId: "level-2" }),
      ]),
      "level-7": groupList([]),
    },
    role = "admin",
    failList = () => null,
    answer = async (command) => ({
      groupId:
        command.method === "PATCH"
          ? command.path.split("/").at(-1)!
          : "group-new",
    }),
  }: Script = {},
) {
  const listRequests: string[] = [];
  const commands: SentCommand[] = [];

  const view = renderAdminScreen({
    ui,
    role,
    respond: async ({ path, options }) => {
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
      const level = new URLSearchParams(path.split("?")[1]).get("level");
      const found = groups[level ?? ""];
      if (!found) throw new Error(`no scripted groups for level "${level}"`);
      return found;
    },
  });

  return { ...view, listRequests, commands };
}
