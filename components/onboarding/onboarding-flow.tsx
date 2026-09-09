"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { completeOnboardingAction } from "@/app/(onboarding)/onboarding/actions";
import { OnboardingNavigation } from "@/components/onboarding/onboarding-navigation";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { ONBOARDING_CONTENT_WIDTH } from "@/components/onboarding/onboarding-layout";
import { ONBOARDING_SLIDES } from "@/components/onboarding/onboarding-slides";
import { cn } from "@/lib/utils";

type OnboardingFlowProps = {
  /**
   * Sandbox replay (spec 15). Completion is previewed in full but never
   * written, and finishing returns to the Sandbox instead of the app. The
   * server action refuses to write in this mode too — this flag decides
   * presentation, not authorization.
   */
  isReplay: boolean;
};

/** How far a slide travels on entry/exit. Small on purpose: spec 15 asks for smooth transitions that never delay navigation. */
const SLIDE_OFFSET = 48;

/**
 * The onboarding slideshow (spec 15). This component owns exactly what the
 * spec says it should — the current slide, navigation, transition direction,
 * completion, and progress dots — and nothing about how any individual slide
 * looks. Slide visuals come from `ONBOARDING_SLIDES`, so replacing one
 * changes nothing here.
 *
 * No timers drive anything. The looping demonstrations are CSS animations
 * owned by the slide components, so this holds no interval to clear and
 * re-renders only when the learner actually navigates — never per animation
 * frame.
 *
 * Transitions never gate navigation: `AnimatePresence mode="popLayout"` lets
 * the next slide mount immediately, so a learner pressing Next repeatedly
 * moves at their own speed rather than the animation's.
 */
export function OnboardingFlow({ isReplay }: OnboardingFlowProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isCompleting, startCompleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isFirstSlide = index === 0;
  const isLastSlide = index === ONBOARDING_SLIDES.length - 1;
  const slide = ONBOARDING_SLIDES[index];

  const goBack = useCallback(() => {
    setDirection(-1);
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    setDirection(1);
    setIndex((current) => Math.min(ONBOARDING_SLIDES.length - 1, current + 1));
  }, []);

  const finish = useCallback(() => {
    setError(null);

    if (isReplay) {
      // Nothing is persisted for a replay — the preview ends by returning to
      // where it was launched from.
      router.replace("/admin/sandbox");
      return;
    }

    startCompleting(async () => {
      const result = await completeOnboardingAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Onboarding's last step is the curriculum choice (spec 16), not the
      // app: the learner picks how new words are introduced before their
      // first lesson exists.
      router.replace("/onboarding/curriculum");
    });
  }, [isReplay, router]);

  // Arrow-key navigation, on top of the natively focusable Back/Next buttons.
  // Registered once and removed on unmount, so nothing outlives the flow.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" && !isLastSlide) goNext();
      if (event.key === "ArrowLeft" && !isFirstSlide) goBack();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goNext, isFirstSlide, isLastSlide]);

  const Demonstration = slide.Demonstration;

  return (
    <div
      className={cn(
        "relative flex min-h-svh flex-col overflow-hidden transition-colors duration-(--dur-slow) ease-(--ease-soft) motion-reduce:transition-none",
        slide.theme,
      )}
    >
      {isReplay ? (
        <p className="bg-foreground/85 px-4 py-1.5 text-center text-xs font-medium text-background">
          Sandbox preview — finishing here will not change your onboarding status.
        </p>
      ) : null}

      {/* pb-28 keeps the last content clear of the sticky controls, so nothing
          is ever hidden behind them or requires scrolling to reach. */}
      <div className="flex flex-1 items-center justify-center px-5 pt-10 pb-28 sm:px-8">
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.section
            key={slide.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * SLIDE_OFFSET }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -SLIDE_OFFSET }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            aria-labelledby={`onboarding-heading-${slide.id}`}
            className={cn("flex w-full flex-col items-center gap-6 text-center", ONBOARDING_CONTENT_WIDTH)}
          >
            <Demonstration />

            <div className="flex flex-col gap-2">
              <h1
                id={`onboarding-heading-${slide.id}`}
                className="font-heading text-3xl font-semibold text-balance text-foreground sm:text-4xl"
              >
                {slide.heading}
              </h1>
              <p className="text-base text-pretty text-muted-foreground sm:text-lg">{slide.copy}</p>
            </div>
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-20 flex flex-col items-center gap-2 px-4 sm:bottom-24">
        {error ? (
          <p role="alert" className="pointer-events-auto rounded-lg bg-card px-3 py-1.5 text-sm text-state-error">
            {error}
          </p>
        ) : null}
        <OnboardingProgress currentIndex={index} total={ONBOARDING_SLIDES.length} />
      </div>

      <OnboardingNavigation
        isFirstSlide={isFirstSlide}
        isLastSlide={isLastSlide}
        isCompleting={isCompleting}
        onBack={goBack}
        onNext={goNext}
        onFinish={finish}
      />
    </div>
  );
}
