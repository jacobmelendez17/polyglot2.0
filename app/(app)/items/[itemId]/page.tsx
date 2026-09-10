import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemDetailLayout } from "@/components/items/item-detail/item-detail-layout";
import { buildItemAdminSlots } from "@/components/items/item-detail/item-admin-slots";
import { canManageCurriculum } from "@/domains/admin";
import { buildItemDetailView } from "@/domains/curriculum";
import type { CurriculumStatus } from "@/domains/curriculum";
import { getItemAdminEditingData, getItemDetailPageData, getLearningItem } from "@/domains/curriculum/server";
import { getVocabularyMappingView } from "@/domains/lexicon/server";
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
 *
 * A curriculum manager additionally gets spec 18's per-section editing
 * controls. The extra reads that needs happen only for such a user, and
 * rendering the controls is never the authorization: every action they
 * invoke re-checks the role server-side.
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

  const adminSlots = canManageCurriculum(user) ? await buildAdminSlots(itemId, data.status, data.source.type) : undefined;

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
      adminSlots={adminSlots}
    />
  );
}

/**
 * Loads the admin editing state and turns it into the layout's per-section
 * slots. Split out of the page body so the learner path reads as one
 * straight line, and so these queries are unmistakably behind the role check
 * at the call site.
 */
async function buildAdminSlots(itemId: string, status: CurriculumStatus, itemType: "vocabulary" | "grammar") {
  const editing = await getItemAdminEditingData(itemId);
  if (!editing) return undefined;

  // Only vocabulary can seed patterns from a dictionary entry's inflected
  // forms, so grammar skips the mapping lookup entirely rather than issuing
  // a query that can only ever come back empty.
  const canSeedFromDictionary =
    itemType === "vocabulary" ? (await getVocabularyMappingView(itemId)).mapping?.matchStatus === "manual" : false;

  return buildItemAdminSlots({ data: editing, status, canSeedFromDictionary });
}
