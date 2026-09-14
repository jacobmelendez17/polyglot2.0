import { Suspense } from "react";
import type { Metadata } from "next";
import { LessonEmptyState } from "@/components/lessons/lesson-empty-state";
import { LessonSessionView } from "@/components/lessons/lesson-session-view";
import { LessonThemePicker } from "@/components/lessons/lesson-theme-picker";
import { LessonStudySkeleton } from "@/components/lessons/lesson-study-skeleton";
import { LessonVacationWarning } from "@/components/lessons/lesson-vacation-warning";
import { getLanguageById } from "@/domains/curriculum/server";
import { startLesson } from "@/domains/lessons/server";
import { isVacationModeActive, requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Lesson — Polyglot",
};

type LessonsPageProps = {
  searchParams: Promise<{ vacationConfirmed?: string }>;
};

export default function LessonsPage({ searchParams }: LessonsPageProps) {
  return (
    <Suspense fallback={<LessonStudySkeleton />}>
      <LessonPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LessonPageContent({ searchParams }: LessonsPageProps) {
  // `requireUser()` resolves the internal Polyglot user record (provisioning
  // it on first sight) and throws if unauthenticated — proxy.ts already
  // protects /lessons, so the throw is a backstop rather than a flow.
  const user = await requireUser();
  const { vacationConfirmed } = await searchParams;

  // Spec 20 "Lessons During Vacation": lessons remain available, but only
  // after an explicit confirmation — gated server-side so it can't be
  // skipped by anything other than actually clicking through it.
  if (vacationConfirmed !== "1" && (await isVacationModeActive(user.id))) {
    return <LessonVacationWarning />;
  }

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

  // Theme mode with no usable theme (spec 16) — plenty left to learn, but
  // the learner has not said which part yet.
  if (result.kind === "choose-theme") {
    return <LessonThemePicker themes={result.themes} />;
  }

  return <LessonSessionView initial={result} />;
}
