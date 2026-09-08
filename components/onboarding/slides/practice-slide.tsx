import { Check, Mic, Volume2 } from "lucide-react";

/**
 * Slide 3's visual demonstration (spec 15): speaking and listening practice,
 * shown as the real controls rather than a generic illustration — a mic
 * button, a live waveform, audio playback, and a correct-answer state.
 *
 * Purely visual, prop-free, and replaceable on its own (see
 * `welcome-slide.tsx` for the full rationale).
 */
const WAVE_BARS = [
  { height: "h-6", delay: "" },
  { height: "h-10", delay: "ob-delay-1" },
  { height: "h-14", delay: "ob-delay-2" },
  { height: "h-9", delay: "ob-delay-3" },
  { height: "h-5", delay: "ob-delay-4" },
  { height: "h-11", delay: "ob-delay-2" },
  { height: "h-7", delay: "ob-delay-1" },
] as const;

export function PracticeSlide() {
  return (
    <div aria-hidden="true" className="flex h-56 w-full flex-col items-center justify-center gap-4 sm:h-72 sm:gap-5">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-learning-vocabulary/20">
          <Volume2 className="h-4 w-4 text-learning-vocabulary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">&ldquo;¿Dónde está el agua?&rdquo;</span>
          <span className="block text-xs text-muted-foreground">Listen, then say it back</span>
        </span>
      </div>

      <div className="flex items-end justify-center gap-1.5" role="presentation">
        {WAVE_BARS.map((bar, index) => (
          <span
            key={index}
            className={`w-1.5 origin-bottom rounded-full bg-learning-vocabulary/70 animate-ob-wave ${bar.height} ${bar.delay}`}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground animate-ob-mic">
          <Mic className="h-5 w-5" />
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-state-success/15 px-3 py-1.5 text-xs font-medium text-foreground animate-ob-verdict">
          <Check className="h-3.5 w-3.5 text-state-success" />
          Nice pronunciation
        </span>
      </div>
    </div>
  );
}
