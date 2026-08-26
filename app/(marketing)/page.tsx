import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/hero-section";
import { SrsSection } from "@/components/marketing/srs-section";
import { PillarsSection } from "@/components/marketing/pillars-section";
import { ReviewPreviewSection } from "@/components/marketing/review-preview-section";
import { PracticeSection } from "@/components/marketing/practice-section";
import { ClosingSection } from "@/components/marketing/closing-section";

export const metadata: Metadata = {
  title: "Polyglot — Learn Spanish with structure and spaced repetition",
  description:
    "Polyglot pairs a structured Latin American Spanish curriculum with spaced repetition, treating vocabulary and grammar as equally important study items.",
};

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <SrsSection />
      <PillarsSection />
      <ReviewPreviewSection />
      <PracticeSection />
      <ClosingSection />
    </>
  );
}
