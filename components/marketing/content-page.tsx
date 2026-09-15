import type { ReactNode } from "react";

/**
 * Shared shell for simple, static marketing content pages (About, Feedback,
 * Privacy, Terms — spec 21). Keeps their heading/lede/container styling in
 * one place instead of four copies of the same Tailwind combination.
 */
export function ContentPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">{title}</h1>
      {lede ? <p className="mt-4 text-lg text-muted-foreground">{lede}</p> : null}
      <div className="mt-8 space-y-6">{children}</div>
    </section>
  );
}

export function ContentHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold text-foreground">{children}</h2>;
}

export function ContentParagraph({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-muted-foreground">{children}</p>;
}
