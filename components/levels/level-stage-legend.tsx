import { SRS_STAGE_LABELS } from "@/domains/srs";

type LegendItem = { label: string; dotClassName: string };

/**
 * Named once per stage *name*, not per sub-stage — matches
 * `level-item-style.ts`'s coloring and `ui-context.md`'s "SRS Stage Colors"
 * grouping (all four Beginner sub-stages share one color, both Familiar
 * sub-stages share the next). "Locked" and "In Lessons" mirror the same
 * dashed/tinted treatment those items get on the card itself — see
 * `level-view.ts`'s `LevelItemDisplayState` docstring for exactly what they
 * mean (a display-sequencing convention, never a real access gate).
 */
const LEGEND_ITEMS: LegendItem[] = [
  { label: "Locked", dotClassName: "border border-dashed border-border" },
  { label: "In Lessons", dotClassName: "border border-primary/50 bg-primary/10" },
  { label: SRS_STAGE_LABELS.beginner_1.replace(" 1", ""), dotClassName: "bg-srs-beginner" },
  { label: SRS_STAGE_LABELS.familiar_1.replace(" 1", ""), dotClassName: "bg-srs-familiar" },
  { label: SRS_STAGE_LABELS.intermediate, dotClassName: "bg-srs-intermediate" },
  { label: SRS_STAGE_LABELS.master, dotClassName: "bg-srs-master" },
  { label: SRS_STAGE_LABELS.fluent, dotClassName: "bg-srs-fluent" },
];

/**
 * Spec 26's stage-color legend, inspired by the Level page mockup. Stage
 * labels are real product SRS stage names (`domains/srs`'s
 * `SRS_STAGE_LABELS`), not the mockup's own wording. Color is always paired
 * with a text label — never the only indicator of stage.
 */
export function LevelStageLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      {LEGEND_ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dotClassName}`}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
