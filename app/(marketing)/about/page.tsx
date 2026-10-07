import type { Metadata } from "next";

import {
  ContentPage,
  ContentHeading,
  ContentParagraph,
} from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "About — Polyglot",
  description: "What Polyglot is and how it approaches language learning.",
};

export default function AboutPage() {
  return (
    <ContentPage
      title="About Polyglot"
      lede="We found language learning sites like WaniKani and Bunpro to be so effective for Japanese language learning so we made Polyglot to be just as efficient for other languagess as well."
    >
      <ContentParagraph>
        Polyglot is a language learning platform that utilizes spaced repetition studying to help learnes memorize fundamentals.
        Many decks, practice modes, and example content make it an all-in-one place to learn every aspect of a language catered to how you want to learn it.
        New features are constantly being added to make sure we cater to all learning styles.
      </ContentParagraph>

      <ContentParagraph>
        The SRS system is focused on learning fundamental vocabulary and grammar. 
        As you level up, you will unlock more advanced content that builds upon what you have already learned.
        All of the content works around where you are in your language learning journey.
      </ContentParagraph>

      <ContentHeading>Where things stand</ContentHeading>
      <ContentParagraph>
        Polyglot is in Beta mode right now. All users get all content and new features for free.
        The first language offered is Latin American Spanish with Tagalog and Korean on the way.
      </ContentParagraph>
    </ContentPage>
  );
}
