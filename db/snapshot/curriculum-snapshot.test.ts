import { describe, expect, it } from "vitest";

import {
  decideLoad,
  parseSnapshot,
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_TABLE_NAMES,
  summarizeSnapshot,
  validateSnapshotIntegrity,
  type CurriculumSnapshot,
  type SnapshotRow,
} from "./curriculum-snapshot";

const LANG = "11111111-1111-4111-8111-111111111111";
const LEVEL = "22222222-2222-4222-8222-222222222222";
const GROUP = "33333333-3333-4333-8333-333333333333";
const VOCAB = "44444444-4444-4444-8444-444444444444";
const GRAMMAR = "55555555-5555-4555-8555-555555555555";
const SENTENCE = "66666666-6666-4666-8666-666666666666";
const CONTEXT = "77777777-7777-4777-8777-777777777777";

function emptyTables(): Record<string, SnapshotRow[]> {
  return Object.fromEntries(SNAPSHOT_TABLE_NAMES.map((name) => [name, []]));
}

/** A small valid snapshot; each test breaks exactly one thing. */
function validSnapshot(): CurriculumSnapshot {
  const tables = emptyTables();
  tables.levels = [{ id: LEVEL, language_id: LANG, level_number: 1 }];
  tables.vocabulary_groups = [
    { id: GROUP, level_id: LEVEL, language_id: LANG, name: "Numbers" },
  ];
  tables.learning_items = [
    { id: VOCAB, level_id: LEVEL, language_id: LANG, type: "vocabulary" },
    { id: GRAMMAR, level_id: LEVEL, language_id: LANG, type: "grammar" },
  ];
  tables.vocabulary_items = [
    { learning_item_id: VOCAB, vocabulary_group_id: GROUP, term: "uno" },
  ];
  tables.grammar_items = [
    { learning_item_id: GRAMMAR, vocabulary_group_id: null, structure: "y" },
  ];
  tables.grammar_content_blocks = [
    { id: "b1", learning_item_id: GRAMMAR, type: "text" },
  ];
  tables.accepted_answers = [{ id: "a1", learning_item_id: VOCAB }];
  tables.vocabulary_usage_contexts = [
    { id: CONTEXT, learning_item_id: VOCAB, label: "x" },
  ];
  tables.sentences = [{ id: SENTENCE, language_id: LANG, target_text: "Uno." }];
  tables.learning_item_sentences = [
    {
      id: "l1",
      learning_item_id: VOCAB,
      sentence_id: SENTENCE,
      usage_context_id: CONTEXT,
    },
  ];

  return parseSnapshot({
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    exportedAt: "2026-10-08T00:00:00.000Z",
    migrations: { applied: 49, latestCreatedAt: "1790566478888" },
    language: {
      code: "es-MX",
      slug: "spanish",
      name: "Spanish",
      sourceId: LANG,
    },
    levelNumber: 1,
    tables,
  });
}

function problemsAfter(mutate: (s: CurriculumSnapshot) => void): string[] {
  const snapshot = validSnapshot();
  mutate(snapshot);
  return validateSnapshotIntegrity(snapshot);
}

