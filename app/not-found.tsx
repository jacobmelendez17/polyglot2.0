import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import notFoundIllustration from "@/public/404.png";

export const metadata: Metadata = {
  title: "Page not found — Polyglot",
  description: "The page you're looking for doesn't exist.",
};

/**
 * The app-wide 404 (Next's own "not-found.js" convention — this renders
 * inside the root layout, for both a thrown `notFound()` in any segment and
 * a genuinely unmatched URL, replacing Next's plain default page).
 *
 * The root layout's `body` carries the graph-paper grid background
 * (`globals.css`) everywhere by default. The illustration's own background
 * is transparent, so left alone the grid would show straight through it —
 * `ui-context.md`'s own documented escape hatch is exactly this: "Cards and
 * primary content surfaces may obscure the grid with solid surfaces." This
 * page is that one solid surface, full-viewport and opaque, so nothing
 * behind the artwork shows but the flat background color.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-16 text-center">
      <Image
        src={notFoundIllustration}
        alt="Two illustrated characters digging a hole in the road, blocked off by a construction barrier"
        className="h-auto w-full max-w-sm sm:max-w-md"
        priority
      />
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          Page not found
        </h1>
        <p className="text-base text-muted-foreground">
          We couldn&apos;t find the page you&apos;re looking for.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
