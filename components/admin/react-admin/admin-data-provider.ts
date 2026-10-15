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
  adminCurriculumBulkArchiveResultSchema,
  adminCurriculumBulkMoveResultSchema,
  adminCurriculumBulkPublishResultSchema,
  adminCurriculumPageSchema,
  adminDeckListSchema,
  adminDictionaryPageSchema,
  adminGroupCreateResultSchema,
  adminGroupListSchema,
  adminGroupUpdateResultSchema,
  adminImportCommandResultSchema,
  adminImportPageSchema,
  adminLevelCreateResultSchema,
  adminLevelListSchema,
  adminLevelUpdateResultSchema,
  adminLogPageSchema,
  adminOverviewSchema,
  adminReviewPageSchema,
  adminReviewPublishResultSchema,
  adminUserPageSchema,
  adminUserRoleChangeResultSchema,
  type AdminCurriculumBulkArchiveRequest,
  type AdminCurriculumBulkArchiveResult,
  type AdminCurriculumBulkMoveRequest,
  type AdminCurriculumBulkMoveResult,
  type AdminCurriculumBulkPublishRequest,
  type AdminCurriculumBulkPublishResult,
  type AdminGroupCreateRequest,
  type AdminGroupCreateResult,
  type AdminGroupUpdateRequest,
  type AdminGroupUpdateResult,
  type AdminImportCommandResult,
  type AdminImportDeleteRequest,
  type AdminLevelCreateRequest,
  type AdminLevelCreateResult,
  type AdminLevelUpdateRequest,
  type AdminLevelUpdateResult,
  type AdminReviewPublishRequest,
  type AdminReviewPublishResult,
  type AdminUserRoleChangeRequest,
  type AdminUserRoleChangeResult,
} from "@/domains/admin";

import { requestAdminApi } from "./admin-api-client";
import { AdminApiError } from "./admin-api-error";
import { buildCurriculumListQuery } from "./curriculum/curriculum-list-query";
import { buildDecksListQuery } from "./decks/decks-list-query";
import { buildDictionaryListQuery } from "./dictionary/dictionary-list-query";
import { buildGroupsListQuery } from "./groups/groups-list-query";
import { buildImportsListQuery } from "./imports/imports-list-query";
import { buildLevelsListQuery } from "./levels/levels-list-query";
import { buildLogsListQuery } from "./logs/logs-list-query";
import { buildReviewListQuery } from "./review/review-list-query";
import { buildUsersListQuery } from "./users/users-list-query";

type AdminRequest = typeof requestAdminApi;

/**
 * The provider's own commands, beyond React Admin's CRUD vocabulary. A
 * command is an explicit, named operation with its own endpoint and guard —
 * never a generic `update` aimed at a table (spec 26 §3 "Whitelist operations
 * by resource and action").
 */
