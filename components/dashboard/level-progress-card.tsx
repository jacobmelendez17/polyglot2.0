import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StreakRow } from "@/components/dashboard/streak-row";
import type { LevelProgress } from "@/domains/dashboard";

type LevelProgressCardProps = {
  levelProgress: LevelProgress;
};

function progressPercent(learned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((learned / total) * 100));
}

type ProgressStatProps = {
  label: string;
  learned: number;
  total: number;
  indicatorClassName: string;
};

function ProgressStat({ label, learned, total, indicatorClassName }: ProgressStatProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {learned}/{total}
        </span>
      </div>
      <Progress value={progressPercent(learned, total)} indicatorClassName={indicatorClassName} />
    </div>
  );
}

export function LevelProgressCard({ levelProgress }: LevelProgressCardProps) {
  const { currentLevel, streak, vocabulary, grammar, overall } = levelProgress;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Level Progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Current level</p>
          <p className="font-heading text-3xl font-semibold text-foreground">{currentLevel}</p>
        </div>

        <div>
          <p className="mb-2 text-sm text-muted-foreground">This week</p>
          <StreakRow streak={streak} />
        </div>

        <div className="flex flex-col gap-4">
          <ProgressStat
            label="Vocabulary"
            learned={vocabulary.learned}
            total={vocabulary.total}
            indicatorClassName="bg-learning-vocabulary"
          />
          <ProgressStat
            label="Grammar"
            learned={grammar.learned}
            total={grammar.total}
            indicatorClassName="bg-learning-grammar"
          />
          <ProgressStat
            label="Overall"
            learned={overall.learned}
            total={overall.total}
            indicatorClassName="bg-primary"
          />
        </div>
      </CardContent>
    </Card>
  );
}
