import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, inArray } from "drizzle-orm";
import { writeFileSync } from "node:fs";

import * as schema from "@/db/schema";
import {
  acceptedAnswers,
  grammarItems,
  languages,
  learningItems,
  levels,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";

/**
 * Spec 25 §11/§19/Unit 10 Phase B — "Generate the new canonical Level 1 CSV
 * containing the keys and expanded schema." A one-off verification tool, not
 * the general reusable Admin "Export" feature (spec §19 lists Export
 * Language/Level/Batch/Current Filter as its own UI capability — genuinely
 * unbuilt, and out of scope here; this script exists only to produce the one
 * file Unit 10's own round-trip check needs). Read-only: it never writes to
 * the database.
 *
 * Column set and header spelling match spec 25 §5's canonical schema
 * exactly, using the codebase's own accepted aliases (`batch_number`/
 * `batch_name` for `group`/`group_name` — see
 * `vocabulary-import-parsing.ts`'s `IMPORT_COLUMN_ALIASES`) so the output
 * re-parses with zero translation.
 *
 * Deliberately reads the *exact* same columns `getImportMatchTargets`
 * (`curriculum-mutation-repository.ts`) diffs an existing item against —
 * anything this script leaves out or gets wrong would show up as a false
 * "changed" row when the export is fed back through the resolver, which is
 * precisely the round-trip property Unit 10 exists to verify.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/export-level-canonical-csv.ts --language es-MX --level 1 --out /path/to/file.csv
 */

type CliOptions = { languageCode: string; levelNumber: number; out: string };

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--language":
        options.languageCode = argv[++i];
        break;
      case "--level":
        options.levelNumber = Number(argv[++i]);
        break;
      case "--out":
        options.out = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument "${argv[i]}".`);
    }
  }
  if (!options.languageCode || !options.levelNumber || !options.out) {
    throw new Error("Usage: --language <code> --level <number> --out <path>");
  }
  return options as CliOptions;
}

const HEADER = [
  "curriculum_key",
  "language",
  "item_type",
  "word",
  "translation",
  "level",
  "level_name",
  "batch_number",
  "batch_name",
  "pronunciation",
  "ipa",
  "synonyms",
  "variations",
  "article",
  "part_of_speech",
  "context",
  "creator_notes",
];

/** RFC 4180-ish: quote a field only when it needs it, doubling embedded quotes. */
function csvField(value: string | null | undefined): string {
  const raw = value ?? "";
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const [language] = await db
    .select()
    .from(languages)
    .where(eq(languages.code, options.languageCode))
    .limit(1);
  if (!language)
    throw new Error(`Language "${options.languageCode}" not found.`);

  const [level] = await db
    .select()
    .from(levels)
    .where(
      and(
        eq(levels.languageId, language.id),
        eq(levels.levelNumber, options.levelNumber),
      ),
    )
    .limit(1);
  if (!level)
    throw new Error(
      `Level ${options.levelNumber} not found for ${options.languageCode}.`,
    );

  const vocabRows = await db
    .select({
      curriculumKey: learningItems.curriculumKey,
      learningItemId: learningItems.id,
      term: vocabularyItems.term,
      primaryMeaning: vocabularyItems.primaryMeaning,
      article: vocabularyItems.article,
      partOfSpeech: vocabularyItems.partOfSpeech,
      pronunciation: vocabularyItems.pronunciation,
      ipa: vocabularyItems.ipa,
      context: vocabularyItems.context,
      creatorNotes: vocabularyItems.creatorNotes,
      groupPosition: vocabularyGroups.position,
      groupName: vocabularyGroups.name,
    })
    .from(learningItems)
    .innerJoin(
      vocabularyItems,
      eq(vocabularyItems.learningItemId, learningItems.id),
    )
    .innerJoin(
      vocabularyGroups,
      eq(vocabularyGroups.id, vocabularyItems.vocabularyGroupId),
    )
    .where(
      and(
        eq(learningItems.levelId, level.id),
        eq(learningItems.type, "vocabulary"),
      ),
    );

  const grammarRows = await db
    .select({
      curriculumKey: learningItems.curriculumKey,
      learningItemId: learningItems.id,
      structure: grammarItems.structure,
      primaryMeaning: grammarItems.primaryMeaning,
      creatorNotes: grammarItems.creatorNotes,
    })
    .from(learningItems)
    .innerJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .where(
      and(
        eq(learningItems.levelId, level.id),
        eq(learningItems.type, "grammar"),
      ),
    );

  const allItemIds = [
    ...vocabRows.map((r) => r.learningItemId),
    ...grammarRows.map((r) => r.learningItemId),
  ];
  const answers =
    allItemIds.length > 0
      ? await db
          .select()
          .from(acceptedAnswers)
          .where(inArray(acceptedAnswers.learningItemId, allItemIds))
      : [];
  const bySide = new Map<string, { meaning: string[]; term: string[] }>();
  for (const answer of answers) {
    const entry = bySide.get(answer.learningItemId) ?? {
      meaning: [],
      term: [],
    };
    entry[answer.side === "meaning" ? "meaning" : "term"].push(answer.value);
    bySide.set(answer.learningItemId, entry);
  }

  const lines = [HEADER.join(",")];

  for (const row of vocabRows) {
    const answerSet = bySide.get(row.learningItemId) ?? {
      meaning: [],
      term: [],
    };
    lines.push(
      [
        csvField(row.curriculumKey),
        csvField(language.code),
        csvField("vocabulary"),
        csvField(row.term),
        csvField(row.primaryMeaning),
        csvField(String(level.levelNumber)),
        csvField(level.name),
        csvField(String(row.groupPosition)),
        csvField(row.groupName),
        csvField(row.pronunciation),
        csvField(row.ipa),
        csvField(answerSet.meaning.join("|")),
        csvField(answerSet.term.join("|")),
        csvField(row.article),
        csvField(row.partOfSpeech),
        csvField(row.context),
        csvField(row.creatorNotes),
      ].join(","),
    );
  }

  for (const row of grammarRows) {
    const answerSet = bySide.get(row.learningItemId) ?? {
      meaning: [],
      term: [],
    };
    lines.push(
      [
        csvField(row.curriculumKey),
        csvField(language.code),
        csvField("grammar"),
        csvField(row.structure),
        csvField(row.primaryMeaning),
        csvField(String(level.levelNumber)),
        csvField(level.name),
        // `resolveImportRow` never resolves a real group for a grammar row
        // (`group: { kind: "none" }` unconditionally) even with an explicit
        // `item_type`, but `validateVocabularyImportRow` still requires the
        // cell to parse as *some* positive integer — any value works; `5`
        // matches this codebase's pre-existing GRAMMAR_GROUP_NUMBER sentinel
        // for readability, not because it's read as a real group here.
        csvField("5"),
        csvField(""),
        csvField(""),
        csvField(""),
        csvField(answerSet.meaning.join("|")),
        csvField(""),
        csvField(""),
        csvField(""),
        csvField(""),
        csvField(row.creatorNotes),
      ].join(","),
    );
  }

  writeFileSync(options.out, lines.join("\n") + "\n", "utf8");
  console.log(
    `Wrote ${vocabRows.length} vocabulary + ${grammarRows.length} grammar rows to ${options.out}`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
