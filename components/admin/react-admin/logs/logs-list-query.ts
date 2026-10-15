import { LOG_LIST_SORT } from "@/domains/admin";

import {
  buildCursorListQuery,
  type CursorListRules,
} from "../cursor-list-query";

/** `GET /api/v1/admin/logs` takes the log's filters and a cursor — nothing else (no language: the audit log is not scoped to one). */
const LOG_RULES: CursorListRules = {
  filters: [
    "actor",
    "action",
    "resourceType",
    "resourceId",
    "from",
    "to",
    "cursor",
  ],
  sort: LOG_LIST_SORT,
};

/** `getList("logs")`'s parameters as the endpoint's query string; see `buildCursorListQuery` for what is refused. */
export function buildLogsListQuery(
  params: Parameters<typeof buildCursorListQuery>[0],
): string {
  return buildCursorListQuery(params, LOG_RULES);
}
