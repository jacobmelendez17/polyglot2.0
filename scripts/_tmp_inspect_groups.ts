import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { asc, eq } from "drizzle-orm";

import { languages, levels, vocabularyGroups } from "@/db/schema";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);

  const allLanguages = await db.select().from(languages).orderBy(asc(languages.name));
  console.log("=== LANGUAGES ===");
  for (const l of allLanguages) {
    console.log(JSON.stringify(l));
  }

  for (const lang of allLanguages) {
    console.log(`\n=== LEVELS for language ${lang.name} (${lang.id}) ===`);
    const langLevels = await db
      .select()
      .from(levels)
      .where(eq(levels.languageId, lang.id))
      .orderBy(asc(levels.levelNumber));
    for (const lvl of langLevels) {
      console.log(
        lvl.id,
        "levelNumber=" + lvl.levelNumber,
        "status=" + lvl.status,
        "name=" + JSON.stringify(lvl.name),
      );
    }

    console.log(`\n=== VOCAB GROUPS for language ${lang.name} (${lang.id}) ===`);
    const groups = await db
      .select()
      .from(vocabularyGroups)
      .where(eq(vocabularyGroups.languageId, lang.id))
      .orderBy(asc(vocabularyGroups.levelId), asc(vocabularyGroups.position));
    for (const g of groups) {
      console.log(JSON.stringify(g));
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
