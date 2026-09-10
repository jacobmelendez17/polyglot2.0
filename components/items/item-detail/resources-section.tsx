import { ExternalLink } from "lucide-react";

import type { ItemDetailResourceSource } from "@/domains/curriculum";

type ResourcesSectionProps = {
  resources: ItemDetailResourceSource[];
};

/**
 * Spec 18's Resources section — admin-authored external links only. Learner
 * notes, synonyms, and examples never appear here ("do not mix user-private
 * content with official resource links").
 *
 * Each link states that it opens externally in its accessible name rather
 * than relying on the icon alone, and carries `rel="noreferrer"` since these
 * are third-party destinations.
 */
export function ResourcesSection({ resources }: ResourcesSectionProps) {
  if (resources.length === 0) {
    return <p className="text-sm text-muted-foreground">No additional resources for this item yet.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {resources.map((resource) => (
        <li key={resource.id}>
          <a
            href={resource.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${resource.label} (opens in a new tab)`}
            className="inline-flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm font-medium text-foreground ring-1 ring-foreground/5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {resource.label}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
