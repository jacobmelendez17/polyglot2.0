import { Archive } from "lucide-react";

import { ItemNavigation } from "./item-navigation";
import { PronunciationButton } from "@/components/shared/pronunciation-button";
import type { CurriculumStatus, ItemDetailView, ItemNavigationView } from "@/domains/curriculum";
import { cn } from "@/lib/utils";

type ItemHeroProps = {
  view: ItemDetailView;
  navigation: ItemNavigationView | null;
  languageCode: string;
  /** Absent in a lesson: an item there has no learner-facing curriculum status to report. */
  status?: CurriculumStatus;
  /** Item page: arrows are links to another item route. */
  hrefForItem?: (itemId: string) => string;
  /** Lesson: arrows move within the session and deliberately have no URL. */
  onNavigate?: (itemId: string) => void;
};

const CATEGORY_ACCENT: Record<ItemDetailView["type"], string> = {
  vocabulary: "text-learning-vocabulary",
  grammar: "text-learning-grammar",
};

/**
 * Spec 18's hero: the kicker line (`Vocabulary Info` / `A1 - Level 1 - 1/12`)
 * top-left, the item large and centered with its translation beneath, and a
 * large minimal arrow on each side.
 *
 * Deliberately *not* a `"use client"` module. It renders inside a server tree
 * on the item page and inside a client tree during a lesson, and the two pass
 * different navigation props — a link resolver or a callback. Marking it as a
 * client component would break the page, because a function prop cannot cross
 * the server-to-client boundary.
 *
 * The CEFR band is omitted rather than guessed when the level has none: see
 * `cefrLevelEnum`.
 */
export function ItemHero({ view, navigation, languageCode, status, hrefForItem, onNavigate }: ItemHeroProps) {
  const locationParts = [
    view.cefrLevel,
    `Level ${view.levelNumber}`,
    navigation ? `${navigation.position}/${navigation.total}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <header className="mx-auto w-full max-w-5xl px-4 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-12">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className={cn("font-heading text-lg font-semibold sm:text-xl", CATEGORY_ACCENT[view.type])}>{view.kindLabel}</p>
        {status === "archived" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <Archive className="h-3 w-3" aria-hidden="true" />
            Archived
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">{locationParts.join(" · ")}</p>

      <div className="mt-6 flex items-center justify-between gap-2 sm:mt-10 sm:gap-4">
        {navigation ? (
          <ItemNavigation navigation={navigation} direction="previous" hrefForItem={hrefForItem} onNavigate={onNavigate} />
        ) : (
          // A placeholder keeps the item optically centered when there is
          // nowhere to navigate, rather than letting it drift left.
          <div className="h-11 w-11 shrink-0 sm:h-14 sm:w-14" aria-hidden="true" />
        )}

        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="font-heading text-4xl font-semibold break-words text-foreground sm:text-6xl lg:text-7xl">{view.headline}</h1>
            {view.pronunciation ? (
              <PronunciationButton
                text={view.pronunciation.spokenText}
                languageCode={languageCode}
                audioUrl={view.pronunciation.audioUrl}
                label={view.headline}
              />
            ) : null}
          </div>
          <p className="text-lg text-muted-foreground sm:text-2xl">{view.translation}</p>
        </div>

        {navigation ? (
          <ItemNavigation navigation={navigation} direction="next" hrefForItem={hrefForItem} onNavigate={onNavigate} />
        ) : (
          <div className="h-11 w-11 shrink-0 sm:h-14 sm:w-14" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}
