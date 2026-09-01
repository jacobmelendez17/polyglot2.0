import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { LessonEmptyState } from "@/components/lessons/lesson-empty-state";
import { LessonSessionView } from "@/components/lessons/lesson-session-view";
import { LessonStudySkeleton } from "@/components/lessons/lesson-study-skeleton";
import { FIXTURE_LANGUAGE_ID } from "@/domains/curriculum";
import { startLesson } from "@/domains/lessons/server";

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
  const { userId } = await auth();
  if (!userId) {
    // proxy.ts protects /lessons, so this is unreachable in practice.
    redirect("/sign-in");
  }

  const result = await startLesson({ userId, languageId: FIXTURE_LANGUAGE_ID });

  if (result.kind === "empty") {
    return <LessonEmptyState />;
  }

  return <LessonSessionView initial={result} />;
}
