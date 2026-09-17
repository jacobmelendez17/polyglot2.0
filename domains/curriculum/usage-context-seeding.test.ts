import { describe, expect, it } from "vitest";

import { proposeUsageContexts } from "./usage-context-seeding";

/** Shaped like what the Wiktextract import actually stores for a Spanish verb. */
const COMER_FORMS = [
  { form: "comer", tags: ["canonical"] },
  { form: "como", tags: ["first-person", "singular", "present", "indicative"] },
  {
    form: "comes",
    tags: ["second-person", "singular", "present", "indicative"],
  },
  { form: "come", tags: ["third-person", "singular", "present", "indicative"] },
  {
    form: "comí",
    tags: ["first-person", "singular", "preterite", "indicative"],
  },
];

describe("proposeUsageContexts", () => {
  it("proposes one context per inflected form, labelled by the form itself", () => {
    const contexts = proposeUsageContexts({
      lemma: "comer",
      forms: COMER_FORMS,
    });
    expect(contexts.map((context) => context.label)).toEqual([
      "como",
      "comes",
      "come",
      "comí",
    ]);
  });

  it("describes each form in reading order rather than the extract's order", () => {
    const [como] = proposeUsageContexts({ lemma: "comer", forms: COMER_FORMS });
    expect(como!.note).toBe("first-person singular present indicative");
  });

  it("never proposes the word itself as one of its own usages", () => {
    const contexts = proposeUsageContexts({
      lemma: "comer",
      forms: COMER_FORMS,
    });
    expect(contexts.map((context) => context.label)).not.toContain("comer");
  });

  it("collapses a form the extract lists more than once, keeping the description that says something", () => {
    const contexts = proposeUsageContexts({
      lemma: "comer",
      forms: [
        { form: "como", tags: [] },
        { form: "como", tags: ["first-person", "singular", "present"] },
      ],
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.note).toBe("first-person singular present");
  });

  it("skips forms already seeded, so re-seeding adds only what is new", () => {
    const contexts = proposeUsageContexts({
      lemma: "comer",
      forms: COMER_FORMS,
      existingSourceForms: ["como", "comes"],
    });
    expect(contexts.map((context) => context.label)).toEqual(["come", "comí"]);
  });

  it("caps a full conjugation table so a word does not arrive with ninety tabs", () => {
    const forms = Array.from({ length: 40 }, (_, i) => ({
      form: `forma${i}`,
      tags: ["third-person"],
    }));
    expect(
      proposeUsageContexts({ lemma: "comer", forms, limit: 12 }),
    ).toHaveLength(12);
  });

  it("proposes nothing for a word the dictionary has no forms for", () => {
    expect(proposeUsageContexts({ lemma: "hola", forms: [] })).toEqual([]);
  });

  it("ignores editorial tags that would make a label unreadable", () => {
    const [only] = proposeUsageContexts({
      lemma: "comer",
      forms: [
        {
          form: "como",
          tags: ["first-person", "no-gloss", "table-tags", "singular"],
        },
      ],
    });
    expect(only).toBeUndefined();
  });
});
