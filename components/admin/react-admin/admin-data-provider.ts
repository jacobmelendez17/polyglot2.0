import type {
  DataProvider,
  DeleteManyResult,
  DeleteResult,
  GetListResult,
  GetManyReferenceResult,
  GetManyResult,
  GetOneResult,
  UpdateManyResult,
  UpdateResult,
} from "react-admin";

import {
  ADMIN_OVERVIEW_RECORD_ID,
  adminCurriculumPageSchema,
  adminOverviewSchema,
} from "@/domains/admin";

import { requestAdminApi } from "./admin-api-client";
import { AdminApiError } from "./admin-api-error";
import { buildCurriculumListQuery } from "./curriculum/curriculum-list-query";

type AdminRequest = typeof requestAdminApi;

/**
 * Polyglot's own React Admin `dataProvider` (spec 26 §3/§5) — deliberately
 * not an off-the-shelf REST provider, because the server is not a generic
 * CRUD API. Each resource below is a *named, whitelisted* operation backed by
 * one explicit `/api/v1/admin/*` endpoint.
 *
 * Anything not listed is rejected with a typed `UNSUPPORTED_OPERATION`
 * error — never guessed at, never forwarded, never silently accepted. In
 * particular React Admin's generic `update`, `updateMany`, `delete`, and
 * `deleteMany` have no mapping to `users`, `learning_items`, or any table;
 * releases, archives, moves, and role changes will each be an explicit
 * command in the unit that introduces them.
 *
 * Methods are typed with `any` record generics (React Admin's own default)
 * because a resource's record shape is only known per resource, here, at
 * runtime — which is exactly what the Zod schema it is parsed with proves.
 */
export function createAdminDataProvider({
  request = requestAdminApi,
}: { request?: AdminRequest } = {}): DataProvider {
  function unsupported(resource: string, operation: string): never {
    // A 405, not a 401/403: the *operation* isn't allowed, which is not an
    // authentication problem and must not trip `authProvider.checkError`'s
    // access-denied path.
    throw new AdminApiError(
      "UNSUPPORTED_OPERATION",
      405,
      `${operation} on "${resource}"`,
    );
  }

  return {
    async getOne(resource, params): Promise<GetOneResult> {
      if (resource === "overview") {
        // A singleton: there is exactly one overview, "the current one".
        if (String(params.id) !== ADMIN_OVERVIEW_RECORD_ID) {
          return unsupported(resource, "getOne");
        }
        const data = await request("/overview", adminOverviewSchema, {
          signal: params.signal,
        });
        return { data };
      }
      return unsupported(resource, "getOne");
    },

    async getList(resource, params): Promise<GetListResult> {
      if (resource === "curriculum") {
        const page = await request(
          `/curriculum?${buildCurriculumListQuery(params)}`,
          adminCurriculumPageSchema,
          { signal: params.signal },
        );
        return {
          data: page.items,
          // Partial pagination: there is no total, and none is invented —
          // an exact count over the curriculum is a full scan.
          pageInfo: {
            hasNextPage: page.nextCursor !== null,
            hasPreviousPage: page.hasPreviousPage,
          },
          // The server's cursors are authoritative; the list navigates by
          // handing one of these back, never by computing one.
          meta: {
            nextCursor: page.nextCursor,
            previousCursor: page.previousCursor,
          },
        };
      }
      return unsupported(resource, "getList");
    },
    async getMany(resource): Promise<GetManyResult> {
      return unsupported(resource, "getMany");
    },
    async getManyReference(resource): Promise<GetManyReferenceResult> {
      return unsupported(resource, "getManyReference");
    },
    async create(resource) {
      return unsupported(resource, "create");
    },
    async update(resource): Promise<UpdateResult> {
      return unsupported(resource, "update");
    },
    async updateMany(resource): Promise<UpdateManyResult> {
      return unsupported(resource, "updateMany");
    },
    async delete(resource): Promise<DeleteResult> {
      return unsupported(resource, "delete");
    },
    async deleteMany(resource): Promise<DeleteManyResult> {
      return unsupported(resource, "deleteMany");
    },
  };
}
