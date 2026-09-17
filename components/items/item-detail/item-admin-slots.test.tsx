import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { buildItemAdminSlots } from "@/components/items/item-detail/item-admin-slots";
import type { ItemAdminEditingData } from "@/domains/curriculum/server";
import type { CurriculumStatus } from "@/domains/curriculum";

// The editors reach for `next/navigation` and the admin server actions; this
// suite is about which controls appear for which item, not what they do.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("@/app/(admin)/admin/curriculum/actions", () => ({
  createItemAction: vi.fn(),
  updateItemAction: vi.fn(),
  resetDictionaryFieldAction: vi.fn(),
  usageContextAction: vi.fn(),
  itemExampleAction: vi.fn(),
  seedUsageContextsAction: vi.fn(),
  grammarContentBlockAction: vi.fn(),
  itemResourceAction: vi.fn(),
}));

function editingData(
  overrides: Partial<ItemAdminEditingData> = {},
): ItemAdminEditingData {
  return {
    item: {
      id: "item-1",
      languageId: "lang-1",
      levelId: "level-1",
      status: "published",
      position: 1,
      lessonPriority: 1,
      version: 3,
      type: "vocabulary",
      vocabulary: {
        vocabularyGroupId: "group-1",
        term: "gato",
        primaryMeaning: "cat",
        definition: "A cat.",
        article: "el",
        partOfSpeech: "noun",
        pronunciation: null,
        ipa: null,
        context: null,
        creatorNotes: null,
        register: null,
        dictionaryFieldOverrides: [],
      },
    },
    acceptedAnswers: [],
    groups: [{ id: "group-1", name: "Home & Basics", levelNumber: 1 }],
    blocks: [],
    patterns: [],
    examples: [],
    resources: [],
    hasOpenDraft: false,
    ...overrides,
  };
}

function grammarEditingData(
  overrides: Partial<ItemAdminEditingData> = {},
): ItemAdminEditingData {
  return editingData({
    item: {
      id: "item-2",
      languageId: "lang-1",
      levelId: "level-1",
      status: "published",
      position: 1,
      lessonPriority: 1,
      version: 1,
      type: "grammar",
      grammar: {
        title: null,
        structure: "ser",
        primaryMeaning: "to be",
        explanation: "Permanent states.",
        category: null,
        creatorNotes: null,
        register: null,
        requiredQuestions: [
          { format: "translation", direction: "targetToEnglish" },
        ],
      },
    },
    ...overrides,
  });
}

function renderSlots(
  data: ItemAdminEditingData,
  status: CurriculumStatus = "published",
) {
  const slots = buildItemAdminSlots({
    data,
    status,
    canSeedFromDictionary: false,
  });
  render(
    <div>
      {slots.banner}
      {slots.details}
      {slots.about}
      {slots.context}
      {slots.examples}
      {slots.resources}
    </div>,
  );
  return slots;
}

describe("buildItemAdminSlots", () => {
  it("offers an editor beneath each section it edits", () => {
    renderSlots(editingData());

    expect(
      screen.getByRole("button", { name: /Edit item fields/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Edit patterns of use/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Edit examples/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Edit resources/ }),
    ).toBeInTheDocument();
  });

  it("gives grammar an About-content editor and vocabulary none", () => {
    const grammarSlots = buildItemAdminSlots({
      data: grammarEditingData(),
      status: "published",
      canSeedFromDictionary: false,
    });
    expect(grammarSlots.about).toBeDefined();

    const vocabularySlots = buildItemAdminSlots({
      data: editingData(),
      status: "published",
      canSeedFromDictionary: false,
    });
    // Vocabulary's teaching definition is one of the item fields, so a second editor would be a duplicate route to the same value.
    expect(vocabularySlots.about).toBeUndefined();
  });

  it("offers no editing controls at all for an archived item, because the services refuse them", () => {
    const slots = buildItemAdminSlots({
      data: editingData(),
      status: "archived",
      canSeedFromDictionary: false,
    });

    expect(slots.details).toBeUndefined();
    expect(slots.context).toBeUndefined();
    expect(slots.resources).toBeUndefined();
    expect(slots.banner).toBeDefined();
  });
});

describe("buildItemAdminSlots — what the admin is looking at", () => {
  it("warns that a published item's field edits are staged rather than live", () => {
    renderSlots(editingData());
    expect(
      screen.getByText(/Field edits are staged as a draft and need publishing/),
    ).toBeInTheDocument();
  });

  it("says plainly when an unpublished draft already exists", () => {
    renderSlots(editingData({ hasOpenDraft: true }));
    expect(
      screen.getByText(/This item has unpublished changes/),
    ).toBeInTheDocument();
  });

  it("says a pending item's edits apply immediately and that learners cannot see it", () => {
    renderSlots(editingData(), "pending");
    expect(
      screen.getByText(/not published, so learners cannot see it yet/),
    ).toBeInTheDocument();
  });

  it("explains why an archived item cannot be edited", () => {
    renderSlots(editingData(), "archived");
    expect(
      screen.getByText(/Archived items cannot be edited/),
    ).toBeInTheDocument();
  });

  it("always links back to the full Admin curriculum page, where publishing lives", () => {
    renderSlots(editingData());
    expect(
      screen.getByRole("link", { name: /Open in Admin curriculum/ }),
    ).toHaveAttribute("href", "/admin/curriculum/items/item-1");
  });
});
