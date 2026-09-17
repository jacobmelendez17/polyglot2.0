"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";

import { chooseLessonThemeAction } from "@/app/(focus)/lessons/actions";
import { Button } from "@/components/ui/button";
import type { LessonThemeChoice } from "@/domains/lessons";
import { cn } from "@/lib/utils";

/**
 * Spec 16's "after a theme is completed, the learner chooses another
 * available theme" — the one screen that stands between a Theme-mode learner
 * and their next lesson.
 *
 * Distinct from `LessonEmptyState` on purpose: an empty lesson means there is
 * nothing left to learn, while this means there is plenty left and the
 * learner simply has not said which part. Choosing here saves the theme and
 * reloads the route, which then builds a real batch from it.
 */
export function LessonThemePicker({ themes }: { themes: LessonThemeChoice[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleStart() {
    if (!selectedId) return;
    setError(null);
    startSaving(async () => {
      const result = await chooseLessonThemeAction({ themeId: selectedId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // The batch is built server-side from the saved theme, so the next
      // lesson comes from a fresh render rather than anything held here.
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-8 px-5 py-10 sm:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold text-balance text-foreground">
          What next?
        </h1>
        <p className="text-base text-pretty text-muted-foreground">
          You&apos;re learning one theme at a time. Pick the one you&apos;d like
          to study now.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {themes.map((theme) => {
          const isSelected = selectedId === theme.id;
          return (
            <li key={theme.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition-colors",
                  "hover:border-accent-primary/60 focus-within:ring-2 focus-within:ring-ring",
                  isSelected
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border bg-card",
                  isSaving && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="lesson-theme"
                  value={theme.id}
                  checked={isSelected}
                  disabled={isSaving}
                  onChange={() => setSelectedId(theme.id)}
                  className="sr-only"
                />
                <span className="font-medium text-foreground">
                  {theme.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {theme.remainingCount} word
                  {theme.remainingCount === 1 ? "" : "s"} left
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="cursor-pointer"
          disabled={!selectedId || isSaving}
          onClick={handleStart}
        >
          {isSaving ? "Starting…" : "Start lesson"}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/dashboard">Not now</Link>
        </Button>
      </div>
    </div>
  );
}
