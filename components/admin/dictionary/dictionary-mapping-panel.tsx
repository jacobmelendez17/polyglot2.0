"use client";

import { useState, useTransition } from "react";
import { BookOpen, Check, Lock, RefreshCw } from "lucide-react";

import {
  confirmMappingAction,
  rematchVocabularyItemAction,
  selectPronunciationAction,
  selectSensesAction,
} from "@/app/(admin)/admin/dictionary/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { REVIEW_REASON_LABELS } from "@/domains/lexicon";
import type {
  DictionaryEntryDetail,
  DictionaryMatchStatus,
  VocabularyDictionaryMapping,
} from "@/domains/lexicon";

import { ChangeMappingDialog } from "./change-mapping-dialog";
import { MappingStatusBadge } from "./mapping-status-badge";
import { RawSourceDialog } from "./raw-source-dialog";
import { RegionalEvidenceBadge } from "./regional-evidence-badge";

/**
 * Spec 12 "Admin UI Integration" — the Dictionary controls on the vocabulary
 * editor. Renders the spec's own worked example: display word, lookup form,
 * matched entry, status and confidence, regional evidence, selectable
 * definitions, a pronunciation choice, and the two escape hatches (change
 * mapping, view raw source).
 *
 * Everything shown here is *dictionary* content, visually separated from the
 * Polyglot-authored curriculum fields above it and labelled with its source
 * attribution — spec 12 requires the two stay distinguishable, and requires
 * that a dictionary definition never silently becomes Polyglot's teaching
 * explanation. Selecting a sense records what this item *teaches*; it never
 * writes a curriculum field.
 */

type DictionaryMappingPanelProps = {
  vocabularyItemId: string;
  languageId: string;
  displayWord: string;
  mapping: VocabularyDictionaryMapping | null;
  entry: DictionaryEntryDetail | null;
  selectedSenseIds: string[];
  attributionText: string | null;
};

function statusHint(status: DictionaryMatchStatus | null): string {
  switch (status) {
    case "source_data_not_imported":
      return "No dictionary data has been imported for this word yet. Run `npm run lexicon:import` to fetch it.";
    case "unmatched":
      return "The dictionary source was searched and had no suitable entry. You can still map one manually.";
    case "review_required":
      return "This match needs a decision before it can be trusted.";
    case "auto_matched":
      return "Matched automatically. Confirm it to lock it against future imports.";
    case "manual":
      return "Set manually. Future imports can update this entry's content, but cannot repoint this item.";
    default:
      return "This item has not been matched against the dictionary yet.";
  }
}

