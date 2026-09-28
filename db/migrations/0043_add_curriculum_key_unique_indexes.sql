CREATE UNIQUE INDEX CONCURRENTLY "learning_items_curriculum_key_key" ON "learning_items" USING btree ("curriculum_key");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "levels_curriculum_key_key" ON "levels" USING btree ("curriculum_key");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "vocabulary_groups_curriculum_key_key" ON "vocabulary_groups" USING btree ("curriculum_key");