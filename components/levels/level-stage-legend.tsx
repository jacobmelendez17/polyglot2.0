import { SRS_STAGE_LABELS } from "@/domains/srs";

/**
 * Named once per stage *name*, not per sub-stage — matches `LevelItemCard`'s
 * coloring and `ui-context.md`'s "SRS Stage Colors" grouping (all four
 * Beginner sub-stages share one color, both Familiar sub-stages share the
 * next).
 */
const LEGEND_ITEMS: { label: string; colorClassName: string }[] = [
  { label: "Not learned yet", colorClassName: "bg-border" },
  { label: SRS_STAGE_LABELS.beginner_1.replace(" 1", ""), colorClassName: "bg-srs-beginner" },
  { label: SRS_STAGE_LABELS.familiar_1.replace(" 1", ""), colorClassName: "bg-srs-familiar" },
  { label: SRS_STAGE_LABELS.intermediate, colorClassName: "bg-srs-intermediate" },
  { label: SRS_STAGE_LABELS.master, colorClassName: "bg-srs-master" },
  { label: SRS_STAGE_LABELS.fluent, colorClassName: "bg-srs-fluent" },
];

/**
 * Spec 26's stage-color legend, inspired by the Level page mockup — labels
 * are real product SRS stage names (`domains/srs`'s `SRS_STAGE_LABELS`), not
 * the mockup's own wording, and there is no separate "Locked"/"In lessons"
 * swatch: see `level-view.ts`'s `buildLevelViewModel` docstring for why that
 * distinction isn't real product behavior today. Color is always paired
 * with a text label — never the only indicator of stage.
 */
export function LevelStageLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      {LEGEND_ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.colorClassName}`}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
