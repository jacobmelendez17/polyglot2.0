import { Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";

/** No community hub exists yet — see `news-card.tsx`'s docstring for why this stays a static placeholder rather than linking anywhere. */
export function CommunityCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Community</CardTitle>
        <CardDescription>Connect with other learners</CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={Users}
          title="Community hub coming soon"
          description="Discussions, events, and learner meetups will live here."
        />
      </CardContent>
    </Card>
  );
}
