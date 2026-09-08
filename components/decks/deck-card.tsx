import Link from "next/link";
import { BookText, Layers, SpellCheck } from "lucide-react";

import { DECK_ACCENT_CLASSES, DECK_CONTENT_TYPE_LABELS } from "@/domains/decks";
import type { DeckContentType, DeckSummary } from "@/domains/decks";
import { cn } from "@/lib/utils";

/**
 * One deck on the `/decks` grid (spec 14): icon/color, name, short
 * description, item count, and deck type. The whole card is one link, so it
 * is keyboard reachable as a single control rather than a clickable `div`.
 *
 * Icon and color come from what the deck contains rather than a stored
 * per-deck choice — see `DECK_ACCENT_CLASSES` for why. The type is always
 * spelled out in text beneath the name, so the color is supporting
 * information only.
 */
const CONTENT_ICONS: Record<DeckContentType | "none", typeof BookText> = {
  vocabulary: BookText,
  grammar: SpellCheck,
  both: Layers,
  none: Layers,
};

type DeckCardProps = {
  deck: DeckSummary;
};

export function DeckCard({ deck }: DeckCardProps) {
  const accentKey = deck.contentType ?? "none";
  const accent = DECK_ACCENT_CLASSES[accentKey];
  const Icon = CONTENT_ICONS[accentKey];
  const typeLabel = deck.contentType ? DECK_CONTENT_TYPE_LABELS[deck.contentType] : "Empty";

  return (
    <Link
      href={`/decks/${deck.id}`}
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border-t-2 bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        accent.border,
      )}
    >
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accent.iconBackground)}>
        <Icon className={cn("h-5 w-5", accent.icon)} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-base font-semibold text-foreground">{deck.name}</h3>
        {deck.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{deck.description}</p> : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {deck.itemCount} {deck.itemCount === 1 ? "item" : "items"} · {typeLabel}
      </p>
    </Link>
  );
}
