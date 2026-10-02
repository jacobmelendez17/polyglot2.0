"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MotionConfig, motion } from "motion/react";

import { Reveal } from "@/components/shared/reveal";
import { cn } from "@/lib/utils";

const ROTATE_INTERVAL_MS = 5000;

type Language = "Spanish" | "Japanese" | "Korean";

type UserReview = {
  name: string;
  language: Language;
  duration: string;
  initials: string;
  rating: number;
  text: string;
};

// Placeholder reviews until real user feedback exists.
const REVIEWS: UserReview[] = [
  {
    name: "Maria S.",
    language: "Spanish",
    duration: "4 months",
    initials: "MS",
    rating: 5,
    text: "The spaced repetition finally made vocabulary stick. I actually look forward to my daily reviews now.",
  },
  {
    name: "Daniel K.",
    language: "Korean",
    duration: "2 months",
    initials: "DK",
    rating: 4,
    text: "Love the handwritten, notebook feel. It's the first language app that doesn't feel like a game show.",
  },
  {
    name: "Aiko T.",
    language: "Spanish",
    duration: "7 months",
    initials: "AT",
    rating: 5,
    text: "Typing answers instead of tapping choices is harder, but I remember so much more because of it.",
  },
  {
    name: "Luca R.",
    language: "Japanese",
    duration: "1 month",
    initials: "LR",
    rating: 5,
    text: "Lessons are short and clear, and the practice modes keep me from getting bored.",
  },
  {
    name: "Priya N.",
    language: "Spanish",
    duration: "3 months",
    initials: "PN",
    rating: 4,
    text: "Seeing my progress on the dashboard keeps me honest. Would love even more lessons!",
  },
];

// Position of a card relative to the one in the middle. Anything that is not
// the middle, left or right card waits "behind" the middle one, out of sight,
// so the card leaving on the left slides back behind the middle card and
// later re-enters from the right.
type Slot = "center" | "left" | "right" | "back";

function slotFor(offset: number, count: number): Slot {
  if (offset === 0) return "center";
  if (offset === 1) return "right";
  if (offset === count - 1) return "left";
  return "back";
}

const SLOT_Z: Record<Slot, string> = {
  center: "z-20",
  left: "z-10",
  right: "z-10",
  back: "pointer-events-none z-0",
};

// How far the side cards sit from the middle, in px. Narrow screens let the
// side cards peek out; wider ones show them almost in full.
function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getSideOffset(): number {
  const width = window.innerWidth;
  if (width >= 1024) return 256;
  if (width >= 640) return 208;
  return 128;
}

function getServerSideOffset(): number {
  return 208;
}

function slotTarget(slot: Slot, sideOffset: number) {
  switch (slot) {
    case "center":
      return { x: 0, scale: 1, opacity: 1 };
    case "left":
      return { x: -sideOffset, scale: 0.82, opacity: 0.6 };
    case "right":
      return { x: sideOffset, scale: 0.82, opacity: 0.6 };
    case "back":
      return { x: 0, scale: 0.6, opacity: 0 };
  }
}

const FLAG_LABELS: Record<Language, string> = {
  Spanish: "Spain flag",
  Japanese: "Japan flag",
  Korean: "South Korea flag",
};

