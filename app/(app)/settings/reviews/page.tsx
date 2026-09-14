import type { Metadata } from "next";

import { GrammarReviewTypeSelect } from "@/components/settings/reviews/grammar-review-type-select";
import { VocabularyReviewTypeSelect } from "@/components/settings/reviews/vocabulary-review-type-select";
import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";
import { getReviewPreferences } from "@/domains/srs/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Review Settings — Polyglot",
};

export default async function ReviewSettingsPage() {
  const user = await requireUser();
  const preferences = await getReviewPreferences(user.id, user.activeLanguageId);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Review Types</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how grammar and vocabulary reviews are presented. Changes affect your next review session, not one already open.
        </p>
        <div className="mt-4">
          <GrammarReviewTypeSelect initialValue={preferences.grammarReviewType} />
        </div>
        <div className="mt-2">
          <VocabularyReviewTypeSelect initialValue={preferences.vocabularyReviewType} />
        </div>
      </div>

      <SettingsSectionPlaceholder
        title="More Review settings"
        description="Ghost Reviews, Leeches, hints, Review UI, SRS Strictness, SRS Interval, Review Queue Timing, and Fluent Mode."
      />
    </div>
  );
}
