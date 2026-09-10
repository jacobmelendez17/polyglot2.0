"use client";

import { useState } from "react";

import { ExampleList } from "./example-list";
import { cn } from "@/lib/utils";

export type UsageContextExample = {
  targetText: string;
  translation: string;
  usageContext: { id: string; label: string; note: string | null } | null;
};

type UsageContextTabsProps = {
  examples: UsageContextExample[];
  usageContexts: { id: string; label: string; note: string | null }[];
};

/** Examples belonging to no context (spec 17) — everything authored before contexts existed, and anything deliberately general. */
const GENERAL = "general";

/**
 * A word's examples, grouped by how the word is actually used (spec 17):
 * `comer` shows `como`, `comes`, `come`, and General.
 *
 * Tabs only appear when there is more than one group to choose between. A
 * word with examples but no contexts — which is every word today — renders
 * exactly the flat list it always did, so the tabs are a thing that grows
 * out of the content rather than a chrome the content has to fill.
 *
 * A context with no examples yet is still offered: an empty tab says "this
 * form exists and nothing has been written for it", which is more useful to
 * a learner than the form silently not existing.
 */
export function UsageContextTabs({ examples, usageContexts }: UsageContextTabsProps) {
  const general = examples.filter((example) => example.usageContext === null);
  const tabs = [
    ...usageContexts.map((context) => ({
      id: context.id,
      label: context.label,
      note: context.note,
      examples: examples.filter((example) => example.usageContext?.id === context.id),
    })),
    ...(general.length > 0 ? [{ id: GENERAL, label: "General", note: null, examples: general }] : []),
  ];

  const [activeId, setActiveId] = useState(() => tabs[0]?.id ?? GENERAL);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (tabs.length === 0) return null;

  // One group needs no tablist — but it may still have something to say
  // about the form, and that description is content rather than chrome.
  if (tabs.length === 1) {
    const only = tabs[0]!;
    return (
      <div className="flex flex-col gap-2">
        {only.note ? <p className="text-xs text-muted-foreground">{only.note}</p> : null}
        <ExampleList examples={only.examples} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Usage" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`usage-tab-${tab.id}`}
            aria-selected={tab.id === active?.id}
            aria-controls={`usage-panel-${tab.id}`}
            onClick={() => setActiveId(tab.id)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors",
              tab.id === active?.id
                ? "border-accent-primary bg-accent-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-accent-primary/60",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active ? (
        <div role="tabpanel" id={`usage-panel-${active.id}`} aria-labelledby={`usage-tab-${active.id}`} className="flex flex-col gap-2">
          {active.note ? <p className="text-xs text-muted-foreground">{active.note}</p> : null}
          {active.examples.length > 0 ? (
            <ExampleList examples={active.examples} />
          ) : (
            <p className="text-sm text-muted-foreground">No examples for this form yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
