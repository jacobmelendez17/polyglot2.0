"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  makeSandboxReviewsDueAction,
  resetOwnAccountProgressAction,
  resetSandboxAction,
  setSandboxItemStageAction,
  openSandboxAction,
  setSandboxTimeOffsetAction,
  simulateLevelAction,
} from "@/app/(admin)/admin/sandbox/actions";
import {
  SRS_STAGE_LABELS,
  SRS_STAGE_ORDER,
  type SrsStage,
} from "@/domains/srs";

type SandboxControlsProps = {
  languageId: string;
  levels: { id: string; levelNumber: number }[];
  items: {
    id: string;
    itemLabel: string;
    levelId: string;
    levelNumber: number;
  }[];
  /** The persona's current clock offset from real server time, in seconds. */
  timeOffsetSeconds: number;
};

const DAY_SECONDS = 24 * 60 * 60;

/** Jumps the spec's own example offers ("Time [+7 Days]"), plus the shorter and longer horizons an SRS schedule actually spans. */
const TIME_JUMPS = [
  { label: "+1 day", seconds: DAY_SECONDS },
  { label: "+7 days", seconds: 7 * DAY_SECONDS },
  { label: "+30 days", seconds: 30 * DAY_SECONDS },
];

function describeOffset(offsetSeconds: number): string {
  if (offsetSeconds === 0) return "Present (real server time)";
  const days = offsetSeconds / DAY_SECONDS;
  const rounded = Math.round(days * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} day${Math.abs(rounded) === 1 ? "" : "s"} ahead of real server time`;
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
 * experiences out).
 *
 * Time simulation shifts only *this persona's* perceived clock — real server
 * time is never touched, and a database check constraint makes an offset on a
 * non-sandbox user unrepresentable. "Open Sandbox" issues a short-lived
 * signed grant so learner pages resolve as the persona; ownership is
 * re-proved against the database on every request, never trusted from the
 * cookie.
 *
 * "Replay Onboarding" (spec 15) is a plain link rather than an action,
 * because a replay writes nothing at all: `/onboarding?replay=1` renders the
 * same production components in preview mode. This page still reaches it
 * only because `/admin/sandbox` itself is Admin-gated — the route no longer
 * re-checks Admin access on the query parameter alone, since spec 20 opened
 * the same preview to every learner from their own Settings ("Onboarding
 * Tour"). Not omitting `returnTo` is what sends this specific launch point
 * back to `/admin/sandbox` when finished, rather than Settings' default.
 */
export function SandboxControls({
  languageId,
  levels,
  items,
  timeOffsetSeconds,
}: SandboxControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justDid, setJustDid] = useState<string | null>(null);

  const [simulateLevelId, setSimulateLevelId] = useState(levels[0]?.id ?? "");

  const [stageLevelId, setStageLevelId] = useState(levels[0]?.id ?? "");
  const itemsInStageLevel = useMemo(
    () => items.filter((item) => item.levelId === stageLevelId),
    [items, stageLevelId],
  );
  const [stageItemId, setStageItemId] = useState(
    itemsInStageLevel[0]?.id ?? "",
  );
  const [stage, setStage] = useState<SrsStage>("beginner_1");

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingAccountReset, setConfirmingAccountReset] = useState(false);

  function handleStageLevelChange(levelId: string) {
    setStageLevelId(levelId);
    const firstItem = items.find((item) => item.levelId === levelId);
    setStageItemId(firstItem?.id ?? "");
  }

  function run(
    key: string,
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
  ) {
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
        <p className="text-sm text-muted-foreground">
          No levels are configured yet.
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Simulate a level
            </h2>
            <ActionRow>
              <Field label="Level">
                <Select
                  value={simulateLevelId}
                  onValueChange={setSimulateLevelId}
                >
                  <SelectTrigger
                    aria-label="Level to simulate"
                    className="w-40"
                  >
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
                  run("simulate-level", () =>
                    simulateLevelAction({
                      languageId,
                      levelId: simulateLevelId,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  )
                }
              >
                Simulate level
              </Button>
              <SuccessBadge show={justDid === "simulate-level"} />
            </ActionRow>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Set an item&apos;s SRS stage
            </h2>
            <ActionRow>
              <Field label="Level">
                <Select
                  value={stageLevelId}
                  onValueChange={handleStageLevelChange}
                >
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
                    <SelectValue
                      placeholder={
                        itemsInStageLevel.length === 0
                          ? "No published items"
                          : "Choose an item"
                      }
                    />
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
                <Select
                  value={stage}
                  onValueChange={(v) => setStage(v as SrsStage)}
                >
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
                    setSandboxItemStageAction({
                      languageId,
                      learningItemId: stageItemId,
                      srsStage: stage,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  )
                }
              >
                Set stage
              </Button>
              <SuccessBadge show={justDid === "set-stage"} />
            </ActionRow>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Reviews
            </h2>
            <ActionRow>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  run("make-due", () =>
                    makeSandboxReviewsDueAction({
                      languageId,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  )
                }
              >
                Make all reviews due
              </Button>
              <SuccessBadge show={justDid === "make-due"} />
            </ActionRow>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-foreground">
              Simulate time
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Moves this sandbox persona&apos;s perceived clock only. Real
              server time, other users, and every real learner&apos;s schedule
              are unaffected. Currently:{" "}
              <span className="font-medium text-foreground">
                {describeOffset(timeOffsetSeconds)}
              </span>
              .
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {TIME_JUMPS.map((jump) => (
                <Button
                  key={jump.label}
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run("time", () =>
                      setSandboxTimeOffsetAction({
                        languageId,
                        // An absolute target, not a relative nudge, so a retried
                        // request can never compound the jump.
                        offsetSeconds: timeOffsetSeconds + jump.seconds,
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    )
                  }
                >
                  {jump.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                disabled={isPending || timeOffsetSeconds === 0}
                onClick={() =>
                  run("time", () =>
                    setSandboxTimeOffsetAction({
                      languageId,
                      offsetSeconds: 0,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  )
                }
              >
                Back to present
              </Button>
              <SuccessBadge show={justDid === "time"} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-foreground">
              Replay onboarding
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Plays the real onboarding slideshow from slide 1, as many times as
              you like, including the full Start Now flow. Nothing is saved:
              your own onboarding status and every learner&apos;s progress are
              left untouched.
            </p>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => router.push("/onboarding?replay=1")}
            >
              Replay Onboarding
            </Button>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-foreground">
              Open the sandbox learner experience
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Browses the app as this persona for up to 30 minutes. A banner
              stays visible throughout, and you can leave at any time.
            </p>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() =>
                run("open", async () => {
                  const result = await openSandboxAction({ languageId });
                  if (result.ok) router.push("/dashboard");
                  return result;
                })
              }
            >
              Open sandbox
            </Button>
          </section>

          <section className="rounded-xl border border-destructive/30 bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Reset
            </h2>
            <Dialog open={confirmingReset} onOpenChange={setConfirmingReset}>
              <DialogTrigger asChild>
                <Button variant="destructive">Reset sandbox</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset your sandbox?</DialogTitle>
                  <DialogDescription>
                    Clears every tracked item and unlocked level for your
                    sandbox only, then re-unlocks Level 1. This never affects
                    real learner progress, other sandboxes, or official
                    curriculum.
                  </DialogDescription>
                </DialogHeader>
                {error ? (
                  <p role="alert" className="text-sm text-state-error">
                    {error}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmingReset(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onClick={() =>
                      run("reset", async () => {
                        const result = await resetSandboxAction({
                          languageId,
                          idempotencyKey: crypto.randomUUID(),
                        });
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

          <section className="rounded-xl border border-destructive/30 bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Reset my account progress
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Unlike the sandbox reset above, this clears your real
              account&apos;s own lesson and review progress — useful for
              repeatedly testing the live lesson flow without needing a new
              account each time.
            </p>
            <Dialog
              open={confirmingAccountReset}
              onOpenChange={setConfirmingAccountReset}
            >
              <DialogTrigger asChild>
                <Button variant="destructive">Reset my account progress</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    Reset your real account&apos;s progress?
                  </DialogTitle>
                  <DialogDescription>
                    Clears every tracked item and unlocked level on your own
                    account, then re-unlocks Level 1. This affects your real
                    account, not a sandbox persona — it cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                {error ? (
                  <p role="alert" className="text-sm text-state-error">
                    {error}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmingAccountReset(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onClick={() =>
                      run("account-reset", async () => {
                        const result = await resetOwnAccountProgressAction({
                          languageId,
                          idempotencyKey: crypto.randomUUID(),
                        });
                        if (result.ok) setConfirmingAccountReset(false);
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
