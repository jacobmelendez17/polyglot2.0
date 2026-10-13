import Image from "next/image";

import type { PracticeTodayView } from "@/domains/practice";
import stationImage from "@/public/practice-station/station.png";
import trainImage from "@/public/practice-station/train.png";

/** Full width on narrow screens, then capped by `--station-h` (20rem × 16/9 ≈ 570px). */
const SCENE_SIZES = "(min-width: 640px) 570px, 100vw";

const sessionWord = (count: number) => (count === 1 ? "session" : "sessions");

type PracticeStationProps = { today: PracticeTodayView };

/**
 * The hub's station, outlined but transparent to the page background: a
 * train pulls in, waits at the platform, and pulls away again, on a loop. All
 * motion is CSS (`globals.css`, "Practice station"), so this stays a Server
 * Component. For now the scene is art only; today's total is in the heading.
 *
 * The scene spans the content column but is capped at `--station-h` tall, so
 * once the column is wider than the 16:9 drawing, the drawing sits toward the
 * right and repeatable strips cut from its own track band
 * (`track-left.png`, `track-right.png`) carry the rails to both sides. The
 * train runs the full width and is clipped by the outline, like a window.
 *
 * Both drawings share one 2560×1440 canvas; the train was cut out of its own
 * at y 607 (2560×833), so it sits on the bottom of the station's box.
 */
export function PracticeStation({ today }: PracticeStationProps) {
  const { totalSessionCount } = today;

  return (
    <section
      aria-labelledby="practice-station-title"
      className="practice-station animate-practice-rise @container relative"
    >
      <div className="relative z-10 mb-3 flex flex-col gap-1 @min-[58rem]:absolute @min-[58rem]:top-5 @min-[58rem]:left-6 @min-[58rem]:mb-0 @min-[58rem]:max-w-[18rem]">
        <h2
          id="practice-station-title"
          className="font-heading text-xl font-semibold text-foreground"
        >
          Today&apos;s practice
        </h2>
        <p className="text-sm text-muted-foreground">
          {totalSessionCount === 0
            ? "Nothing practiced yet today. Finish any practice below to get started."
            : `${totalSessionCount} ${sessionWord(totalSessionCount)} so far today.`}
        </p>
      </div>

      <div className="practice-station-frame relative aspect-[16/9] max-h-(--station-h) w-full overflow-hidden">
        <div className="absolute inset-0 dark:invert-[0.9]">
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
          <div className="absolute inset-y-0 right-(--station-edge) w-(--station-w)">
            <div className="animate-station-train-body relative size-full">
              <Image
                src={trainImage}
                alt=""
                fill
                sizes={SCENE_SIZES}
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
