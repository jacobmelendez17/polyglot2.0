import type { ReactNode } from "react";

import type {
  AdminUserPage,
  AdminUserRoleChangeResult,
  AdminUserRow,
} from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { renderAdminScreen } from "../test-support/render-admin-screen";

/**
 * Test harness for the Users screens: the real components, inside the real
 * React Admin provider stack (`renderAdminScreen`), over a scripted API that
 * serves account pages by search and cursor and records every command it is
 * sent. A successful role change updates the scripted account, so a refetch
 * shows what the server would.
 */

/** The signed-in Admin's own account id — the screen's `currentUserId`. */
export const ME = "00000000-0000-4000-8000-0000000000aa";

const idOf = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function userRow(
  n: number,
  overrides: Partial<AdminUserRow> = {},
): AdminUserRow {
  return {
    id: idOf(n),
    displayName: `Person ${n}`,
    username: `person_${n}`,
    role: "user",
    createdAt: "2026-03-01T12:00:00.000100Z",
    updatedAt: `2026-03-02T09:30:${String(n).padStart(2, "0")}.123456Z`,
    ...overrides,
  };
}

export const meRow = (overrides: Partial<AdminUserRow> = {}) =>
  userRow(0, {
    id: ME,
    displayName: "Admin Me",
    username: "admin_me",
    role: "admin",
    ...overrides,
  });

export function userPage(
  items: AdminUserRow[],
  extra: Partial<AdminUserPage> = {},
): AdminUserPage {
  return {
    items,
    nextCursor: null,
    hasPreviousPage: false,
    previousCursor: null,
    ...extra,
  };
}

/** The key a scripted page is stored under: the search and the cursor the request carries. */
export const pageKey = (search = "", cursor = "") => `${search}|${cursor}`;

/** One command the screen sent, as the API saw it. */
export type SentCommand = {
  path: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  /** The account named in the path. */
  userId: string;
};

type Script = {
  /** The pages the server holds, by `pageKey`. */
  pages?: Record<string, AdminUserPage>;
  /** The signed-in person's role (default Admin). */
  role?: UserRole;
  /** Fails list requests while it returns an error. */
  failList?: () => Error | null;
  /**
   * The server's answer to a command. By default it succeeds and updates the
   * scripted account; throw to refuse. Receives what was sent.
   */
  answer?: (command: SentCommand) => Promise<AdminUserRoleChangeResult>;
};

export function renderWithUsersApi(
  ui: () => ReactNode,
  {
    pages = {
      [pageKey()]: userPage([
        meRow(),
        userRow(1, { role: "writer" }),
        userRow(2),
        userRow(3, { displayName: null, username: null, role: "developer" }),
      ]),
    },
    role = "admin",
    failList = () => null,
    answer,
  }: Script = {},
) {
  // Copied, so a role change in one test never leaks into the next.
  const served: Record<string, AdminUserPage> = JSON.parse(
    JSON.stringify(pages),
  );
  const listRequests: string[] = [];
  const commands: SentCommand[] = [];
  let version = 0;

  const succeed = async (command: SentCommand) => {
    version += 1;
    const updatedAt = `2026-03-03T10:00:00.${String(version).padStart(6, "0")}Z`;
    const role = command.body.role as UserRole;
    for (const page of Object.values(served)) {
      for (const row of page.items) {
        if (row.id === command.userId) {
          row.role = role;
          row.updatedAt = updatedAt;
        }
      }
    }
    return { userId: command.userId, role, updatedAt };
  };

  const view = renderAdminScreen({
    ui,
    role,
    respond: async ({ path, options }) => {
      if (options?.body !== undefined) {
        const [, userId] = /^\/users\/([^/]+)\/role$/.exec(path) ?? [];
        const command: SentCommand = {
          path,
          method: options.method ?? "POST",
          body: options.body as Record<string, unknown>,
          userId: decodeURIComponent(userId ?? ""),
        };
        commands.push(command);
        return (answer ?? succeed)(command);
      }
      const failure = failList();
      if (failure) throw failure;
      listRequests.push(path);
      const query = new URLSearchParams(path.split("?")[1]);
      const key = pageKey(query.get("search") ?? "", query.get("cursor") ?? "");
      const found = served[key];
      if (!found) throw new Error(`no scripted users page for "${key}"`);
      // A copy, as a real response is: the screen must never share objects with
      // the scripted server, or a change the server makes in place would also
      // change the screen's own record behind its back.
      return JSON.parse(JSON.stringify(found));
    },
  });

  return { ...view, listRequests, commands, served };
}
