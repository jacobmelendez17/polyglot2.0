"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { ONBOARDING_CONTENT_WIDTH } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OnboardingNavigationProps = {
  isFirstSlide: boolean;
  isLastSlide: boolean;
  isCompleting: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
};

/**
 * The sticky Back / Next controls (spec 15). Fixed to the bottom of the
 * viewport — so neither control can be pushed off-screen or require scrolling
 * to reach — but constrained to the same centred column as the slide content
 * (`ONBOARDING_CONTENT_WIDTH`) rather than pinned to the viewport's far
 * corners, so they sit with the slide they navigate instead of drifting away
 * from it on a wide display. Positions are identical on every slide, so
 * nothing shifts as the content behind them changes.
 *
 * On the final slide the right-hand control becomes `Start Now!`. It is
 * `key`ed on that transition, so React mounts a fresh element and the
 * one-shot CSS emphasis animation (`animate-ob-emphasis`: inflate, shrink
 * back, settle) runs exactly once when the slide becomes active — no timer,
 * no state flag, and nothing to clean up. Its accent colour changes in the
 * same moment.
 *
 * `Back` is disabled rather than removed on slide 1: keeping it in place
 * holds the layout still, and a disabled button is skipped by keyboard
 * navigation without the focus jump that removing it would cause.
 */
export function OnboardingNavigation({
  isFirstSlide,
  isLastSlide,
  isCompleting,
  onBack,
  onNext,
  onFinish,
}: OnboardingNavigationProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-4 sm:pb-6">
      <div className={cn("mx-auto flex w-full items-center justify-between gap-3", ONBOARDING_CONTENT_WIDTH)}>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="pointer-events-auto cursor-pointer"
          disabled={isFirstSlide}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>

        {isLastSlide ? (
          <Button
            // Mounting is the trigger for the one-shot emphasis animation.
            key="finish"
            type="button"
            size="lg"
            className={cn(
              "pointer-events-auto cursor-pointer bg-srs-fluent text-background hover:bg-srs-fluent/90",
              "animate-ob-emphasis",
            )}
            // Repeated clicks are already safe server-side; disabling while the
            // request is in flight just avoids firing pointless duplicates.
            disabled={isCompleting}
            onClick={onFinish}
          >
            Start Now!
          </Button>
        ) : (
          <Button type="button" size="lg" className="pointer-events-auto cursor-pointer" onClick={onNext}>
            Next
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
