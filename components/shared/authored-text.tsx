import type { ReactNode } from "react";

import {
  DOUBLE_QUOTE_EMPHASIS_PATTERN,
  EMPHASIS_PATTERN,
} from "@/lib/authored-text";

type EmphasisSpan = {
  start: number;
  end: number;
  content: string;
  className: string;
};

function collectSpans(text: string): EmphasisSpan[] {
  const spans: EmphasisSpan[] = [];
  for (const match of text.matchAll(EMPHASIS_PATTERN)) {
    const start = match.index ?? 0;
    spans.push({
      start,
      end: start + match[0].length,
      content: match[1],
      className: "font-bold text-state-success",
    });
  }
  for (const match of text.matchAll(DOUBLE_QUOTE_EMPHASIS_PATTERN)) {
    const start = match.index ?? 0;
    spans.push({
      start,
      end: start + match[0].length,
      content: match[1],
      className: "font-bold text-learning-vocabulary",
    });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Admin-authored text with two emphasis shortcuts applied: 'word' renders
 * bold in the success green, "word" renders bold in the vocabulary blue —
 * both quote marks disappear either way, so an author can call out a word
 * or phrase without any markup.
 *
 * Deliberately the whole "language" — no other syntax — matching spec 18's
 * refusal of a rich-text editor. Returns plain text unchanged when there is
 * nothing to emphasize, and never renders HTML, so authored content can't
 * inject markup.
 */
export function AuthoredText({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const span of collectSpans(text)) {
    // A double-quoted span starting inside an already-claimed single-quoted
    // span (or vice versa) is nested/overlapping input, which this shortcut
    // language doesn't define — skip it and leave its quote marks as plain
    // text within the outer span, rather than rendering a broken/overlapping
    // <strong>.
    if (span.start < last) continue;
    if (span.start > last) parts.push(text.slice(last, span.start));
    parts.push(
      <strong key={span.start} className={span.className}>
        {span.content}
      </strong>,
    );
    last = span.end;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
