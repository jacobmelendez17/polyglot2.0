import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, FileClock } from "lucide-react";

import { AdminSectionEditor } from "./admin-section-editor";
import { CurriculumItemForm } from "@/components/admin/curriculum/curriculum-item-form";
import { GrammarContentBlockEditor } from "@/components/admin/curriculum/grammar-content-block-editor";
import { ItemResourceEditor } from "@/components/admin/curriculum/item-resource-editor";
import { toRegisterEditorValue } from "@/components/admin/curriculum/register-select";
import { UsageContextEditor } from "@/components/admin/curriculum/usage-context-editor";
import type { ItemAdminEditingData } from "@/domains/curriculum/server";
import type { CurriculumStatus } from "@/domains/curriculum";

type BuildAdminSlotsInput = {
  data: ItemAdminEditingData;
  status: CurriculumStatus;
  /** True when the item has a confirmed dictionary mapping, so patterns can be seeded from its forms. */
  canSeedFromDictionary: boolean;
};

/**
 * Builds spec 18's per-section admin editing controls for the item page.
 *
 * Every editor here is the component the Admin curriculum pages already use,
 * calling the same server actions and the same domain services — spec 18's
 * "do not maintain separate Item-page and Admin-page versions of the same
 * business logic". What this module owns is *placement*: which editor sits
 * under which section.
 *
 * An archived item gets no editing controls at all, because the services
 * refuse to edit one — offering a control that is guaranteed to fail is
 * worse than offering none.
 */
export function buildItemAdminSlots({ data, status, canSeedFromDictionary }: BuildAdminSlotsInput): {
  banner?: ReactNode;
  details?: ReactNode;
  about?: ReactNode;
  context?: ReactNode;
  examples?: ReactNode;
  resources?: ReactNode;
} {
  const { item } = data;

  if (status === "archived") {
    return { banner: <AdminBanner status={status} hasOpenDraft={data.hasOpenDraft} itemId={item.id} /> };
  }

  const existing =
    item.type === "vocabulary"
      ? {
          learningItemId: item.id,
          type: "vocabulary" as const,
          vocabulary: {
            vocabularyGroupId: item.vocabulary.vocabularyGroupId,
            term: item.vocabulary.term,
            primaryMeaning: item.vocabulary.primaryMeaning,
            definition: item.vocabulary.definition ?? "",
            article: item.vocabulary.article ?? "",
            partOfSpeech: item.vocabulary.partOfSpeech,
            pronunciation: item.vocabulary.pronunciation ?? "",
            ipa: item.vocabulary.ipa ?? "",
            context: item.vocabulary.context ?? "",
            creatorNotes: item.vocabulary.creatorNotes ?? "",
            register: toRegisterEditorValue(item.vocabulary.register),
            acceptedAnswers: data.acceptedAnswers,
          },
        }
      : {
          learningItemId: item.id,
          type: "grammar" as const,
          grammar: {
            title: item.grammar.title ?? "",
            structure: item.grammar.structure,
            primaryMeaning: item.grammar.primaryMeaning,
            explanation: item.grammar.explanation,
            category: item.grammar.category ?? "",
            creatorNotes: item.grammar.creatorNotes ?? "",
            register: toRegisterEditorValue(item.grammar.register),
            requiredDirections: item.grammar.requiredQuestions.map((question) => question.direction),
            acceptedAnswers: data.acceptedAnswers,
          },
        };

  return {
    banner: <AdminBanner status={status} hasOpenDraft={data.hasOpenDraft} itemId={item.id} />,

    details: (
      <AdminSectionEditor
        title="Edit item fields"
        description={
          status === "published"
            ? "Field edits on a published item are staged as a draft. Publish it from Admin curriculum to make them live."
            : "This item is not published yet, so field edits apply immediately."
        }
      >
        <CurriculumItemForm
          languageId={item.languageId}
          levels={[]}
          groups={data.groups}
          existing={existing}
        />
      </AdminSectionEditor>
    ),

    // Vocabulary's teaching definition is one of the item fields above, so
    // only grammar gets a second editor here — its About content is an
    // ordered block collection rather than a field.
    about:
      item.type === "grammar" ? (
        <AdminSectionEditor title="Edit About content" description="Text, example sentences, and Polyglot notes, in the order they appear.">
          <GrammarContentBlockEditor learningItemId={item.id} blocks={data.blocks} />
        </AdminSectionEditor>
      ) : undefined,

    context: (
      <AdminSectionEditor title="Edit patterns of use" description="The tabs a learner sees, and which examples belong to each.">
        <UsageContextEditor
          learningItemId={item.id}
          itemType={item.type}
          contexts={data.patterns}
          examples={data.examples}
          canSeedFromDictionary={canSeedFromDictionary}
        />
      </AdminSectionEditor>
    ),

    examples: (
      <AdminSectionEditor title="Edit examples" description="The same editor as Patterns of use — examples and their tabs are authored together.">
        <UsageContextEditor
          learningItemId={item.id}
          itemType={item.type}
          contexts={data.patterns}
          examples={data.examples}
          canSeedFromDictionary={canSeedFromDictionary}
        />
      </AdminSectionEditor>
    ),

    resources: (
      <AdminSectionEditor title="Edit resources" description="External links shown to learners.">
        <ItemResourceEditor learningItemId={item.id} resources={data.resources} />
      </AdminSectionEditor>
    ),
  };
}

/**
 * Says plainly what an admin is looking at, because the item page shows the
 * *live* content: a staged draft is invisible here, and an archived item
 * cannot be edited at all. Without this an admin could reasonably save a
 * field, see nothing change, and conclude the save failed.
 */
function AdminBanner({ status, hasOpenDraft, itemId }: { status: CurriculumStatus; hasOpenDraft: boolean; itemId: string }) {
  const message =
    status === "archived"
      ? "This item is archived. Archived items cannot be edited — restore it from Admin curriculum first."
      : hasOpenDraft
        ? "This item has unpublished changes. You are seeing the live version; publish the draft to make your edits visible to learners."
        : status === "published"
          ? "You are viewing the live, published item. Field edits are staged as a draft and need publishing; patterns, examples, About blocks, and resources change immediately."
          : "This item is not published, so learners cannot see it yet. Every edit applies immediately.";

  return (
    <div className="rounded-xl border border-state-warning/50 bg-state-warning/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <FileClock className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" aria-hidden="true" />
          {message}
        </p>
        <Link
          href={`/admin/curriculum/items/${itemId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Open in Admin curriculum
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
