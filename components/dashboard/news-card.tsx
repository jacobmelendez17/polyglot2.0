import { Newspaper } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";

/**
 * No news feed exists yet (no domain, no content source) — per
 * `context/feature-specs/21-footer.md`'s route rule, a link to a page that
 * doesn't exist yet is omitted rather than pointed at `href="#"`, so this
 * stays a static placeholder until there's real content to show.
 */
export function NewsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>News</CardTitle>
        <CardDescription>What&apos;s new in Polyglot</CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={Newspaper}
          title="Nothing new yet"
          description="Product updates and release notes will show up here."
        />
      </CardContent>
    </Card>
  );
}
