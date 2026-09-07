import { SRS_STAGE_LABELS } from "@/domains/srs";
import type { SandboxSnapshot } from "@/domains/sandbox";

/** Read-only current-state panel — the admin sees exactly what the sandbox persona's progress looks like before deciding what to change next. `now` is the caller's own snapshot of the current time (never read inline here — a component body calling `Date.now()` itself is impure). */
export function SandboxSnapshotView({ snapshot, now }: { snapshot: SandboxSnapshot; now: Date }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Unlocked levels</h2>
        {snapshot.unlockedLevels.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {snapshot.unlockedLevels.map((level) => (
              <li key={level.levelId} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                Level {level.levelNumber}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Tracked items</h2>
        {snapshot.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet — set a stage below to start tracking one.</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.items.map((item) => (
              <li key={item.learningItemId} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{item.itemLabel}</span>
                  <span className="text-xs text-muted-foreground">L{item.levelNumber}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{SRS_STAGE_LABELS[item.srsStage]}</span>
                  <span>{item.nextReviewAt && item.nextReviewAt.getTime() <= now.getTime() ? "Due now" : item.nextReviewAt ? "Not due yet" : "No review scheduled"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
