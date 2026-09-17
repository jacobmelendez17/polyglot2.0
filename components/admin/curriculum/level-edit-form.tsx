"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateLevelAction } from "@/app/(admin)/admin/curriculum/actions";
import type { CurriculumStatus } from "@/domains/curriculum";
import type { CefrLevel } from "@/db/schema";

type LevelEditFormProps = {
  levelId: string;
  name: string | null;
  status: CurriculumStatus;
  /** Spec 18 — the band item pages show in their hero. `null` until set. */
  cefrLevel: CefrLevel | null;
  /** What the level actually contains — shown so an Admin can see it, never a gate. */
  counts: {
    vocabularyItems: number;
    grammarItems: number;
    vocabularyGroups: number;
  };
};

const STATUS_OPTIONS: CurriculumStatus[] = [
  "draft",
  "pending",
  "published",
  "archived",
];

const CEFR_OPTIONS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** `Select` cannot hold an empty string as a value, so "no band" needs a real sentinel. */
const CEFR_UNSET = "unset";

/**
 * Spec 11 rewrite's "Levels Management" edit surface, rewritten for spec 17's
 * flexible levels.
 *
 * A level used to carry per-level curriculum targets and refuse to publish
 * until it counted 48 vocabulary / 4 groups / 12 grammar. Levels hold
 * whatever they hold; the counts below are information, and publishing is an
 * Admin's decision rather than a threshold being crossed.
 */
export function LevelEditForm({
  levelId,
  name: initialName,
  status: initialStatus,
  cefrLevel: initialCefr,
  counts,
}: LevelEditFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [status, setStatus] = useState<CurriculumStatus>(initialStatus);
  const [cefrLevel, setCefrLevel] = useState<CefrLevel | typeof CEFR_UNSET>(
    initialCefr ?? CEFR_UNSET,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateLevelAction({
        levelId,
        name: name.trim() === "" ? null : name.trim(),
        status,
        cefrLevel: cefrLevel === CEFR_UNSET ? null : cefrLevel,
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
    <div className="flex flex-col gap-4 sm:max-w-xl">
      <label className="block text-sm">
        <span className="font-medium text-foreground">Name</span>
        <Input
          className="mt-1"
          value={name}
          placeholder="Optional"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">CEFR band</span>
        <Select
          value={cefrLevel}
          onValueChange={(value) =>
            setCefrLevel(value as CefrLevel | typeof CEFR_UNSET)
          }
        >
          <SelectTrigger className="mt-1 w-full" aria-label="CEFR band">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CEFR_UNSET}>Not set</SelectItem>
            {CEFR_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="mt-1 block text-xs text-muted-foreground">
          Shown on every item page in this level. Leave unset and item pages
          simply omit it.
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Status</span>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as CurriculumStatus)}
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <p className="text-sm text-muted-foreground">
        Contains {counts.vocabularyItems} vocabulary item
        {counts.vocabularyItems === 1 ? "" : "s"} across{" "}
        {counts.vocabularyGroups} group
        {counts.vocabularyGroups === 1 ? "" : "s"}, and {counts.grammarItems}{" "}
        grammar item
        {counts.grammarItems === 1 ? "" : "s"}. A level can hold any number of
        either — publishing it is your call.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          Save
        </Button>
        {saved ? (
          <span className="flex items-center gap-1 text-sm text-state-success">
            <Check className="h-4 w-4" aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