function LanguageFlag({ language }: { language: Language }) {
  return (
    <svg
      viewBox="0 0 24 16"
      role="img"
      aria-label={FLAG_LABELS[language]}
      className="h-4 w-6 shrink-0 rounded-[3px] ring-1 ring-border"
    >
      {language === "Spanish" && (
        <>
          <rect width="24" height="16" fill="#c60b1e" />
          <rect y="4" width="24" height="8" fill="#ffc400" />
        </>
      )}
      {language === "Japanese" && (
        <>
          <rect width="24" height="16" fill="#ffffff" />
          <circle cx="12" cy="8" r="4.8" fill="#bc002d" />
        </>
      )}
      {language === "Korean" && (
        <>
          <rect width="24" height="16" fill="#ffffff" />
          <path d="M7.8 8a4.2 4.2 0 0 1 8.4 0Z" fill="#cd2e3a" />
          <path d="M7.8 8a4.2 4.2 0 0 0 8.4 0Z" fill="#0047a0" />
          <g stroke="#000000" strokeWidth="1" strokeLinecap="butt">
            <path d="M2.6 3.4l2.4-1.6M3.2 4.4l2.4-1.6M2 5.2l2.4-1.6" />
            <path d="M21.4 12.6l-2.4 1.6M20.8 11.6l-2.4 1.6M22 10.8l-2.4 1.6" />
            <path d="M19 1.8l2.4 1.6M18.4 2.8l2.4 1.6M19.6 1.4l2.4 1.6" />
            <path d="M5 14.2l-2.4-1.6M5.6 13.2L3.2 11.6M4.4 14.6L2 13" />
          </g>
        </>
      )}
    </svg>
  );
}

// Hand-drawn five-point star: deliberately uneven so it reads as sketched.
const STAR_PATH =
  "M12.2 2.6 L14.9 8.9 L21.4 9.4 L16.3 13.8 L17.9 20.4 L11.8 16.9 L6.1 20.6 L7.6 14 L2.4 9.9 L9.2 9.2 Z";

function SketchedStar({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        "size-5",
        filled ? "text-primary" : "text-muted-foreground/60",
      )}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={STAR_PATH}
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.35 : 0}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* A second, slightly offset pass gives the double-stroked pencil look. */}
      <path
        d={STAR_PATH}
        transform="translate(0.4 -0.3) rotate(1.5 12 12)"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SketchedRating({ rating }: { rating: number }) {
  return (
    <div
      role="img"
      aria-label={`${rating} out of 5 stars`}
      className="flex items-center"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <SketchedStar key={i} filled={i < rating} />
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  slot,
  sideOffset,
}: {
  review: UserReview;
  slot: Slot;
  sideOffset: number;
}) {
  const isCenter = slot === "center";

  return (
    <motion.article
      aria-hidden={!isCenter}
      data-slot={slot}
      initial={false}
      animate={slotTarget(slot, sideOffset)}
      transition={{ duration: 0.9, ease: [0.45, 0, 0.2, 1] }}
      className={cn(
        "absolute inset-x-0 top-0 mx-auto flex h-full w-72 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm sm:w-80 sm:p-6",
        SLOT_Z[slot],
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {review.name}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <LanguageFlag language={review.language} />
            <span className="truncate">{review.duration}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
          >
            {review.initials}
          </div>
          <SketchedRating rating={review.rating} />
        </div>
      </header>
      <p className="mt-4 text-foreground">{review.text}</p>
    </motion.article>
  );
}

export function ReviewPreviewSection() {
  // Index of the review currently in the middle.
  const [active, setActive] = useState(0);
  const sideOffset = useSyncExternalStore(
    subscribeToResize,
    getSideOffset,
    getServerSideOffset,
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      // The right card slides left into the middle, the middle card slides
      // left out of the middle, and the left card slides back behind the
      // others to re-enter on the right.
      setActive((current) => (current + 1) % REVIEWS.length);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <h2 className="text-center text-3xl font-semibold text-foreground sm:text-4xl">
        User reviews
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
        Hear from learners who have made Polyglot part of their routine.
      </p>

      <Reveal className="mt-10">
        <MotionConfig reducedMotion="user">
          <div
            role="group"
            aria-roledescription="carousel"
            aria-label="User reviews"
            className="relative mx-auto h-60 w-full overflow-hidden py-1 sm:h-56"
          >
            {REVIEWS.map((review, index) => (
              <ReviewCard
                key={review.name}
                review={review}
                slot={slotFor(
                  (index - active + REVIEWS.length) % REVIEWS.length,
                  REVIEWS.length,
                )}
                sideOffset={sideOffset}
              />
            ))}
          </div>
        </MotionConfig>
      </Reveal>
    </section>
  );
}
