"use client";

import { Check } from "lucide-react";

import { CURRICULUM_MODE_OPTIONS } from "@/components/curriculum/curriculum-mode-options";
import type { LessonThemeChoice } from "@/domains/lessons";
import type { CurriculumMode } from "@/domains/users";
import { cn } from "@/lib/utils";

type CurriculumModePickerProps = {
  selectedMode: CurriculumMode | null;
  onSelectMode: (mode: CurriculumMode) => void;
  /** Themes the learner may study right now. Empty is a real state — a level with nothing published yet — and the theme step simply doesn't appear. */
  themes: LessonThemeChoice[];
  selectedThemeId: string | null;
  onSelectTheme: (themeId: string) => void;
  disabled?: boolean;
};

/**
 * The Learning Queue mode (and, for Choose Group as You Go, the group)
 * chooser — spec 16's curriculum decider, renamed/consolidated by spec 20,
 * as pure presentation. Owns no persistence and no routing, so the
 * onboarding screen, the Sandbox preview, and Settings' `/settings/lessons`
 * all render the same control.
 *
 * A radio group rather than a set of buttons: these are three mutually
 * exclusive answers to one question, which is what makes arrow-key
 * navigation and a single tab stop the correct keyboard behaviour rather
 * than a nicety.
 */
export function CurriculumModePicker({
  selectedMode,
  onSelectMode,
  themes,
  selectedThemeId,
  onSelectTheme,
  disabled = false,
}: CurriculumModePickerProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <legend className="sr-only">How should new words be introduced?</legend>
        {CURRICULUM_MODE_OPTIONS.map((option) => {
          const isSelected = selectedMode === option.mode;
          return (
            <label
              key={option.mode}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                "hover:border-accent-primary/60 focus-within:ring-2 focus-within:ring-ring",
                isSelected ? "border-accent-primary bg-accent-primary/10" : "border-border bg-card",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="curriculum-mode"
                value={option.mode}
                checked={isSelected}
                onChange={() => onSelectMode(option.mode)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  isSelected ? "border-accent-primary bg-accent-primary text-accent-foreground" : "border-border",
                )}
              >
                {isSelected ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-medium text-foreground">{option.label}</span>
                <span className="text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {selectedMode === "choose_group" && themes.length > 0 ? (
        <fieldset disabled={disabled} className="flex flex-col gap-3">
          <legend className="mb-1 font-medium text-foreground">Which theme first?</legend>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => {
              const isSelected = selectedThemeId === theme.id;
              return (
                <label
                  key={theme.id}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors",
                    "hover:border-accent-primary/60 focus-within:ring-2 focus-within:ring-ring",
                    isSelected ? "border-accent-primary bg-accent-primary/10 text-foreground" : "border-border bg-card text-muted-foreground",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="curriculum-theme"
                    value={theme.id}
                    checked={isSelected}
                    onChange={() => onSelectTheme(theme.id)}
                    className="sr-only"
                  />
                  {theme.name}
                  <span className="ml-2 text-xs text-muted-foreground">{theme.remainingCount} left</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {selectedMode === "choose_group" && themes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You&apos;ll pick your first theme when your first lesson is ready.
        </p>
      ) : null}
    </div>
  );
}
