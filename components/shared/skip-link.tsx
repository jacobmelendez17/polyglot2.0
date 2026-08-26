export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[var(--z-skip)] focus-visible:rounded-xl focus-visible:border focus-visible:border-border focus-visible:bg-card focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-card-foreground focus-visible:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      Skip to main content
    </a>
  );
}
