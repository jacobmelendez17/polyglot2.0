import { Mic, Headphones, BookOpenText, PenLine } from "lucide-react";

import { PracticeCard } from "@/components/dashboard/practice-card";
import type { PracticeArea } from "@/domains/dashboard";

const PRACTICE_AREAS = [
  { area: "speaking", label: "Speaking", href: "/practice/speaking", icon: Mic },
  { area: "listening", label: "Listening", href: "/practice/listening", icon: Headphones },
  { area: "reading", label: "Reading", href: "/practice/reading", icon: BookOpenText },
  { area: "writing", label: "Writing", href: "/practice/writing", icon: PenLine },
] as const satisfies readonly { area: PracticeArea; label: string; href: string; icon: typeof Mic }[];

export function PracticeGrid() {
  return (
    <div>
      <h2 className="mb-3 font-heading text-lg font-medium text-foreground">Practice</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PRACTICE_AREAS.map(({ area, ...card }) => (
          <PracticeCard key={area} {...card} />
        ))}
      </div>
    </div>
  );
}
