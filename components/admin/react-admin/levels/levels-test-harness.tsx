import type { ReactNode } from "react";

import type {
  AdminLevelCreateResult,
  AdminLevelList,
  AdminLevelRow,
  AdminLevelUpdateResult,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { renderAdminScreen } from "../test-support/render-admin-screen";

/**
 * Test harness for the Levels screens: the real components, inside the real
 * React Admin provider stack (`renderAdminScreen`), over a scripted API that
 * serves levels per language and records every command it is sent.
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
      const language = new URLSearchParams(path.split("?")[1]).get("language");
      const found = levels[language ?? ""];
      if (!found) throw new Error(`no scripted levels for "${language}"`);
      return found;
    },
  });

  return { ...view, listRequests, commands };
}
