import { pgTable, text, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";

/**
 * Language persistence foundation (spec 08 §13). Authoritative for
 * curriculum scoping — application logic resolves languages by `code`/`slug`,
 * never a hardcoded UUID or "first row" (architecture.md's multi-language
 * model).
 */
export const languages = pgTable("languages", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps(),
});
