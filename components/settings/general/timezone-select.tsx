"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { updateTimezoneAction } from "@/app/(app)/settings/general/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getSupportedTimezones } from "@/lib/time/timezones";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

const ALL_TIMEZONES = getSupportedTimezones();

type TimezoneSelectProps = {
  initialTimezone: string;
};

/**
 * Spec 20 General — Timezone: "provide a searchable/selectable IANA
 * timezone dropdown." Built on the existing `Popover` + a plain filtered
 * list rather than adding a combobox/`cmdk` dependency — ~400 flat text
 * options need nothing more than a text filter over an array.
 */
export function TimezoneSelect({ initialTimezone }: TimezoneSelectProps) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [savedTimezone, setSavedTimezone] = useState(initialTimezone);
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return ALL_TIMEZONES;
    return ALL_TIMEZONES.filter((timezone) =>
      timezone.toLowerCase().includes(normalized),
    );
  }, [query]);

  async function handleSelect(timezone: string) {
    setOpen(false);
    setQuery("");
    if (timezone === savedTimezone) return;

    setState("saving");
    setErrorMessage(null);
    const result = await updateTimezoneAction({ timezone });

    if (!result.ok) {
      setState("error");
      setErrorMessage(result.error.message);
      return;
    }

    setSavedTimezone(result.data.timezone);
    setState("saved");
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      {/* A plain span, not a <label for>: a `<label>` associated with a
          button overrides the button's own text as its accessible name, so
          the announced name would always be "Timezone" and never include
          the selected value. `aria-label` on the trigger combines both. */}
      <span id={triggerId} className="text-sm font-medium text-foreground">
        Timezone
      </span>
      <div className="mt-2">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              aria-label={`Timezone, ${savedTimezone}`}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal sm:max-w-xs"
              disabled={state === "saving"}
            >
              {savedTimezone}
              <ChevronsUpDown
                className="h-4 w-4 opacity-50"
                aria-hidden="true"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="border-b border-border p-2">
              <Input
                autoFocus
                placeholder="Search timezones…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search timezones"
              />
            </div>
            <div
              role="listbox"
              aria-label="Timezone"
              className="max-h-64 overflow-y-auto p-1"
            >
              {filtered.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No timezones match.
                </p>
              ) : (
                filtered.map((timezone) => (
                  <button
                    key={timezone}
                    type="button"
                    role="option"
                    aria-selected={timezone === savedTimezone}
                    onClick={() => handleSelect(timezone)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                      timezone === savedTimezone &&
                        "font-semibold text-foreground",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        timezone === savedTimezone
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                    {timezone}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <p className="mt-2 text-sm" aria-live="polite">
        {state === "saving" && (
          <span className="text-muted-foreground">Saving…</span>
        )}
        {state === "saved" && <span className="text-state-success">Saved</span>}
        {state === "error" && (
          <span className="text-destructive">
            {errorMessage ?? "Could not save setting."}
          </span>
        )}
      </p>
    </div>
  );
}
