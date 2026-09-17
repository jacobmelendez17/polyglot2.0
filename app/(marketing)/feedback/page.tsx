import type { Metadata } from "next";

import {
  ContentPage,
  ContentParagraph,
} from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Feedback — Polyglot",
  description:
    "How to send feedback, bug reports, or suggestions to the Polyglot team.",
};

// TODO(21-footer): placeholder inbox — point this at a real, monitored
// address before launch. Tracked in progress-tracker.md.
const FEEDBACK_EMAIL = "feedback@polyglot.app";

export default function FeedbackPage() {
  return (
    <ContentPage
      title="Feedback"
      lede="Polyglot is in Beta, and reports of what's broken or missing directly shape what gets built next."
    >
      <ContentParagraph>
        Found a bug, hit something confusing, or have a suggestion for the
        curriculum or review experience? Send it to{" "}
        <a
          href={`mailto:${FEEDBACK_EMAIL}`}
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          {FEEDBACK_EMAIL}
        </a>
        .
      </ContentParagraph>
      <ContentParagraph>
        Include what you were doing, what you expected, and what happened
        instead — that&apos;s usually enough to track down.
      </ContentParagraph>
    </ContentPage>
  );
}
