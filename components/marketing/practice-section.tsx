import {
  BookOpenIcon,
  FileCheckIcon,
  HeadphonesIcon,
  MicIcon,
  NotebookPenIcon,
  RepeatIcon,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/shared/reveal";

type PracticeMode = {
  title: string;
  icon: LucideIcon;
  description: string;
};

const PRACTICE_MODES: PracticeMode[] = [
  {
    title: "Speaking",
    icon: MicIcon,
    description:
      "Repeat or respond to a prompt using your microphone. Your recording is checked by speech recognition and discarded afterward — it's never stored.",
  },
  {
    title: "Listening",
    icon: HeadphonesIcon,
    description:
      "Hear spoken Spanish and type or select what it means. Listening progress is tracked on its own, separate from your core review schedule.",
  },
  {
    title: "Reading",
    icon: BookOpenIcon,
    description:
      "Read passages built from content you've already learned, reinforcing vocabulary and grammar in context.",
  },
  {
    title: "Writing & journal",
    icon: NotebookPenIcon,
    description:
      "Write journal entries in Spanish and revisit them later. Your entries are saved to a personal archive you can browse anytime.",
  },
  {
    title: "Sentences & conjugation",
    icon: RepeatIcon,
    description:
      "Practice example sentences and verb conjugations tied to words you already know, with progress tracked separately from the base verb.",
  },
  {
    title: "Tests",
    icon: FileCheckIcon,
    description:
      "Check your progress with module, theme, and level-spanning tests. Review past attempts, see your scores, and retake tests to improve.",
  },
];

export function PracticeSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <h2 className="text-center text-3xl font-semibold text-foreground sm:text-4xl">
        Practice beyond reviews
      </h2>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PRACTICE_MODES.map((mode, index) => {
          const Icon = mode.icon;
          return (
            <Reveal key={mode.title} delayMs={index * 50}>
              <div
                data-testid="practice-card"
                tabIndex={0}
                className="h-full rounded-xl border border-border bg-card p-6 outline-none transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon
                  className="animate-bob h-6 w-6 text-primary"
                  aria-hidden="true"
                  style={{ animationDelay: `${(index % 3) * 150}ms` }}
                />
                <p className="mt-3 text-lg font-semibold text-foreground">{mode.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{mode.description}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