describe("validateSnapshotIntegrity", () => {
  it("accepts a consistent snapshot", () => {
    expect(validateSnapshotIntegrity(validSnapshot())).toEqual([]);
  });

  it("requires exactly one level row", () => {
    expect(problemsAfter((s) => (s.tables.levels = []))[0]).toMatch(
      /exactly 1 level row/,
    );
  });

  it("rejects a vocabulary item whose theme was not exported (e.g. unpublished)", () => {
    const problems = problemsAfter((s) => (s.tables.vocabulary_groups = []));
    expect(problems.join("\n")).toMatch(
      /vocabulary_items .*not a published theme/,
    );
  });

  it("rejects an item without its detail row", () => {
    const problems = problemsAfter((s) => (s.tables.vocabulary_items = []));
    expect(problems.join("\n")).toMatch(/has no vocabulary_items row/);
  });

  it("rejects an item with both detail rows", () => {
    const problems = problemsAfter((s) => {
      s.tables.grammar_items.push({
        learning_item_id: VOCAB,
        vocabulary_group_id: null,
        structure: "z",
      });
    });
    expect(problems.join("\n")).toMatch(/also has a grammar_items row/);
  });

  it("rejects an unknown item type", () => {
    const problems = problemsAfter((s) => {
      s.tables.learning_items[0].type = "mystery";
    });
    expect(problems.join("\n")).toMatch(/unknown type mystery/);
  });

  it("rejects a child row pointing at an item that was not exported", () => {
    const problems = problemsAfter((s) => {
      s.tables.accepted_answers.push({
        id: "a2",
        learning_item_id: "99999999-9999-4999-8999-999999999999",
      });
    });
    expect(problems.join("\n")).toMatch(/accepted_answers a2: no matching/);
  });

  it("rejects a sentence link to a sentence or context that was not exported", () => {
    const missingSentence = problemsAfter((s) => (s.tables.sentences = []));
    expect(missingSentence.join("\n")).toMatch(/sentence not exported/);

    const missingContext = problemsAfter(
      (s) => (s.tables.vocabulary_usage_contexts = []),
    );
    expect(missingContext.join("\n")).toMatch(/usage context not exported/);
  });

  it("rejects duplicate ids", () => {
    const problems = problemsAfter((s) => {
      s.tables.accepted_answers.push({ id: "a1", learning_item_id: VOCAB });
    });
    expect(problems.join("\n")).toMatch(/duplicate id a1/);
  });

  it("rejects a row from another language", () => {
    const problems = problemsAfter((s) => {
      s.tables.sentences[0].language_id =
        "88888888-8888-4888-8888-888888888888";
    });
    expect(problems.join("\n")).toMatch(
      /language_id is not the snapshot's language/,
    );
  });

  it("rejects an item from another level", () => {
    const problems = problemsAfter((s) => {
      s.tables.learning_items[0].level_id =
        "99999999-9999-4999-8999-999999999999";
    });
    expect(problems.join("\n")).toMatch(/wrong level_id/);
  });

  it.each([
    "created_by",
    "owner_user_id",
    "mapped_by_user_id",
    "selected_by_user_id",
    "user_id",
  ])("refuses to carry the user-reference column %s", (column) => {
    const problems = problemsAfter((s) => {
      s.tables.accepted_answers[0][column] = "someone";
    });
    expect(problems.join("\n")).toMatch(
      new RegExp(`user-reference column "${column}"`),
    );
  });
});

describe("parseSnapshot", () => {
  it("rejects an unsupported format version", () => {
    expect(() =>
      parseSnapshot({ ...validSnapshot(), formatVersion: 2 }),
    ).toThrow();
  });

  it("rejects a snapshot missing a table", () => {
    const snapshot = validSnapshot();
    const { sentences: _omitted, ...rest } = snapshot.tables;
    void _omitted;
    expect(() => parseSnapshot({ ...snapshot, tables: rest })).toThrow();
  });
});

describe("summarizeSnapshot", () => {
  it("lists every table with its row count, in insert order", () => {
    const lines = summarizeSnapshot(validSnapshot());
    expect(lines[0]).toBe("levels: 1");
    expect(lines).toContain("learning_items: 2");
    expect(lines.at(-1)).toBe("learning_item_sentences: 1");
    expect(lines).toHaveLength(SNAPSHOT_TABLE_NAMES.length);
  });
});

describe("decideLoad", () => {
  const allMatch = { levels: { found: 1, expected: 1 } };

  it("loads into a language with no curriculum", () => {
    expect(
      decideLoad({
        existingContentRows: 0,
        hasSnapshotLevel: false,
        idMatches: { levels: { found: 0, expected: 1 } },
      }),
    ).toEqual({ action: "load" });
  });

  it("treats a re-run of the same snapshot as a no-op", () => {
    expect(
      decideLoad({
        existingContentRows: 120,
        hasSnapshotLevel: true,
        idMatches: allMatch,
      }),
    ).toEqual({ action: "already-loaded" });
  });

  it("refuses a partly present snapshot instead of merging", () => {
    const decision = decideLoad({
      existingContentRows: 120,
      hasSnapshotLevel: true,
      idMatches: {
        levels: { found: 1, expected: 1 },
        accepted_answers: { found: 2, expected: 3 },
      },
    });
    expect(decision.action).toBe("refuse");
  });

  it("refuses a language that already has other curriculum", () => {
    const decision = decideLoad({
      existingContentRows: 7,
      hasSnapshotLevel: false,
      idMatches: { levels: { found: 0, expected: 1 } },
    });
    expect(decision).toMatchObject({ action: "refuse" });
    expect(decision.action === "refuse" && decision.reason).toMatch(
      /7 curriculum row/,
    );
  });
});
