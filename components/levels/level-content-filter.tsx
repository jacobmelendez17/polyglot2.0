import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type LevelContentFilterValue = "all" | "grammar" | "vocabulary";

const FILTER_OPTIONS: { value: LevelContentFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "grammar", label: "Grammar" },
  { value: "vocabulary", label: "Vocabulary" },
];

type LevelContentFilterProps = {
  value: LevelContentFilterValue;
  onChange: (value: LevelContentFilterValue) => void;
};

/**
 * The Level page's "All / Grammar / Vocabulary" filter (spec 26, inspired by
 * the Level page mockup's segmented control). Ephemeral, per-visit UI state
 * — unlike the density toggle (`LevelViewControls`), it isn't persisted, on
 * the judgment that "which type am I looking at right now" is a momentary
 * choice rather than a standing preference. Never touches the URL or
 * authoritative curriculum data.
 */
export function LevelContentFilter({ value, onChange }: LevelContentFilterProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as LevelContentFilterValue);
      }}
      aria-label="Filter curriculum by type"
    >
      {FILTER_OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
