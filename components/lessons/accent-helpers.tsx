type AccentHelpersProps = {
  characters: readonly string[];
  onInsert: (character: string) => void;
};

/**
 * Language-configurable character helpers (spec 07 §27). No bordered chip,
 * filled background, or button surface — spacing and hover/focus state
 * alone distinguish them. Each glyph keeps a 44px touch target even though
 * the visible character is smaller.
 */
export function AccentHelpers({ characters, onInsert }: AccentHelpersProps) {
  if (characters.length === 0) return null;

  return (
    <div role="group" aria-label="Character helpers" className="flex flex-wrap justify-center gap-1">
      {characters.map((character) => (
        <button
          key={character}
          type="button"
          onClick={() => onInsert(character)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {character}
        </button>
      ))}
    </div>
  );
}
