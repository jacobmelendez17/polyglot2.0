import {
  adminReviewListQuerySchema,
  adminReviewPageSchema,
  buildAdminReviewPage,
  canManageCurriculum,
} from "@/domains/admin";
import { getReviewQueuePage } from "@/domains/curriculum/server";
import { getUsersByIds } from "@/domains/users/server";

import { handleAdminGet } from "../_lib/admin-route";
import { assertLanguageExists } from "../_lib/language";

/**
 * `GET /api/v1/admin/review` (spec 26 §5) — one cursor-paginated page of
 * everything waiting for an Admin: new items and open edits to published ones.
 *
 * Admin **and writer** (`canManageCurriculum`): a writer sees their own work
 * queued. Publishing from the queue is a different command with a stricter
 * guard (`POST /review/publish`).
 *
 * The read model is the existing `getReviewQueue`, in the order it always
 * had; this only bounds it (a page at a time, never the whole queue) and
 * resolves authors — a display name, never an id, email, or Clerk identity.
 * As with the curriculum list, the query string is strict and the language
 * must exist.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.review.list",
    authorize: canManageCurriculum,
    load: async (_user, req) => {
      const query = adminReviewListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );

      await assertLanguageExists(query.language);

      const page = await getReviewQueuePage({
        languageId: query.language,
        limit: query.limit,
        cursor: query.cursor,
      });

      // One batched lookup for the page's distinct authors (no N+1), skipped
      // entirely when the page holds only new items.
      const authorIds = [
        ...new Set(
          page.entries
            .map((entry) => entry.authorUserId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const authors = await getUsersByIds(authorIds);
      const authorNameById = new Map(
        authors.map((author) => [author.id, author.displayName ?? "Unknown"]),
      );

      return adminReviewPageSchema.parse(
        buildAdminReviewPage(page, authorNameById),
      );
    },
  });
}
