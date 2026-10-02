"use client";

import { useEffect, useRef } from "react";

// The bar starts filling as the track's top edge enters the bottom of the viewport and is
// complete once that edge has risen to 30% down it, by which point the headline above is
// fully on screen. Scroll only drives the bar; the section itself scrolls like any other.
const START_AT = 0.95;
const END_AT = 0.3;

/**
 * A scroll-driven SRS timeline. Scroll position (both directions) scrubs a green bar along the
 * line, lighting each stage as the bar reaches it. The section is not pinned, so text and
 * layout scroll normally.
 *
 * Progress is written straight to the DOM (a CSS variable plus `data-reached` attributes)
 * instead of React state, so scrolling never re-renders anything and only `transform` and
 * `opacity` ever animate. Under `prefers-reduced-motion` the trail renders fully complete.
 */
export function SrsScrollTrail({
  stages,
}: {
  stages: readonly { name: string; color: string }[];
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const track = trackRef.current;
    if (!outer || !track) return;

    const stageNodes = outer.querySelectorAll<HTMLElement>("[data-stage]");
    const lastIndex = stages.length - 1;

    const apply = (progress: number) => {
      outer.style.setProperty("--srs-progress", progress.toFixed(4));
      outer.dataset.started = progress > 0.01 ? "true" : "false";
      stageNodes.forEach((node, index) => {
        node.dataset.reached = String(progress >= index / lastIndex - 0.001);
      });
    };

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      apply(1);
      return;
    }

    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      const top = track.getBoundingClientRect().top;
      const raw = (vh * START_AT - top) / (vh * (START_AT - END_AT));
      apply(Math.min(1, Math.max(0, raw)));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [stages.length]);

  return (
    <div
      ref={outerRef}
      className="flex flex-col items-center px-4 py-20 sm:px-6 sm:py-28"
      style={{ ["--srs-progress" as string]: 0 }}
    >
      <h2 className="max-w-3xl text-center text-3xl font-semibold text-balance text-foreground sm:text-4xl lg:text-5xl">
        An SRS schedule for everything you learn
      </h2>
      <p className="mt-4 max-w-xl text-center text-balance text-muted-foreground">
        Vocabulary and grammar move through the same nine stages. Answer
        correctly and an item advances; miss it and it comes back sooner.
      </p>

      <div className="mt-6 w-full max-w-4xl pr-12 pl-4 sm:mt-10 sm:pr-20 sm:pl-8">
        <div ref={trackRef} className="@container relative pt-28 sm:pt-36">
          <ol className="relative h-1.5 rounded-full bg-border">
            <li
              aria-hidden="true"
              className="absolute inset-0 origin-left rounded-full bg-primary"
              style={{ transform: "scaleX(var(--srs-progress))" }}
            />
            <li
              aria-hidden="true"
              className="absolute top-1/2 left-0 -mt-2.5 -ml-2.5 size-5"
              style={{
                transform: "translateX(calc(var(--srs-progress) * 100cqw))",
              }}
            >
              <span className="block size-full rounded-full bg-primary shadow-[0_0_0_6px_var(--background)]" />
            </li>

            {stages.map(({ name, color }, index) => (
              <li
                key={name}
                data-stage
                data-reached="false"
                className="group absolute top-1/2"
                style={{ left: `${(index / (stages.length - 1)) * 100}%` }}
              >
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-background"
                />
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-[var(--dur-base)] group-data-[reached=true]:opacity-100"
                  style={{ backgroundColor: color }}
                />
                <span
                  data-testid="srs-stage-name"
                  className="absolute bottom-0 left-0 mb-4 origin-bottom-left -rotate-45 text-xs font-medium whitespace-nowrap text-foreground opacity-40 transition-opacity duration-[var(--dur-base)] group-data-[reached=true]:opacity-100 sm:text-base"
                >
                  {name}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
