import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type PracticeCardProps = {
  icon: LucideIcon;
  label: string;
  href: string;
};

export function PracticeCard({ icon: Icon, label, href }: PracticeCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="items-center gap-2 py-6 text-center transition-colors group-hover:border-primary/40">
        <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        <CardContent className="px-0">
          <span className="font-heading text-sm font-medium text-foreground">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
