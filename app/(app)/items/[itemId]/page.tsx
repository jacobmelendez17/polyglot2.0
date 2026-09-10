import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemDetailLayout } from "@/components/items/item-detail/item-detail-layout";
import { buildItemDetailView } from "@/domains/curriculum";
import { getItemDetailPageData, getLearningItem } from "@/domains/curriculum/server";
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

export async function generateMetadata({ params }: ItemDetailPageProps): Promise<Metadata> {
  const { itemId } = await params;
  if (!UUID_LIKE.test(itemId)) return { title: "Polyglot" };

  const item = await getLearningItem(itemId);
  const label = item ? (item.type === "vocabulary" ? item.vocabulary.term : (item.grammar.title ?? item.grammar.structure)) : "Item";
  return { title: `${label} — Polyglot` };
}

/**
 * Spec 18's Item Detail page.
 *
 * Thin by design: one read model call, one pure view-model build, one shared
 * layout. `getItemDetailPageData` owns the composition (curriculum, Lexicon,
 * progress, and the learner's own private synonyms) and returns `null` for
 * anything the learner may not see — a missing item and a draft/pending item
 * are the same 404, since a learner could never have organically reached
 * either.
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

  const data = await getItemDetailPageData(itemId, user.id);
  if (!data) {
    notFound();
  }

  return (
    <ItemDetailLayout
      view={buildItemDetailView(data.source)}
      navigation={data.navigation}
      languageCode={data.languageCode}
      mode="page"
      status={data.status}
      progress={data.progress}
      levelUnlockedAt={data.levelUnlockedAt}
      timeZone={user.timezone}
      // Server time, not the browser's: `architecture.md` requires
      // authoritative learning decisions and their display to agree.
      now={new Date()}
      hrefForItem={(id) => `/items/${id}`}
    />
  );
}