export type AdminDataProvider = DataProvider & {
  /** Publishes one queued item. `expectedVersion` is the version the Admin last saw; a stale one is a conflict. */
  publishReviewItem: (
    input: AdminReviewPublishRequest,
  ) => Promise<AdminReviewPublishResult>;
  /**
   * Publishes several **Pending** items together (Admin only), all or none: one
   * that is no longer Pending refuses the whole batch with a conflict. At most
   * `CURRICULUM_BULK_ITEM_LIMIT` distinct items, all in `languageId`.
   */
  bulkPublishCurriculum: (
    input: AdminCurriculumBulkPublishRequest,
  ) => Promise<AdminCurriculumBulkPublishResult>;
  /**
   * Archives several items together (Admin only), all or none. One already
   * archived is left alone and reported back. There is no bulk delete.
   */
  bulkArchiveCurriculum: (
    input: AdminCurriculumBulkArchiveRequest,
  ) => Promise<AdminCurriculumBulkArchiveResult>;
  /**
   * Moves several items to a level and/or a group of the same language (Admin
   * only), all or none. Moved items join the end of the new level's order; one
   * already where it is asked to go is left alone and reported back.
   */
  bulkMoveCurriculum: (
    input: AdminCurriculumBulkMoveRequest,
  ) => Promise<AdminCurriculumBulkMoveResult>;
  /**
   * Takes an import out of the normal history (Admin only). History only: the
   * curriculum the import made or changed is untouched, and it can be restored.
   * Archiving an archived import is a no-op, so there is no idempotency key.
   */
  archiveImport: (importId: string) => Promise<AdminImportCommandResult>;
  /** Returns an archived import to the normal history (Admin only). Restoring a restored one is a no-op. */
  restoreImport: (importId: string) => Promise<AdminImportCommandResult>;
  /**
   * Permanently deletes an *archived* import's history (Admin only): its record
   * and stored rows, never the curriculum it made. The body carries the
   * confirmation the person typed; the endpoint checks it again.
   */
  deleteImport: (
    importId: string,
    input: AdminImportDeleteRequest,
  ) => Promise<AdminImportCommandResult>;
  /** Adds a level (Admin only). A level number is used once per language. */
  createLevel: (
    input: AdminLevelCreateRequest,
  ) => Promise<AdminLevelCreateResult>;
  /**
   * Changes one level's name, status, or CEFR band (Admin only). A field left
   * out is left alone; `name` and `cefrLevel` sent as `null` are cleared.
   */
  updateLevel: (
    levelId: string,
    input: AdminLevelUpdateRequest,
  ) => Promise<AdminLevelUpdateResult>;
  /**
   * Adds a group to the end of a level (Admin only). The server computes its
   * position; there is no position to send.
   */
  createGroup: (
    input: AdminGroupCreateRequest,
  ) => Promise<AdminGroupCreateResult>;
  /**
   * Changes one group's name or status (Admin only). A field left out is left
   * alone. Position is not a field: ordering is the reorder tool's.
   */
  updateGroup: (
    groupId: string,
    input: AdminGroupUpdateRequest,
  ) => Promise<AdminGroupUpdateResult>;
  /**
   * Sets one account's role (Admin only). `expectedUpdatedAt` is the version
   * token the Admin last saw for that account — a changed account is a conflict,
   * not an overwrite. The body names no actor and no other account: who asks is
   * the session, who is changed is `userId`.
   */
  changeUserRole: (
    userId: string,
    input: AdminUserRoleChangeRequest,
  ) => Promise<AdminUserRoleChangeResult>;
};

