import {
  BookOpenIcon,
  FileCheckIcon,
  HeadphonesIcon,
  LanguagesIcon,
  MessageSquareTextIcon,
  MicIcon,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/shared/reveal";
import { cn } from "@/lib/utils";

type Pillar = {
  title: string;
  icon: LucideIcon;
  /** Learning-type token for the label; only vocabulary and grammar have one. */
  labelClassName?: string;
  teaser: string;
  description: string;
  details: string[];
};

const PILLARS: Pillar[] = [
  {
    title: "Vocabulary",
    icon: LanguagesIcon,
    labelClassName: "text-[color:var(--learning-vocabulary)]",
    teaser: "Words, one item page each",
    description:
      "Each level introduces 48 vocabulary items across four themed groups of twelve.",
    details: [
      "Meaning, article, and part of speech",
      "Pronunciation, IPA, and audio",
      "Example sentences in context",
      "Its own place in the SRS schedule",
    ],
  },
  {
    title: "Grammar",
    icon: MessageSquareTextIcon,
    labelClassName: "text-[color:var(--learning-grammar)]",
    teaser: "A first-class study item",
    description:
      "Each level also introduces 12 grammar points, taught and reviewed as seriously as vocabulary.",
    details: [
      "A plain-language explanation",
      "Example sentences in use",
      "Practice like translation or word banks",
      "Its own SRS schedule, tracked separately",
    ],
  },
  {
    title: "Speaking",
    icon: MicIcon,
    teaser: "Say it out loud",
    description:
      "Repeat or respond to a prompt with your microphone. Speech recognition checks it.",
    details: [
      "Recordings are discarded afterward",
      "Never stored",
      "Progress tracked apart from reviews",
    ],
  },
  {
    title: "Reading",
    icon: BookOpenIcon,
    teaser: "Learned words, in context",
    description:
      "Read passages built from content you've already learned, so vocabulary and grammar show up together.",
    details: [
      "Passages use words you know",
      "Reinforces grammar in context",
      "Progress tracked apart from reviews",
    ],
  },
  {
    title: "Testing",
    icon: FileCheckIcon,
    teaser: "Check how far you've come",
    description:
      "Module, theme, and level-spanning tests unlock as you progress.",
    details: [
      "Review past attempts and scores",
      "Retake tests to improve",
      "Tests never change your SRS stages",
    ],
  },
  {
    title: "Listening",
    icon: HeadphonesIcon,
    teaser: "Train your ear",
    description:
      "Hear spoken Spanish and type or select what it means, at your own pace.",
    details: [
      "Spoken Spanish prompts",
      "Type or select the meaning",
      "Progress tracked apart from reviews",
    ],
  },
];

// Both faces are always in the DOM, so a screen reader reads front and back
// without hovering. Sighted users flip on hover; focus does the same for
// keyboard and touch (a tap focuses a tabIndex=0 element). Under reduced
// motion the 3D turn is replaced by a crossfade, so nothing is lost.
const FACE =
  "absolute inset-0 flex flex-col rounded-xl border border-border p-6 [backface-visibility:hidden]";

function PillarCard({ pillar, index }: { pillar: Pillar; index: number }) {
  const Icon = pillar.icon;

  return (
    <Reveal delayMs={index * 50} className="h-full">
      <div
        data-testid="pillar-card"
        tabIndex={0}
        className="group h-72 rounded-xl outline-none [perspective:1000px] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div
          className={cn(
            "relative h-full w-full transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out)] [transform-style:preserve-3d]",
            "group-hover:[transform:rotateY(180deg)] group-focus:[transform:rotateY(180deg)]",
            "motion-reduce:transition-none motion-reduce:group-hover:transform-none motion-reduce:group-focus:transform-none",
          )}
        >
          <div
            className={cn(
              FACE,
              "items-center justify-center bg-card text-center",
              "motion-reduce:transition-opacity motion-reduce:group-hover:opacity-0 motion-reduce:group-focus:opacity-0",
            )}
          >
            <Icon
              className="animate-bob h-8 w-8 text-primary"
              aria-hidden="true"
              style={{ animationDelay: `${(index % 3) * 150}ms` }}
            />
            <p
              className={cn(
                "mt-4 text-sm font-semibold tracking-wide uppercase",
                pillar.labelClassName ?? "text-foreground",
              )}
            >
              {pillar.title}
            </p>
            <p className="mt-2 text-foreground/80">{pillar.teaser}</p>
          </div>

          <div
            className={cn(
              FACE,
              "bg-secondary [transform:rotateY(180deg)]",
              "motion-reduce:transform-none motion-reduce:opacity-0 motion-reduce:transition-opacity motion-reduce:group-hover:opacity-100 motion-reduce:group-focus:opacity-100",
            )}
          >
            <p
              className={cn(
                "text-sm font-semibold tracking-wide uppercase",
                pillar.labelClassName ?? "text-foreground",
              )}
            >
              {pillar.title}
            </p>
            <p className="mt-2 text-sm text-foreground">{pillar.description}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/80">
              {pillar.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function PillarsSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <h2 className="text-center text-3xl font-semibold text-foreground sm:text-4xl">
        What you study
      </h2>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((pillar, index) => (
          <PillarCard key={pillar.title} pillar={pillar} index={index} />
        ))}
      </div>
    </section>
  );
}
