import type { Metadata } from "next";

import { ContentPage, ContentHeading, ContentParagraph } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "About — Polyglot",
  description: "What Polyglot is and how it approaches language learning.",
};

export default function AboutPage() {
  return (
    <ContentPage
      title="About Polyglot"
      lede="A structured curriculum, spaced repetition, and practice, built as one system rather than three separate apps."
    >
      <ContentParagraph>
        Polyglot pairs a structured curriculum with a spaced-repetition system, treating vocabulary
        and grammar as distinct but equally important study items rather than teaching grammar as an
        afterthought. Its learning loop draws on WaniKani&apos;s SRS and dashboard model,
        Bunpro&apos;s treatment of grammar as structured study content, and Anki&apos;s deck-based
        practice.
      </ContentParagraph>

      <ContentParagraph>
        Levels unlock in order, each introducing vocabulary and grammar together. Newly learned
        items enter scheduled reviews, and additional practice modes open up as a learner&apos;s
        level and known content grow.
      </ContentParagraph>

      <ContentHeading>Where things stand</ContentHeading>
      <ContentParagraph>
        Polyglot is in Beta. The first supported curriculum is Latin American Spanish focused on
        Mexican usage, with more languages planned as the core learning model proves out.
      </ContentParagraph>
    </ContentPage>
  );
}
