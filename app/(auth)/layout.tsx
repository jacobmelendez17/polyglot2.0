import type { ReactNode } from "react";
import Link from "next/link";

const FEATURES = [
  "A structured curriculum built around spaced repetition",
  "Vocabulary and grammar taught side by side, not as separate tracks",
  "Progress that syncs across every device",
] as const;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col gap-10 px-4 py-12 sm:px-6 lg:justify-center lg:px-16">
        <Link href="/" className="font-heading text-lg font-semibold text-foreground">
          Polyglot
        </Link>
        <div className="flex flex-1 items-center justify-center lg:flex-none">{children}</div>
      </div>

      <div className="hidden flex-col justify-center gap-6 border-l border-border bg-secondary px-16 py-12 lg:flex">
        <p className="max-w-sm font-heading text-2xl text-foreground">
          Learn Spanish the way it actually sticks.
        </p>
        <ul className="flex max-w-sm flex-col gap-3 text-sm text-muted-foreground">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">
                &bull;
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
