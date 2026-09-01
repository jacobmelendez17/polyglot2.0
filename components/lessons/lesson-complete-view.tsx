import Link from "next/link";
import { PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LessonCompletionPreview } from "@/domains/lessons";

type LessonCompleteViewProps = {
  completion: LessonCompletionPreview;
};

/**
 * Spec 07 §51: normal Polyglot surfaces are fine here — the chromeless rule
 * in §26 governs only the active quiz. Deliberately not an elaborate
 * celebration (§89 scopes that out); a subtle entrance is enough.
 */
export function LessonCompleteView({ completion }: LessonCompleteViewProps) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <PartyPopper className="h-10 w-10 text-primary" aria-hidden="true" />

      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Lesson Complete!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {completion.items.length} new {completion.items.length === 1 ? "item" : "items"} learned
        </p>
      </div>

      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">New SRS stage</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{completion.newStage}</p>
          </div>

          <ul className="flex flex-col gap-1 text-left">
            {completion.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="text-muted-foreground">{item.meaning}</span>
              </li>
            ))}
          </ul>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Accuracy</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{completion.accuracy}%</p>
          </div>
        </CardContent>
      </Card>

      <Button asChild size="lg" className="w-full">
        <Link href="/dashboard">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
