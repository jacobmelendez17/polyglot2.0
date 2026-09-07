"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  makeSandboxReviewsDueAction,
  resetSandboxAction,
  setSandboxItemStageAction,
  simulateLevelAction,
} from "@/app/(admin)/admin/sandbox/actions";
import { SRS_STAGE_LABELS, SRS_STAGE_ORDER, type SrsStage } from "@/domains/srs";

type SandboxControlsProps = {
  languageId: string;
  levels: { id: string; levelNumber: number }[];
  items: { id: string; itemLabel: string; levelId: string; levelNumber: number }[];
};

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SuccessBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="flex items-center gap-1 text-sm text-state-success">
      <Check className="h-4 w-4" aria-hidden="true" />
      Done
    </span>
  );
}

/**
 * Spec 11 rewrite's "Sandbox Controls" — level simulation, SRS stage
 * overrides, forcing reviews due, and reset, all against the existing
 * `users.is_sandbox` persona. "Unlock practice"/"Unlock tests" are omitted
 * entirely rather than built as inert controls — neither feature exists
 * anywhere in this codebase yet (spec 07/09 explicitly scoped practice
 * experiences out). "Open Sandbox" and time simulation are also
 * deliberately absent — see progress-tracker.md's Sandbox entry.
 */
export function SandboxControls({ languageId, levels, items }: SandboxControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justDid, setJustDid] = useState<string | null>(null);

  const [simulateLevelId, setSimulateLevelId] = useState(levels[0]?.id ?? "");

  const [stageLevelId, setStageLevelId] = useState(levels[0]?.id ?? "");
  const itemsInStageLevel = useMemo(() => items.filter((item) => item.levelId === stageLevelId), [items, stageLevelId]);
  const [stageItemId, setStageItemId] = useState(itemsInStageLevel[0]?.id ?? "");
  const [stage, setStage] = useState<SrsStage>("beginner_1");

  const [confirmingReset, setConfirmingReset] = useState(false);

  function handleStageLevelChange(levelId: string) {
    setStageLevelId(levelId);
    const firstItem = items.find((item) => item.levelId === levelId);
    setStageItemId(firstItem?.id ?? "");
  }

  function run(key: string, action: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setError(null);
    setJustDid(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error?.message ?? "Something went wrong.");
        return;
      }
      setJustDid(key);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {levels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No levels are configured yet.</p>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Simulate a level</h2>
            <ActionRow>
              <Field label="Level">
                <Select value={simulateLevelId} onValueChange={setSimulateLevelId}>
                  <SelectTrigger aria-label="Level to simulate" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        Level {level.levelNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                disabled={isPending || !simulateLevelId}
                onClick={() =>
                  run("simulate-level", () => simulateLevelAction({ languageId, levelId: simulateLevelId, idempotencyKey: crypto.randomUUID() }))
                }
              >
                Simulate level
              </Button>
              <SuccessBadge show={justDid === "simulate-level"} />
            </ActionRow>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Set an item&apos;s SRS stage</h2>
            <ActionRow>
              <Field label="Level">
                <Select value={stageLevelId} onValueChange={handleStageLevelChange}>
                  <SelectTrigger aria-label="Level" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        Level {level.levelNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Item">
                <Select value={stageItemId} onValueChange={setStageItemId}>
                  <SelectTrigger aria-label="Item" className="w-48">
                    <SelectValue placeholder={itemsInStageLevel.length === 0 ? "No published items" : "Choose an item"} />
                  </SelectTrigger>
                  <SelectContent>
                    {itemsInStageLevel.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.itemLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="SRS stage">
                <Select value={stage} onValueChange={(v) => setStage(v as SrsStage)}>
                  <SelectTrigger aria-label="SRS stage" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SRS_STAGE_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SRS_STAGE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                disabled={isPending || !stageItemId}
                onClick={() =>
                  run("set-stage", () =>
                    setSandboxItemStageAction({ languageId, learningItemId: stageItemId, srsStage: stage, idempotencyKey: crypto.randomUUID() }),
                  )
                }
              >
                Set stage
              </Button>
              <SuccessBadge show={justDid === "set-stage"} />
            </ActionRow>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Reviews</h2>
            <ActionRow>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => run("make-due", () => makeSandboxReviewsDueAction({ languageId, idempotencyKey: crypto.randomUUID() }))}
              >
                Make all reviews due
              </Button>
              <SuccessBadge show={justDid === "make-due"} />
            </ActionRow>
          </section>

          <section className="rounded-xl border border-destructive/30 bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Reset</h2>
            <Dialog open={confirmingReset} onOpenChange={setConfirmingReset}>
              <DialogTrigger asChild>
                <Button variant="destructive">Reset sandbox</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset your sandbox?</DialogTitle>
                  <DialogDescription>
                    Clears every tracked item and unlocked level for your sandbox only, then re-unlocks Level 1. This never affects real learner
                    progress, other sandboxes, or official curriculum.
                  </DialogDescription>
                </DialogHeader>
                {error ? (
                  <p role="alert" className="text-sm text-state-error">
                    {error}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmingReset(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onClick={() =>
                      run("reset", async () => {
                        const result = await resetSandboxAction({ languageId, idempotencyKey: crypto.randomUUID() });
                        if (result.ok) setConfirmingReset(false);
                        return result;
                      })
                    }
                  >
                    Reset
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>
        </>
      )}

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
