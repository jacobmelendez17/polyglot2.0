"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DeckAvailability } from "@/domains/decks";

export type AdminDeckLevelOption = { id: string; levelNumber: number };

type DeckAvailabilityFieldsProps = {
  availability: DeckAvailability;
  gateLevelId: string | null;
  levels: AdminDeckLevelOption[];
  onChange: (next: { availability: DeckAvailability; gateLevelId: string | null }) => void;
};

/**
 * Spec 14's two kinds of official deck, as one control pair.
 *
 * A **Theme** deck is visible immediately and shows each learner only the
 * items they have reached, growing on its own. A **Level** deck stays hidden
 * entirely until its Level is unlocked, then shows everything in it.
 * Choosing Level requires naming the Level — the database enforces the same
 * pairing, so an unpaired combination cannot be saved even if this UI were
 * bypassed.
 */
export function DeckAvailabilityFields({ availability, gateLevelId, levels, onChange }: DeckAvailabilityFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="font-medium text-foreground">Availability</span>
        <Select
          value={availability}
          onValueChange={(next) =>
            onChange(
              next === "level"
                ? { availability: "level", gateLevelId: gateLevelId ?? levels[0]?.id ?? null }
                : { availability: "theme", gateLevelId: null },
            )
          }
        >
          <SelectTrigger aria-label="Deck availability" className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="theme">Theme — visible now, reveals items as they are learned</SelectItem>
            <SelectItem value="level">Level — hidden until a Level is unlocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {availability === "level" ? (
        <div className="text-sm">
          <span className="font-medium text-foreground">Unlocked by level</span>
          <Select
            value={gateLevelId ?? ""}
            onValueChange={(levelId) => onChange({ availability: "level", gateLevelId: levelId })}
          >
            <SelectTrigger aria-label="Level that unlocks this deck" className="mt-1 w-full">
              <SelectValue placeholder="Choose a level" />
            </SelectTrigger>
            <SelectContent>
              {levels.map((level) => (
                <SelectItem key={level.id} value={level.id}>
                  Level {level.levelNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
