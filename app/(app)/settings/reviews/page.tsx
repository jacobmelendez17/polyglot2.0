import type { Metadata } from "next";

import { FluentModeToggle } from "@/components/settings/reviews/fluent-mode-toggle";
import { GhostModeSelect } from "@/components/settings/reviews/ghost-mode-select";
import { GrammarReviewTypeSelect } from "@/components/settings/reviews/grammar-review-type-select";
import { HintModeSelect } from "@/components/settings/reviews/hint-mode-select";
import { HintOrderSelect } from "@/components/settings/reviews/hint-order-select";
import { ReviewQueueTimingSelect } from "@/components/settings/reviews/review-queue-timing-select";
import { ReviewUiToggle } from "@/components/settings/reviews/review-ui-toggle";
import { SrsIntervalModeSelect } from "@/components/settings/reviews/srs-interval-mode-select";
import { SrsStrictnessSelect } from "@/components/settings/reviews/srs-strictness-select";
import { UndoActionSelect } from "@/components/settings/reviews/undo-action-select";
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

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Review Hints</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control the optional aid available before you answer a review, separately for grammar and vocabulary.
        </p>
        <div className="mt-4">
          <HintModeSelect contentType="grammar" initialValue={preferences.grammarHintMode} />
        </div>
        <div className="mt-2">
          <HintOrderSelect contentType="grammar" initialValue={preferences.grammarHintOrder} />
        </div>
        <div className="mt-2">
          <HintModeSelect contentType="vocabulary" initialValue={preferences.vocabularyHintMode} />
        </div>
        <div className="mt-2">
          <HintOrderSelect contentType="vocabulary" initialValue={preferences.vocabularyHintOrder} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Review UI</h2>
        <p className="mt-1 text-sm text-muted-foreground">Presentation preferences for the review session itself.</p>
        <div className="mt-4">
          <ReviewUiToggle
            field="autoplayAudio"
            label="Autoplay Audio"
            description="Automatically play pronunciation when a new review item appears. Separate from Lessons' auto-pronunciation."
            initialValue={preferences.autoplayAudio}
          />
          <ReviewUiToggle
            field="lightningMode"
            label="Lightning Mode"
            description="Automatically advance after a correct answer, without waiting for Continue. Incorrect answers still wait for you."
            initialValue={preferences.lightningMode}
          />
          <ReviewUiToggle
            field="focusMode"
            label="Focus Mode"
            description="Remove nonessential visual elements from the review session."
            initialValue={preferences.focusMode}
          />
          <ReviewUiToggle
            field="autoHighlightErrors"
            label="Auto Highlight Errors"
            description="Highlight the incorrect portion of a typed answer when Polyglot can determine it confidently."
            initialValue={preferences.autoHighlightErrors}
          />
          <ReviewUiToggle
            field="showSrsStage"
            label="Show SRS Stage"
            description="Show the SRS stage change after completing a review item."
            initialValue={preferences.showSrsStage}
          />
          <ReviewUiToggle
            field="autoExpandInfo"
            label="Auto-Expand Info"
            description="Automatically reveal the Review Hint after you submit an answer."
            initialValue={preferences.autoExpandInfo}
          />
        </div>
        <div className="mt-2">
          <UndoActionSelect initialValue={preferences.undoAction} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">SRS Strictness</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How far an incorrect review sets an item back. Correct reviews always advance normally, regardless of this setting.
        </p>
        <div className="mt-4">
          <SrsStrictnessSelect contentType="grammar" initialValue={preferences.grammarSrsStrictness} />
        </div>
        <div className="mt-2">
          <SrsStrictnessSelect contentType="vocabulary" initialValue={preferences.vocabularySrsStrictness} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">SRS Interval</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How far out a correct review is scheduled next. Changing your SRS interval only affects reviews scheduled from this point
          forward — reviews that already have a due time keep their existing due time.
        </p>
        <div className="mt-4">
          <SrsIntervalModeSelect contentType="grammar" initialValue={preferences.grammarSrsIntervalMode} />
        </div>
        <div className="mt-2">
          <SrsIntervalModeSelect contentType="vocabulary" initialValue={preferences.vocabularySrsIntervalMode} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Review Queue Timing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Applied after your SRS interval is calculated, rounding the resulting due time forward. One setting for both grammar and
          vocabulary.
        </p>
        <div className="mt-4">
          <ReviewQueueTimingSelect initialValue={preferences.reviewQueueTiming} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Fluent Mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When on, an item that reaches Fluent keeps coming back for a maintenance review every 6 months. Turning either off ends
          reviews outright for items at Fluent in that category — turning it back on picks up a maintenance schedule from when each
          item first became Fluent.
        </p>
        <div className="mt-4">
          <FluentModeToggle contentType="grammar" initialValue={preferences.grammarFluentMode} />
          <FluentModeToggle contentType="vocabulary" initialValue={preferences.vocabularyFluentMode} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Ghost Reviews</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A missed sentence in a normal review can spin up a short, separate Ghost review to reinforce it — never affecting the
          item&apos;s own normal SRS stage.
        </p>
        <div className="mt-4">
          <GhostModeSelect contentType="grammar" initialValue={preferences.grammarGhostMode} />
        </div>
        <div className="mt-2">
          <GhostModeSelect contentType="vocabulary" initialValue={preferences.vocabularyGhostMode} />
        </div>
      </div>

      <SettingsSectionPlaceholder title="More Review settings" description="Leeches." />
    </div>
  );
}
