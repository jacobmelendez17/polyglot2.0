import type { Metadata } from "next";

import { PracticeHero } from "@/components/practice/practice-hero";
import { PracticeHub } from "@/components/practice/practice-hub";
import { parsePracticeSkillFilter } from "@/domains/practice";
import { getPracticeHub } from "@/domains/practice/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Practice — Polyglot",
};

type PracticePageProps = {
  searchParams: Promise<{ skill?: string }>;
};

/**
 * The Practice hub. The skill filter is URL state, so the server renders the
 * chosen view and the filter controls only navigate. Browsing this page is a
 * pure read: it cannot change SRS state or any curriculum progress.
 */
export default async function PracticePage({
  searchParams,
}: PracticePageProps) {
  const { skill } = await searchParams;
  const skillFilter = parsePracticeSkillFilter(skill);

  // proxy.ts protects /practice, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request
  // never reaches this far in practice.
  const user = await requireUser();
  const view = await getPracticeHub({
    userId: user.id,
    languageId: user.activeLanguageId,
  });

  return (
    <>
      <PracticeHero />
      <PracticeHub view={view} skillFilter={skillFilter} />
    </>
  );
}
