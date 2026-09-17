import type { Metadata } from "next";

import {
  ContentPage,
  ContentHeading,
  ContentParagraph,
} from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Privacy — Polyglot",
  description: "How Polyglot handles account and learning data during Beta.",
};

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy"
      lede="Polyglot is in Beta. This page describes current practice and will be replaced by a formal policy before general availability."
    >
      <ContentParagraph>
        Last updated {new Date().getFullYear()}.
      </ContentParagraph>

      <ContentHeading>What we store</ContentHeading>
      <ContentParagraph>
        Account identity (email and authentication) is handled by our
        authentication provider, Clerk. Your learning data — curriculum
        progress, review history, decks, and journal entries — is stored in our
        database and is visible only to your account. Administrative access to
        the platform is enforced on every request, not just hidden behind the
        interface.
      </ContentParagraph>

      <ContentHeading>
        What we don&apos;t share with analytics or monitoring
      </ContentHeading>
      <ContentParagraph>
        Journal content and the answers you type during lessons or reviews are
        never sent to analytics or error-monitoring tools. If you use
        speech-based practice, recordings are processed to grade your answer and
        are not stored afterward.
      </ContentParagraph>

      <ContentHeading>Your data</ContentHeading>
      <ContentParagraph>
        Account and progress deletion is available from Settings. Deleting your
        account removes your learning data after the confirmation window shown
        at the time.
      </ContentParagraph>

      <ContentHeading>Questions</ContentHeading>
      <ContentParagraph>
        Reach out through the{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          href="/feedback"
        >
          Feedback
        </a>{" "}
        page.
      </ContentParagraph>
    </ContentPage>
  );
}