/** A cursor page, as React Admin's *partial pagination*: no total, and the server's cursors passed through untouched. */
function toListResult<Row>(page: {
  items: Row[];
  nextCursor: string | null;
  hasPreviousPage: boolean;
  previousCursor: string | null;
}): GetListResult {
  return {
    data: page.items as GetListResult["data"],
    // There is no total, and none is invented — an exact count over an
    // unbounded list is a full scan.
    pageInfo: {
      hasNextPage: page.nextCursor !== null,
      hasPreviousPage: page.hasPreviousPage,
    },
    // The server's cursors are authoritative; a list navigates by handing one
    // of these back, never by computing one.
    meta: {
      nextCursor: page.nextCursor,
      previousCursor: page.previousCursor,
    },
  };
}

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
}: { request?: AdminRequest } = {}): AdminDataProvider {
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
        return toListResult(
          await request(
            `/curriculum?${buildCurriculumListQuery(params)}`,
            adminCurriculumPageSchema,
            { signal: params.signal },
          ),
        );
      }
      if (resource === "review") {
        return toListResult(
          await request(
            `/review?${buildReviewListQuery(params)}`,
            adminReviewPageSchema,
            { signal: params.signal },
          ),
        );
      }
      if (resource === "levels") {
        const list = await request(
          `/levels?${buildLevelsListQuery(params)}`,
          adminLevelListSchema,
          { signal: params.signal },
        );
        // One bounded response, not a page: its length *is* the total, and
        // there is no cursor to hand on. `truncated` rides along in `meta`.
        return {
          data: list.items as GetListResult["data"],
          total: list.items.length,
          meta: { truncated: list.truncated },
        };
      }
      if (resource === "groups") {
        const list = await request(
          `/groups?${buildGroupsListQuery(params)}`,
          adminGroupListSchema,
          { signal: params.signal },
        );
        // A level's groups are one bounded response, like a language's levels.
        return {
          data: list.items as GetListResult["data"],
          total: list.items.length,
          meta: { truncated: list.truncated },
        };
      }
      if (resource === "dictionary") {
        const page = await request(
          `/dictionary?${buildDictionaryListQuery(params)}`,
          adminDictionaryPageSchema,
          { signal: params.signal },
        );
        // An offset-paginated queue with a real total (the repository counts it).
        // The status counts and the region the regional column means ride along
        // in `meta`, where the screen's header reads them.
        return {
          data: page.items as GetListResult["data"],
          total: page.total,
          meta: {
            counts: page.counts,
            regionCode: page.regionCode,
            regionCodes: page.regionCodes,
          },
        };
      }
      if (resource === "decks") {
        const list = await request(
          `/decks?${buildDecksListQuery(params)}`,
          adminDeckListSchema,
          { signal: params.signal },
        );
        // A language's official decks are one bounded response, like its levels.
        return {
          data: list.items as GetListResult["data"],
          total: list.items.length,
          meta: { truncated: list.truncated },
        };
      }
      if (resource === "imports") {
        return toListResult(
          await request(
            `/imports?${buildImportsListQuery(params)}`,
            adminImportPageSchema,
            { signal: params.signal },
          ),
        );
      }
      if (resource === "logs") {
        return toListResult(
          await request(
            `/logs?${buildLogsListQuery(params)}`,
            adminLogPageSchema,
            { signal: params.signal },
          ),
        );
      }
      if (resource === "users") {
        return toListResult(
          await request(
            `/users?${buildUsersListQuery(params)}`,
            adminUserPageSchema,
            { signal: params.signal },
          ),
        );
      }
      return unsupported(resource, "getList");
    },

    publishReviewItem(input) {
      // The body is exactly the command: no actor, no role. Who is asking is
      // the session's business, never the client's.
      return request("/review/publish", adminReviewPublishResultSchema, {
        body: input,
      });
    },

    bulkPublishCurriculum(input) {
      // The body is exactly the command: the language, the items, the key — no actor.
      return request(
        "/curriculum/bulk-publish",
        adminCurriculumBulkPublishResultSchema,
        { body: input },
      );
    },

    bulkArchiveCurriculum(input) {
      return request(
        "/curriculum/bulk-archive",
        adminCurriculumBulkArchiveResultSchema,
        { body: input },
      );
    },

    bulkMoveCurriculum(input) {
      return request(
        "/curriculum/bulk-move",
        adminCurriculumBulkMoveResultSchema,
        { body: input },
      );
    },

    archiveImport(importId) {
      // The import is the path and the body is empty: who is asking is the session.
      return request(
        `/imports/${encodeURIComponent(importId)}/archive`,
        adminImportCommandResultSchema,
        { body: {} },
      );
    },

    restoreImport(importId) {
      return request(
        `/imports/${encodeURIComponent(importId)}/restore`,
        adminImportCommandResultSchema,
        { body: {} },
      );
    },

    deleteImport(importId, input) {
      return request(
        `/imports/${encodeURIComponent(importId)}/delete`,
        adminImportCommandResultSchema,
        { body: input },
      );
    },

    createLevel(input) {
      // The body is exactly the command: no actor, no role.
      return request("/levels", adminLevelCreateResultSchema, { body: input });
    },

    updateLevel(levelId, input) {
      return request(
        `/levels/${encodeURIComponent(levelId)}`,
        adminLevelUpdateResultSchema,
        { body: input, method: "PATCH" },
      );
    },

    createGroup(input) {
      // The body is exactly the command: no actor, no role, no position.
      return request("/groups", adminGroupCreateResultSchema, { body: input });
    },

    updateGroup(groupId, input) {
      return request(
        `/groups/${encodeURIComponent(groupId)}`,
        adminGroupUpdateResultSchema,
        { body: input, method: "PATCH" },
      );
    },

    changeUserRole(userId, input) {
      // The body is exactly the command: no actor, no role claim, no target.
      return request(
        `/users/${encodeURIComponent(userId)}/role`,
        adminUserRoleChangeResultSchema,
        { body: input, method: "PATCH" },
      );
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
