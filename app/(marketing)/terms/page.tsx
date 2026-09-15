import type { Metadata } from "next";

import { ContentPage, ContentHeading, ContentParagraph } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Terms — Polyglot",
  description: "Terms of use for the Polyglot Beta.",
};

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms"
      lede="Polyglot is in Beta. These terms cover the Beta period and will be replaced by a formal agreement before general availability."
    >
      <ContentParagraph>
        Last updated {new Date().getFullYear()}.
      </ContentParagraph>

      <ContentHeading>Using the Beta</ContentHeading>
      <ContentParagraph>
        By creating an account you agree to use Polyglot for personal language learning. Curriculum
        content, features, and this Beta itself may change, and official curriculum levels unlock in
        a fixed order rather than at your discretion.
      </ContentParagraph>

      <ContentHeading>Your account</ContentHeading>
      <ContentParagraph>
        You&apos;re responsible for the activity on your account. Progress, review history, decks,
        and journal entries you create belong to you, and you can reset or delete them from
        Settings.
      </ContentParagraph>

      <ContentHeading>Beta availability</ContentHeading>
      <ContentParagraph>
        We target high availability during Beta, but interruptions, resets, or data corrections may
        happen without notice while the product is under active development.
      </ContentParagraph>

      <ContentHeading>Questions</ContentHeading>
      <ContentParagraph>
        Reach out through the <a className="font-medium text-foreground underline underline-offset-4 hover:text-primary" href="/feedback">Feedback</a> page.
      </ContentParagraph>
    </ContentPage>
  );
}
