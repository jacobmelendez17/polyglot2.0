import {
  LOG_LIST_PAGE_SIZE,
  LOG_LIST_SORT,
  type AdminLogRow,
} from "@/domains/admin";

import { useCursorList } from "../use-cursor-list";
import {
  isLogRefinement,
  logListCodec,
  type LogListFilters,
} from "./logs-list-params";

/**
 * The audit log's controller: the shared cursor list (`useCursorList`) with the
 * log's own URL — `?actor=&action=&resourceType=&resourceId=&from=&to=&cursor=`.
 * Typing in the id and resource-type boxes replaces the history entry rather
 * than stacking one per pause.
 */
export function useLogsList() {
  return useCursorList<LogListFilters, AdminLogRow>({
    resource: "logs",
    title: "Audit log",
    sort: LOG_LIST_SORT,
    pageSize: LOG_LIST_PAGE_SIZE,
    codec: logListCodec,
    isRefinement: isLogRefinement,
  });
}
