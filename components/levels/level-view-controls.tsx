import { Grid2x2, Grid3x3, LayoutGrid, List } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type LevelViewMode = "large" | "normal" | "compact" | "list";

const VIEW_MODE_OPTIONS: { value: LevelViewMode; label: string; icon: typeof Grid2x2 }[] = [
  { value: "large", label: "Larger cards", icon: Grid2x2 },
  { value: "normal", label: "Default cards", icon: LayoutGrid },
  { value: "compact", label: "Smaller cards", icon: Grid3x3 },
  { value: "list", label: "List", icon: List },
];

type LevelViewControlsProps = {
  value: LevelViewMode;
  onChange: (mode: LevelViewMode) => void;
};

/**
 * Spec 10 §17-§18: display controls, icon-only with an accessible
 * name/tooltip on every control. Changing the mode never touches the URL
 * (spec 10 §22) — this component is purely a controlled input; the parent
 * owns where the value is stored.
 */
export function LevelViewControls({ value, onChange }: LevelViewControlsProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as LevelViewMode);
      }}
      aria-label="Curriculum display mode"
    >
      {VIEW_MODE_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => (
        <ToggleGroupItem key={optionValue} value={optionValue} aria-label={label} title={label}>
          <Icon aria-hidden="true" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
