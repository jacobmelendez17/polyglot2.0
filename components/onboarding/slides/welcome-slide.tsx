/**
 * Slide 1's visual demonstration (spec 15). A looping, non-interactive
 * introduction: greetings drifting around a softly pulsing ring.
 *
 * This component owns nothing but its own visuals. It receives no props,
 * holds no state, and knows nothing about navigation, progress, or
 * completion — so replacing it with an SVG, a Lottie file, a video, or an
 * image sequence means changing one entry in `onboarding-slides.ts` and
 * nothing else.
 */
const GREETINGS = [
  "Hola",
  "Buenos días",
  "¿Qué tal?",
  "Bienvenido",
  "Gracias",
] as const;

export function WelcomeSlide() {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-56 w-full items-center justify-center sm:h-72"
    >
      {/* Two rings on the same loop, offset, so the pulse reads as continuous. */}
      <span className="absolute h-32 w-32 rounded-full border-2 border-primary/40 animate-ob-ring sm:h-40 sm:w-40" />
      <span className="absolute h-32 w-32 rounded-full border-2 border-primary/40 animate-ob-ring ob-delay-3 sm:h-40 sm:w-40" />

      <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 sm:h-24 sm:w-24">
        <span className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          ¡Hola!
        </span>
      </span>

      {GREETINGS.map((greeting, index) => (
        <span
          key={greeting}
          className={`absolute rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10 animate-float sm:text-sm ${GREETING_POSITIONS[index]} ${DELAY_CLASSES[index % DELAY_CLASSES.length]}`}
        >
          {greeting}
        </span>
      ))}
    </div>
  );
}

/** Fixed positions rather than randomised ones, so the composition is identical on every render and between server and client. */
const GREETING_POSITIONS = [
  "left-2 top-6 sm:left-10",
  "right-2 top-12 sm:right-12",
  "bottom-8 left-6 sm:left-16",
  "bottom-4 right-6 sm:right-20",
  "left-1/2 top-0 -translate-x-1/2",
] as const;

const DELAY_CLASSES = [
  "",
  "ob-delay-1",
  "ob-delay-2",
  "ob-delay-3",
  "ob-delay-4",
] as const;
