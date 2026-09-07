import { Suspense } from "react";
import type { Metadata } from "next";
import { LessonEmptyState } from "@/components/lessons/lesson-empty-state";
import { LessonSessionView } from "@/components/lessons/lesson-session-view";
import { LessonStudySkeleton } from "@/components/lessons/lesson-study-skeleton";
import { getLanguageById } from "@/domains/curriculum/server";
import { startLesson } from "@/domains/lessons/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Lesson — Polyglot",
};

export default function LessonsPage() {
  return (
    <Suspense fallback={<LessonStudySkeleton />}>
      <LessonPageContent />
    </Suspense>
  );
}

async function LessonPageContent() {
  // `requireUser()` resolves the internal Polyglot user record (provisioning
  // it on first sight) and throws if unauthenticated — proxy.ts already
  // protects /lessons, so the throw is a backstop rather than a flow.
  const user = await requireUser();

  const language = await getLanguageById(user.activeLanguageId);
  if (!language) {
    // A user row cannot exist without a valid active language (a NOT NULL
    // foreign key), so this is a data-integrity failure rather than a flow.
    return <LessonEmptyState />;
  }

  const result = await startLesson({
    userId: user.id,
    languageId: language.id,
    languageCode: language.code,
  });

  if (result.kind === "empty") {
    return <LessonEmptyState />;
  }

  return <LessonSessionView initial={result} />;
}
