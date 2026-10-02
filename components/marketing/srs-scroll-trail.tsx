"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// The line reaches the last stage at this fraction of the pinned scroll distance, then holds
// there briefly before the section unpins, so the final stage doesn't flash past.
const COMPLETE_AT = 0.9;

/**
 * A pinned, scroll-driven SRS timeline. The outer block is several viewports tall; the pane
 * inside is `sticky`, so the headline and track stay on screen while the visitor scrolls
 * through that extra height. Scroll position (both directions) scrubs a green bar along the
 * line, lighting each stage as the bar reaches it.
 *
 * Progress is written straight to the DOM (a CSS variable plus `data-reached` attributes)
 * instead of React state, so scrolling never re-renders anything and only `transform` and
 * `opacity` ever animate. Under `prefers-reduced-motion` the pin is removed and the trail
 * renders fully complete.
 */
export function SrsScrollTrail({
  stages,
}: {
  stages: readonly { name: string; color: string }[];
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const pane = paneRef.current;
    if (!outer || !pane) return;

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
      const stickyTop = parseFloat(getComputedStyle(pane).top) || 0;
      const distance = outer.offsetHeight - pane.offsetHeight;
      const scrolled = stickyTop - outer.getBoundingClientRect().top;
      const raw = distance > 0 ? scrolled / distance : 0;
      apply(Math.min(1, Math.max(0, raw / COMPLETE_AT)));
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
      data-started="false"
      className="relative h-[350svh] motion-reduce:h-auto"
      style={{ ["--srs-progress" as string]: 0 }}
    >
      <div
        ref={paneRef}
        className="sticky top-[var(--nav-h)] flex h-[calc(100svh-var(--nav-h))] flex-col items-center justify-center overflow-hidden px-4 sm:px-6 motion-reduce:static motion-reduce:h-auto motion-reduce:py-20"
      >
        <h2 className="max-w-3xl text-center text-3xl font-semibold text-balance text-foreground sm:text-4xl lg:text-5xl">
          An SRS schedule for everything you learn
        </h2>
        <p className="mt-4 max-w-xl text-center text-balance text-muted-foreground">
          Vocabulary and grammar move through the same nine stages. Answer
          correctly and an item advances; miss it and it comes back sooner.
        </p>

        <div className="mt-10 w-full max-w-4xl pr-12 pl-4 sm:mt-16 sm:pr-20 sm:pl-8">
          <div className="@container relative pt-28 sm:pt-36">
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

        <p
          aria-hidden="true"
          className={cn(
            "mt-12 text-sm text-muted-foreground transition-opacity duration-[var(--dur-base)] motion-reduce:hidden",
            "in-data-[started=true]:opacity-0",
          )}
        >
          Keep scrolling
        </p>
      </div>
    </div>
  );
}
