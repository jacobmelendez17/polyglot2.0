import type { ReactNode } from "react";

import { EMPHASIS_PATTERN } from "@/lib/authored-text";

/**
 * Admin-authored text with the 'word' shortcut applied: the ticks disappear
 * and the word renders bold in the success green, so an author can call out
 * the word a sentence or explanation is about without any markup.
 *
 * Deliberately the whole "language" — no other syntax — matching spec 18's
 * refusal of a rich-text editor. Returns plain text unchanged when there is
 * nothing to emphasize, and never renders HTML, so authored content can't
 * inject markup.
 */
export function AuthoredText({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(EMPHASIS_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <strong key={start} className="font-bold text-state-success">
        {match[1]}
      </strong>,
    );
    last = start + match[0].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