export function DictionaryMappingPanel({
  vocabularyItemId,
  languageId,
  displayWord,
  mapping,
  entry,
  selectedSenseIds,
  attributionText,
}: DictionaryMappingPanelProps) {
  const [selectedSenses, setSelectedSenses] =
    useState<string[]>(selectedSenseIds);
  const [preferredPronunciationId, setPreferredPronunciationId] = useState<
    string | null
  >(mapping?.preferredPronunciationId ?? null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSense(senseId: string) {
    const next = selectedSenses.includes(senseId)
      ? selectedSenses.filter((id) => id !== senseId)
      : [...selectedSenses, senseId];
    setSelectedSenses(next);
    startTransition(async () => {
      const result = await selectSensesAction({
        vocabularyItemId,
        senseIds: next,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.ok) {
        setFeedback({
          tone: "success",
          message: "Selected definitions saved.",
        });
      } else {
        // Roll the optimistic toggle back — the server is authoritative.
        setSelectedSenses(selectedSenses);
        setFeedback({ tone: "error", message: result.error.message });
      }
    });
  }

  function choosePronunciation(pronunciationId: string | null) {
    const previous = preferredPronunciationId;
    setPreferredPronunciationId(pronunciationId);
    startTransition(async () => {
      const result = await selectPronunciationAction({
        vocabularyItemId,
        pronunciationId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.ok) {
        setFeedback({
          tone: "success",
          message: "Preferred pronunciation saved.",
        });
      } else {
        setPreferredPronunciationId(previous);
        setFeedback({ tone: "error", message: result.error.message });
      }
    });
  }

  function confirm() {
    startTransition(async () => {
      const result = await confirmMappingAction({
        vocabularyItemId,
        idempotencyKey: crypto.randomUUID(),
      });
      setFeedback(
        result.ok
          ? { tone: "success", message: "Mapping confirmed and locked." }
          : { tone: "error", message: result.error.message },
      );
    });
  }

  function rematch() {
    startTransition(async () => {
      const result = await rematchVocabularyItemAction({
        vocabularyItemId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error.message });
        return;
      }
      setFeedback({
        tone: "success",
        message: result.data.skippedBecauseLocked
          ? "This mapping is locked, so it was left as it is."
          : "Matching re-run. Reload to see the result.",
      });
    });
  }

  return (
    <section
      aria-labelledby="dictionary-mapping-heading"
      className="rounded-xl border border-dashed border-border bg-muted/20 p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <h3
            id="dictionary-mapping-heading"
            className="text-sm font-semibold text-foreground"
          >
            Dictionary mapping
          </h3>
          <MappingStatusBadge
            status={mapping?.matchStatus ?? null}
            confidence={mapping?.confidence}
          />
          {mapping?.manualLock ? (
            <Lock
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label="Locked against automatic replacement"
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={rematch}
            disabled={isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Re-run matching
          </Button>
          <ChangeMappingDialog
            vocabularyItemId={vocabularyItemId}
            languageId={languageId}
            displayWord={displayWord}
            currentEntryId={entry?.id ?? null}
          />
          {entry ? (
            <RawSourceDialog entryId={entry.id} lemma={entry.lemma} />
          ) : null}
        </div>
      </div>

      <dl className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Display</dt>
        <dd className="text-foreground">{displayWord}</dd>
        <dt className="text-muted-foreground">Lookup</dt>
        <dd className="font-mono text-xs text-foreground">
          {mapping?.lookupForm ?? "—"}
        </dd>
        <dt className="text-muted-foreground">Entry</dt>
        <dd className="text-foreground">
          {entry ? (
            <>
              {entry.lemma}{" "}
              <span className="text-muted-foreground">
                · {entry.partOfSpeech}
              </span>
            </>
          ) : (
            "—"
          )}
        </dd>
      </dl>

      <p className="mb-3 text-xs text-muted-foreground">
        {mapping?.reviewReason
          ? `${REVIEW_REASON_LABELS[mapping.reviewReason]}. `
          : ""}
        {statusHint(mapping?.matchStatus ?? null)}
      </p>

      {entry && entry.regionalEvidence.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1">
          {entry.regionalEvidence.map((evidence) => (
            <RegionalEvidenceBadge
              key={evidence.regionCode}
              regionCode={evidence.regionCode}
              status={evidence.status}
              matchedForm={evidence.matchedForm}
            />
          ))}
        </div>
      ) : null}

      {entry ? (
        <>
          <fieldset className="mb-3">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">
              Definitions this item teaches
            </legend>
            <ul className="space-y-1">
              {entry.senses.map((sense) => (
                <li key={sense.id} className="flex items-start gap-2">
                  <Checkbox
                    id={`sense-${sense.id}`}
                    checked={selectedSenses.includes(sense.id)}
                    onCheckedChange={() => toggleSense(sense.id)}
                    disabled={isPending}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={`sense-${sense.id}`}
                    className="text-sm text-foreground"
                  >
                    {sense.gloss}
                    {sense.tags.length > 0 ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({sense.tags.join(", ")})
                      </span>
                    ) : null}
                    {sense.sourceStatus === "missing_from_source" ? (
                      <span className="ml-1 text-xs text-state-warning">
                        — no longer in the source
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          {entry.pronunciations.length > 0 ? (
            <fieldset className="mb-3">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">
                Preferred pronunciation
              </legend>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="preferred-pronunciation"
                    checked={preferredPronunciationId === null}
                    onChange={() => choosePronunciation(null)}
                    disabled={isPending}
                    className="h-4 w-4"
                  />
                  None
                </label>
                {entry.pronunciations.map((pronunciation) => (
                  <label
                    key={pronunciation.id}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="radio"
                      name="preferred-pronunciation"
                      checked={preferredPronunciationId === pronunciation.id}
                      onChange={() => choosePronunciation(pronunciation.id)}
                      disabled={isPending}
                      className="h-4 w-4"
                    />
                    <span className="font-mono text-xs">
                      {pronunciation.ipa ?? "audio only"}
                    </span>
                    {pronunciation.regionCode ? (
                      <span className="text-xs text-muted-foreground">
                        {pronunciation.regionCode}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {entry.forms.length > 0 || entry.relations.length > 0 ? (
            <dl className="mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              {entry.forms.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Forms</dt>
                  <dd className="text-foreground">
                    {entry.forms.map((form) => form.form).join(", ")}
                  </dd>
                </>
              ) : null}
              {entry.relations.some(
                (relation) => relation.relationType === "synonym",
              ) ? (
                <>
                  <dt className="text-muted-foreground">Synonyms</dt>
                  <dd className="text-foreground">
                    {entry.relations
                      .filter((relation) => relation.relationType === "synonym")
                      .map((relation) => relation.targetLemma)
                      .join(", ")}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}

          {mapping && !mapping.manualLock ? (
            <Button
              type="button"
              size="sm"
              onClick={confirm}
              disabled={isPending}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Confirm this mapping
            </Button>
          ) : null}
        </>
      ) : null}

      {feedback ? (
        <p
          role="status"
          className={
            feedback.tone === "error"
              ? "mt-3 text-sm text-state-error"
              : "mt-3 text-sm text-state-success"
          }
        >
          {feedback.message}
        </p>
      ) : null}

      {attributionText ? (
        <p className="mt-3 text-xs text-muted-foreground">{attributionText}</p>
      ) : null}
    </section>
  );
}
