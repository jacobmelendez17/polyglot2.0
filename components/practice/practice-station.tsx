import Image from "next/image";

import type { PracticeTodayView } from "@/domains/practice";
import stationImage from "@/public/practice-station/station.png";
import trainImage from "@/public/practice-station/train.png";

import { PRACTICE_SKILL_ICONS } from "./practice-icons";

/*
 * Both drawings share one 2560×1440 canvas. The train was cut out of its own
 * canvas at y 607 (2560×833), so these percentages place it, its windows,
 * and its stripe exactly where they were drawn, at any size.
 */

/** The four passenger windows' glass, left to right — one per skill. y 229–444 on the train. */
const TRAIN_WINDOWS = [
  { left: "4.219%", width: "9.805%" }, // x 108–359
  { left: "30.977%", width: "16.563%" }, // x 793–1217
  { left: "51.172%", width: "16.563%" }, // x 1310–1734
  { left: "85.313%", width: "10.508%" }, // x 2184–2453
] as const;
const WINDOW_TOP = "27.491%";
const WINDOW_HEIGHT = "25.81%";

/** The blue livery stripe between the two doors: x 698–1832, y 514–608 on the train. */
const TRAIN_STRIPE = {
  left: "27.266%",
  width: "44.297%",
  top: "61.705%",
  height: "11.285%",
} as const;

/** Full width on narrow screens, then capped by `--station-h` (20rem × 16/9 ≈ 570px). */
const SCENE_SIZES = "(min-width: 640px) 570px, 100vw";

const sessionWord = (count: number) => (count === 1 ? "session" : "sessions");

type PracticeStationProps = { today: PracticeTodayView };

/**
 * The hub's station, straight on the page background: a train pulls in
 * carrying what the learner has done today, waits at the platform, and pulls
 * away again, on a loop. All motion is CSS (`globals.css`, "Practice
 * station"), so this stays a Server Component. The tally is real text in the
 * DOM, and the heading's summary repeats the total, so nothing depends on
 * catching the train.
 *
 * The scene spans the content column but is capped at `--station-h` tall, so
 * once the column is wider than the 16:9 drawing, the drawing sits toward the
 * right and repeatable strips cut from its own track band
 * (`track-left.png`, `track-right.png`) carry the rails to both margins. The
 * train runs the full width and fades in and out at the margins.
 */
export function PracticeStation({ today }: PracticeStationProps) {
  const { totalSessionCount } = today;

  return (
    <section
      aria-labelledby="practice-station-title"
      className="practice-station animate-practice-rise @container relative"
    >
      <div className="relative z-10 mb-3 flex flex-col gap-1 @min-[58rem]:absolute @min-[58rem]:top-2 @min-[58rem]:left-0 @min-[58rem]:mb-0 @min-[58rem]:max-w-[18rem]">
        <h2
          id="practice-station-title"
          className="font-heading text-xl font-semibold text-foreground"
        >
          Today&apos;s practice
        </h2>
        <p className="text-sm text-muted-foreground">
          {totalSessionCount === 0
            ? "Nothing practiced yet today. Finish any practice below and it shows up on the train."
            : `${totalSessionCount} ${sessionWord(totalSessionCount)} so far today.`}
        </p>
      </div>

      <div className="relative aspect-[16/9] max-h-(--station-h) w-full">
        <div className="practice-station-frame absolute inset-0 overflow-hidden">
          <div className="practice-station-scenery absolute inset-0 dark:invert-[0.9]">
            <div className="absolute bottom-0 left-0 h-1/6 w-[calc(100%-var(--station-w)-var(--station-edge))] bg-[url(/practice-station/track-left.png)] bg-[length:auto_100%] bg-right-bottom bg-repeat-x" />
            <div className="absolute right-0 bottom-0 h-1/6 w-(--station-edge) bg-[url(/practice-station/track-right.png)] bg-[length:auto_100%] bg-left-bottom bg-repeat-x" />
            <div className="absolute inset-y-0 right-(--station-edge) w-(--station-w)">
              <Image
                src={stationImage}
                alt=""
                fill
                sizes={SCENE_SIZES}
                preload
                className="practice-station-drawing"
              />
            </div>
          </div>

          <div className="animate-station-train absolute inset-x-0 bottom-0 h-[calc(var(--station-w)*833/2560)]">
            <div className="@container absolute inset-y-0 right-(--station-edge) w-(--station-w)">
              <div className="animate-station-train-body relative size-full">
                <Image
                  src={trainImage}
                  alt=""
                  fill
                  sizes={SCENE_SIZES}
                  loading="eager"
                />

                <p
                  aria-hidden="true"
                  className="absolute flex items-center justify-center font-heading text-[length:max(10px,1.9cqw)] font-semibold tracking-wide text-(--station-ink) uppercase @max-[24rem]:hidden"
                  style={TRAIN_STRIPE}
                >
                  Today · {totalSessionCount} {sessionWord(totalSessionCount)}
                </p>

                <ul aria-label="Sessions completed today, by skill">
                  {today.skills.map(({ skill, label, sessionCount }, index) => {
                    const Icon = PRACTICE_SKILL_ICONS[skill];
                    return (
                      <li
                        key={skill}
                        data-practice-tone={skill}
                        className="absolute flex items-center justify-center"
                        style={{
                          ...TRAIN_WINDOWS[index],
                          top: WINDOW_TOP,
                          height: WINDOW_HEIGHT,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="flex flex-col items-center rounded-[max(3px,0.5cqw)] border-[length:max(1px,0.13cqw)] border-t-[length:max(2px,0.4cqw)] border-(--station-ink) border-t-(--c) bg-(--station-card) px-[max(3px,0.9cqw)] py-[max(2px,0.4cqw)] leading-none text-(--station-ink)"
                        >
                          <span className="flex items-center gap-[max(1px,0.4cqw)]">
                            <Icon className="size-[max(9px,1.6cqw)]" />
                            <span className="font-heading text-[length:max(11px,2.4cqw)] font-semibold tabular-nums">
                              {sessionCount}
                            </span>
                          </span>
                          <span className="mt-[0.3cqw] text-[length:max(10px,1.15cqw)] @max-[34rem]:hidden">
                            {label}
                          </span>
                        </span>
                        <span className="sr-only">
                          {label}: {sessionCount} {sessionWord(sessionCount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
