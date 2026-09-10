import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import { ReviewQueueActions } from "@/components/admin/curriculum/review-queue-actions";
import { canManageCurriculum, canPublishCurriculum } from "@/domains/admin";
import { getLanguages, getReviewQueue } from "@/domains/curriculum/server";
import { getUsersByIds, requireUser } from "@/domains/users/server";
import { formatRelativeTime } from "@/lib/time/format-relative-time";

export const metadata: Metadata = {
  title: "Review — Polyglot Admin",
};

/**
 * Everything waiting for Admin verification (spec 17).
 *
 * A writer can author freely, and none of it reaches a learner on its own —
 * new items stay `pending` and edits to published items stay in a draft.
 * Without this page, "Admin verifies everything" would mean "Admin remembers
 * to go looking", so this is the one place both kinds appear together.
 *
 * Visible to anyone who can author, so a writer can see their own work
 * queued; publishing from here requires `canPublishCurriculum`, which is
 * re-checked in the action itself and never inferred from what rendered.
 */
export default async function CurriculumReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string }>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const params = await searchParams;
  const languages = await getLanguages();
  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Review" description="Everything waiting to be verified." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const languageId = languages.some((language) => language.id === params.language) ? params.language! : languages[0]!.id;
  const entries = await getReviewQueue(languageId);
  const authors = await getUsersByIds([...new Set(entries.map((entry) => entry.authorUserId).filter((id): id is string => id !== null))]);
  const authorNameById = new Map(authors.map((author) => [author.id, author.displayName ?? "Unknown"]));
  const canPublish = canPublishCurriculum(user);

  return (
    <div>
      <AdminPageHeader
        title="Review"
        description="New items and edits to published items, waiting for an Admin to publish them."
      />

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting. Every item is either published or archived.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.learningItemId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <div className="flex min-w-48 flex-1 flex-col">
                <Link href={`/admin/curriculum/items/${entry.learningItemId}`} className="font-medium text-foreground hover:underline">
                  {entry.itemLabel}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {entry.meaningLabel} · Level {entry.levelNumber}
                  {entry.groupName ? ` · ${entry.groupName}` : ""}
                </span>
              </div>

              <CurriculumStatusBadge status={entry.kind === "new" ? "pending" : "draft"} />

              <span className="text-sm text-muted-foreground">
                {entry.kind === "new" ? "New item" : "Edit to a published item"}
                {entry.authorUserId ? ` · ${authorNameById.get(entry.authorUserId) ?? "Unknown"}` : ""} ·{" "}
                {formatRelativeTime(entry.updatedAt, new Date())}
              </span>

              {canPublish ? <ReviewQueueActions learningItemId={entry.learningItemId} expectedVersion={entry.version} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
