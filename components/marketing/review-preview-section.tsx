"use client";

import { useEffect, useState } from "react";

import { Reveal } from "@/components/shared/reveal";
import { cn } from "@/lib/utils";

const ROTATE_INTERVAL_MS = 5000;

type UserReview = {
  name: string;
  detail: string;
  initials: string;
  rating: number;
  text: string;
};

// Placeholder reviews until real user feedback exists.
const REVIEWS: UserReview[] = [
  {
    name: "Maria S.",
    detail: "Learning Spanish · 4 months",
    initials: "MS",
    rating: 5,
    text: "The spaced repetition finally made vocabulary stick. I actually look forward to my daily reviews now.",
  },
  {
    name: "Daniel K.",
    detail: "Learning Korean · 2 months",
    initials: "DK",
    rating: 4,
    text: "Love the handwritten, notebook feel. It's the first language app that doesn't feel like a game show.",
  },
  {
    name: "Aiko T.",
    detail: "Learning Spanish · 7 months",
    initials: "AT",
    rating: 5,
    text: "Typing answers instead of tapping choices is harder, but I remember so much more because of it.",
  },
  {
    name: "Luca R.",
    detail: "Learning Japanese · 1 month",
    initials: "LR",
    rating: 5,
    text: "Lessons are short and clear, and the practice modes keep me from getting bored.",
  },
  {
    name: "Priya N.",
    detail: "Learning Spanish · 3 months",
    initials: "PN",
    rating: 4,
    text: "Seeing my progress on the dashboard keeps me honest. Would love even more lessons!",
  },
];

// Position of a card relative to the one in the middle. Anything that is not
// the middle, left or right card waits "behind" the middle one, out of sight,
// so a card leaving the right edge swings round the back and re-enters left.
type Slot = "center" | "left" | "right" | "back";

function slotFor(offset: number, count: number): Slot {
  if (offset === 0) return "center";
  if (offset === 1) return "right";
  if (offset === count - 1) return "left";
  return "back";
}

const SLOT_CLASSES: Record<Slot, string> = {
  center: "z-20 -translate-x-1/2 scale-100 opacity-100",
  left: "z-10 -translate-x-[calc(50%+8rem)] scale-[0.82] opacity-60 sm:-translate-x-[calc(50%+13rem)] lg:-translate-x-[calc(50%+16rem)]",
  right:
    "z-10 translate-x-[calc(-50%+8rem)] scale-[0.82] opacity-60 sm:translate-x-[calc(-50%+13rem)] lg:translate-x-[calc(-50%+16rem)]",
  back: "pointer-events-none z-0 -translate-x-1/2 scale-[0.6] opacity-0",
};

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

function ReviewCard({ review, slot }: { review: UserReview; slot: Slot }) {
  const isCenter = slot === "center";

  return (
    <article
      aria-hidden={!isCenter}
      data-slot={slot}
      className={cn(
        "absolute top-0 left-1/2 flex h-full w-72 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm sm:w-80 sm:p-6",
        "transition-[transform,opacity] duration-[var(--dur-slow)] ease-[var(--ease-out)] motion-reduce:transition-none",
        SLOT_CLASSES[slot],
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {review.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {review.detail}
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
    </article>
  );
}

export function ReviewPreviewSection() {
  // Index of the review currently in the middle.
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      // Stepping backwards moves the left card into the middle, the middle
      // card to the right, and the right card round the back.
      setActive((current) => (current - 1 + REVIEWS.length) % REVIEWS.length);
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
            />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
