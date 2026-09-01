import { BookOpen, PencilLine } from "lucide-react";

import type { LearningItemType } from "@/domains/lessons";

const CATEGORY_CONFIG: Record<LearningItemType, { label: string; icon: typeof BookOpen; className: string }> = {
  vocabulary: {
    label: "Vocabulary",
    icon: BookOpen,
    className: "bg-learning-vocabulary/15 text-learning-vocabulary",
  },
  grammar: {
    label: "Grammar",
    icon: PencilLine,
    className: "bg-learning-grammar/15 text-learning-grammar",
  },
};

/** Category pairs color with a text label + icon — never color alone (spec 07 §13). */
export function CategoryBadge({ itemType }: { itemType: LearningItemType }) {
  const { label, icon: Icon, className } = CATEGORY_CONFIG[itemType];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${className}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
