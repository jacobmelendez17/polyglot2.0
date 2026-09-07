import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GrammarItemDetail } from "@/components/items/grammar-item-detail";
import { VocabularyItemDetail } from "@/components/items/vocabulary-item-detail";
import { getLearningItem, getLearningItemExamples, getLevelById } from "@/domains/curriculum/server";
import { getVocabularyDetail } from "@/domains/lexicon/server";
import { getItemProgress } from "@/domains/progress/server";
import { requireUser } from "@/domains/users/server";

type ItemDetailPageProps = {
  params: Promise<{ itemId: string }>;
};

// Permissive UUID-shape check, matching the `uuidLike` pattern already
// duplicated locally in `curriculum-admin-schemas.ts`/`curriculum-mutation-schemas.ts`/
// `audit-schemas.ts`/`lexicon-schemas.ts` — this codebase's seeded fixture ids
// are valid Postgres `uuid` values but not RFC 4122 version/variant
// compliant, so `z.uuid()` would reject real data. Checked before any query
// runs so a malformed id 404s cleanly instead of surfacing a raw Postgres
// "invalid input syntax for type uuid" error.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A learner can only ever have organically reached a published or archived
// item, via a level, lesson, or review link — draft/pending items have
// never been shown to any learner, so they 404 exactly like a missing id
// (spec 13: "invalid item ID" / "missing item" / "archived item where
// still referenceable").
const VIEWABLE_STATUSES = new Set(["published", "archived"]);

export async function generateMetadata({ params }: ItemDetailPageProps): Promise<Metadata> {
  const { itemId } = await params;
  if (!UUID_LIKE.test(itemId)) return { title: "Polyglot" };

  const item = await getLearningItem(itemId);
  const label = item ? (item.type === "vocabulary" ? item.vocabulary.term : (item.grammar.title ?? item.grammar.structure)) : "Item";
  return { title: `${label} — Polyglot` };
}

/**
 * Spec 13's Learner Item Detail. Vocabulary is composed entirely through
 * `domains/lexicon`'s existing tested `getVocabularyDetail` read model, per
 * the spec's explicit instruction not to rebuild the dictionary/curriculum
 * join here. Grammar uses only `domains/curriculum`, never the Lexicon
 * mapping (grammar has no dictionary counterpart).
 */
export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { itemId } = await params;
  if (!UUID_LIKE.test(itemId)) {
    notFound();
  }

  // proxy.ts protects /items, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request
  // never reaches this far in practice.
  const user = await requireUser();

  const item = await getLearningItem(itemId);
  if (!item || !VIEWABLE_STATUSES.has(item.status)) {
    notFound();
  }

  if (item.type === "vocabulary") {
    const detail = await getVocabularyDetail({ vocabularyItemId: itemId, userId: user.id, includeArchived: true });
    if (!detail) {
      // Defensive only: `item` above already confirmed a viewable vocabulary
      // row exists, so this branch should be unreachable in practice.
      notFound();
    }
    return <VocabularyItemDetail detail={detail} status={item.status} />;
  }

  const [level, examples, progress] = await Promise.all([
    getLevelById(item.levelId),
    getLearningItemExamples(itemId),
    getItemProgress(user.id, itemId),
  ]);
  if (!level) {
    throw new Error(`Data integrity error: learning item ${itemId} references level ${item.levelId}, which does not exist.`);
  }

  return (
    <GrammarItemDetail grammar={item.grammar} levelNumber={level.levelNumber} status={item.status} examples={examples} progress={progress} />
  );
}
