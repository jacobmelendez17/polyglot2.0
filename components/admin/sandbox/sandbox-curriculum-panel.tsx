"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { setSandboxCurriculumModeAction } from "@/app/(admin)/admin/sandbox/actions";
import { CurriculumModePicker } from "@/components/curriculum/curriculum-mode-picker";
import { getCurriculumModeOption } from "@/components/curriculum/curriculum-mode-options";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SandboxCurriculumPreview } from "@/domains/sandbox";
import type { CurriculumMode } from "@/domains/users";

type SandboxCurriculumPanelProps = {
  languageId: string;
  preview: SandboxCurriculumPreview;
};

/**
 * Spec 16's Sandbox section: replay the curriculum-choice screen, switch the
 * persona's mode, and see what the persona's next lesson would actually be
 * under each mode.
 *
 * The preview comes from `domains/lessons`' real `selectLessonBatch` running
 * over the persona's real eligible curriculum (computed server-side in
 * `domains/sandbox`), and the mode chooser is the same
 * `CurriculumModePicker` the learner sees — the spec's "use the same
 * production components and lesson-selection logic rather than creating a
 * separate sandbox implementation", taken literally in both halves.
 *
 * Every write here targets the persona. The admin's own preference is never
 * touched, and the replay link persists nothing at all.
 */
export function SandboxCurriculumPanel({ languageId, preview }: SandboxCurriculumPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<CurriculumMode | null>(preview.currentMode);
  const [themeId, setThemeId] = useState<string | null>(preview.selectedThemeId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    if (!mode) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setSandboxCurriculumModeAction({
        languageId,
        curriculumMode: mode,
        selectedVocabularyGroupId: mode === "choose_group" ? themeId : null,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Curriculum decider</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          Sets how the sandbox persona&apos;s next lesson is chosen. Your own preference is never changed.
        </p>

        <CurriculumModePicker
          selectedMode={mode}
          onSelectMode={(next) => {
            setMode(next);
            if (next !== "choose_group") setThemeId(null);
          }}
          themes={preview.themes}
          selectedThemeId={themeId}
          onSelectTheme={setThemeId}
          disabled={isPending}
        />

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!mode || isPending} onClick={handleApply}>
            Apply to persona
          </Button>
          <Button asChild variant="outline">
            {/* A replay writes nothing — the route re-checks Admin access itself. */}
            <Link href="/onboarding/curriculum?replay=1">Replay choice screen</Link>
          </Button>
          {saved ? (
            <span className="flex items-center gap-1 text-sm text-state-success">
              <Check className="h-4 w-4" aria-hidden="true" />
              Applied
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-foreground">The persona&apos;s next lesson would be</h3>
          {preview.batchesByMode.map(({ mode: previewMode, items }) => (
            <div key={previewMode} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">{getCurriculumModeOption(previewMode).label}</p>
              {items.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {previewMode === "choose_group" && preview.themes.length === 0
                    ? "No groups with anything left to teach."
                    : "Nothing eligible — publish curriculum or reset the persona."}
                </p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                      title={item.themeName ?? "Grammar"}
                    >
                      <span className="text-foreground">{item.label}</span>
                      <span className="ml-2">{item.type === "grammar" ? "grammar" : item.themeName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
