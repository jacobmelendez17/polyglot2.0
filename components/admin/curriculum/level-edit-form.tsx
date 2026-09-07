"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { updateLevelAction } from "@/app/(admin)/admin/curriculum/actions";
import { CURRICULUM_VALIDATION_CONFIG } from "@/domains/curriculum";
import type { CurriculumStatus, LevelValidationResult, LevelValidationTargets } from "@/domains/curriculum";

import { LevelValidationSummary } from "./level-validation-summary";

type LevelEditFormProps = {
  levelId: string;
  name: string | null;
  status: CurriculumStatus;
  targets: LevelValidationTargets;
  validation: LevelValidationResult;
};

type TargetKey = "vocabularyItems" | "vocabularyGroups" | "grammarItems";

type TargetField = {
  key: TargetKey;
  label: string;
  defaultValue: number;
};

/**
 * The three curriculum dimensions a level can size independently. Blank means
 * "use the configured default"; `0` means this level requires none of that
 * content — a deliberately grammar-free introductory level is a curriculum
 * decision, not a reason to bypass the publish gate.
 */
const TARGET_FIELDS: TargetField[] = [
  { key: "vocabularyItems", label: "Vocabulary items", defaultValue: CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel },
  { key: "vocabularyGroups", label: "Vocabulary groups", defaultValue: CURRICULUM_VALIDATION_CONFIG.vocabularyGroupsPerLevel },
  { key: "grammarItems", label: "Grammar items", defaultValue: CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel },
];

/** Blank input -> `null` (restore the default); any other value -> the parsed number. */
function parseTargetInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const STATUS_OPTIONS: CurriculumStatus[] = ["draft", "pending", "published", "archived"];

/**
 * Spec 11 rewrite's "Levels Management" edit surface. A plain status
 * `Select` + Save (not a dedicated Publish dialog like learning items get)
 * is proportionate here — levels have no `expectedVersion`/concurrency
 * concept to guard, just the one server-enforced gate ("Publishing should
 * fail if mandatory Level validation is not satisfied"), surfaced inline
 * both pre-emptively (the warning below) and authoritatively (the server's
 * own rejection message if the admin saves anyway).
 */
export function LevelEditForm({ levelId, name: initialName, status: initialStatus, targets: initialTargets, validation }: LevelEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName ?? "");
  const [status, setStatus] = useState<CurriculumStatus>(initialStatus);
  const [targetInputs, setTargetInputs] = useState<Record<TargetKey, string>>(() =>
    Object.fromEntries(TARGET_FIELDS.map((field) => [field.key, initialTargets[field.key]?.toString() ?? ""])) as Record<
      TargetKey,
      string
    >,
  );
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function handleSave() {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const parsedTargets: LevelValidationTargets = {};
      for (const field of TARGET_FIELDS) {
        const parsed = parseTargetInput(targetInputs[field.key]);
        if (parsed === undefined) {
          setError(`${field.label} must be a whole number of 0 or more, or blank to use the default.`);
          return;
        }
        parsedTargets[field.key] = parsed;
      }

      const result = await updateLevelAction({
        levelId,
        name: name.trim() === "" ? null : name,
        status,
        targets: parsedTargets,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setJustSaved(true);
      router.refresh();
    });
  }

  const attemptingUnsatisfiedPublish = status === "published" && !validation.allSatisfied;

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-4"
      >
        <label className="block text-sm">
          <span className="font-medium text-foreground">Name</span>
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setJustSaved(false);
            }}
            placeholder="Optional"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-foreground">Status</span>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as CurriculumStatus);
              setJustSaved(false);
            }}
          >
            <SelectTrigger className="mt-1 w-full" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option[0]!.toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium text-foreground">Curriculum targets</legend>
          <p className="mb-3 text-xs text-muted-foreground">
            What this level must contain before it can be published. Leave blank to use the configured default, or enter{" "}
            <span className="font-mono">0</span> if this level intentionally has none.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {TARGET_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="text-muted-foreground">{field.label}</span>
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={targetInputs[field.key]}
                  onChange={(e) => {
                    setTargetInputs((current) => ({ ...current, [field.key]: e.target.value }));
                    setJustSaved(false);
                  }}
                  placeholder={`Default: ${field.defaultValue}`}
                  aria-label={`${field.label} target`}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {attemptingUnsatisfiedPublish ? (
          <p className="text-sm text-state-warning">This level doesn&apos;t yet meet the minimum curriculum requirements — see validation.</p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            Save
          </Button>
          {justSaved ? (
            <span className="flex items-center gap-1 text-sm text-state-success">
              <Check className="h-4 w-4" aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card p-4 sm:w-64">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Validation</h2>
        <LevelValidationSummary validation={validation} />
      </div>
    </div>
  );
}
