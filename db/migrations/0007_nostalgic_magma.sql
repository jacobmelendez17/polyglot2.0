CREATE TYPE "public"."dictionary_match_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."dictionary_match_status" AS ENUM('unmatched', 'source_data_not_imported', 'auto_matched', 'review_required', 'manual');--> statement-breakpoint
CREATE TYPE "public"."dictionary_relation_type" AS ENUM('synonym', 'antonym', 'related', 'alternative_form', 'form_of', 'derived', 'hypernym', 'hyponym');--> statement-breakpoint
CREATE TYPE "public"."dictionary_source_status" AS ENUM('active', 'missing_from_source');--> statement-breakpoint
CREATE TYPE "public"."lexical_import_scope" AS ENUM('curriculum', 'terms', 'full_language');--> statement-breakpoint
CREATE TYPE "public"."lexical_import_status" AS ENUM('staged', 'validating', 'completed', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."lexical_source_type" AS ENUM('dictionary', 'regional_wordlist');--> statement-breakpoint
CREATE TYPE "public"."regional_evidence_status" AS ENUM('recognized', 'not_listed', 'unknown');--> statement-breakpoint
CREATE TABLE "dictionary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"lemma" text NOT NULL,
	"normalized_lemma" text NOT NULL,
	"part_of_speech" text NOT NULL,
	"source_entry_key" text NOT NULL,
	"source_status" "dictionary_source_status" DEFAULT 'active' NOT NULL,
	"restricted_region_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen_import_id" uuid,
	"last_seen_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_entries_source_entry_key" UNIQUE("source_id","source_entry_key")
);
--> statement-breakpoint
CREATE TABLE "dictionary_entry_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_entry_id" uuid NOT NULL,
	"lexical_import_id" uuid NOT NULL,
	"source_record_key" text NOT NULL,
	"source_hash" text NOT NULL,
	"raw_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_entry_versions_entry_hash_key" UNIQUE("dictionary_entry_id","source_hash")
);
--> statement-breakpoint
CREATE TABLE "dictionary_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_entry_id" uuid NOT NULL,
	"form" text NOT NULL,
	"normalized_form" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_fingerprint" text NOT NULL,
	"source_status" "dictionary_source_status" DEFAULT 'active' NOT NULL,
	"first_seen_import_id" uuid,
	"last_seen_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_forms_entry_fingerprint_key" UNIQUE("dictionary_entry_id","source_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "dictionary_pronunciations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_entry_id" uuid NOT NULL,
	"ipa" text,
	"region_code" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audio_url" text,
	"source_fingerprint" text NOT NULL,
	"source_status" "dictionary_source_status" DEFAULT 'active' NOT NULL,
	"first_seen_import_id" uuid,
	"last_seen_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_pronunciations_entry_fingerprint_key" UNIQUE("dictionary_entry_id","source_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "dictionary_regional_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_entry_id" uuid NOT NULL,
	"region_code" text NOT NULL,
	"status" "regional_evidence_status" NOT NULL,
	"source_id" uuid,
	"lexical_import_id" uuid,
	"matched_form" text,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_regional_evidence_entry_region_key" UNIQUE("dictionary_entry_id","region_code")
);
--> statement-breakpoint
CREATE TABLE "dictionary_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_entry_id" uuid NOT NULL,
	"relation_type" "dictionary_relation_type" NOT NULL,
	"target_lemma" text NOT NULL,
	"normalized_target_lemma" text NOT NULL,
	"target_dictionary_entry_id" uuid,
	"source_status" "dictionary_source_status" DEFAULT 'active' NOT NULL,
	"first_seen_import_id" uuid,
	"last_seen_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_relations_entry_type_target_key" UNIQUE("dictionary_entry_id","relation_type","normalized_target_lemma")
);
--> statement-breakpoint
CREATE TABLE "dictionary_senses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_entry_id" uuid NOT NULL,
	"source_sense_key" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"sense_order" integer NOT NULL,
	"gloss" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_status" "dictionary_source_status" DEFAULT 'active' NOT NULL,
	"first_seen_import_id" uuid,
	"last_seen_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_senses_entry_source_key" UNIQUE("dictionary_entry_id","source_sense_key")
);
--> statement-breakpoint
CREATE TABLE "lexical_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"scope" "lexical_import_scope" NOT NULL,
	"status" "lexical_import_status" DEFAULT 'staged' NOT NULL,
	"source_version" text,
	"dump_date" timestamp with time zone,
	"extractor_version" text,
	"source_commit" text,
	"file_checksum" text NOT NULL,
	"records_scanned" integer DEFAULT 0 NOT NULL,
	"records_retained" integer DEFAULT 0 NOT NULL,
	"records_rejected" integer DEFAULT 0 NOT NULL,
	"entries_created" integer DEFAULT 0 NOT NULL,
	"entries_updated" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lexical_imports_source_checksum_key" UNIQUE("source_id","file_checksum")
);
--> statement-breakpoint
CREATE TABLE "lexical_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"provider" text NOT NULL,
	"source_type" "lexical_source_type" NOT NULL,
	"source_language" text NOT NULL,
	"entry_language" text,
	"license_metadata" jsonb NOT NULL,
	"attribution_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lexical_sources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "regional_lexemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"lexical_import_id" uuid NOT NULL,
	"region_code" text NOT NULL,
	"word" text NOT NULL,
	"normalized_word" text NOT NULL,
	"affix_flags" text,
	"source_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regional_lexemes_source_region_word_key" UNIQUE("source_id","region_code","normalized_word")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_dictionary_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocabulary_item_id" uuid NOT NULL,
	"dictionary_entry_id" uuid,
	"lookup_form" text NOT NULL,
	"match_status" "dictionary_match_status" NOT NULL,
	"confidence" "dictionary_match_confidence",
	"manual_lock" boolean DEFAULT false NOT NULL,
	"preferred_pronunciation_id" uuid,
	"review_reason" text,
	"mapped_by_user_id" uuid,
	"mapped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_dictionary_mappings_vocabulary_item_id_unique" UNIQUE("vocabulary_item_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_selected_senses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocabulary_item_id" uuid NOT NULL,
	"dictionary_sense_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"selected_by_user_id" uuid,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_selected_senses_item_sense_key" UNIQUE("vocabulary_item_id","dictionary_sense_id")
);
--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_source_id_lexical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lexical_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_first_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("first_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_last_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("last_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entry_versions" ADD CONSTRAINT "dictionary_entry_versions_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entry_versions" ADD CONSTRAINT "dictionary_entry_versions_lexical_import_id_lexical_imports_id_fk" FOREIGN KEY ("lexical_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_forms" ADD CONSTRAINT "dictionary_forms_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_forms" ADD CONSTRAINT "dictionary_forms_first_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("first_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_forms" ADD CONSTRAINT "dictionary_forms_last_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("last_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_pronunciations" ADD CONSTRAINT "dictionary_pronunciations_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_pronunciations" ADD CONSTRAINT "dictionary_pronunciations_first_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("first_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_pronunciations" ADD CONSTRAINT "dictionary_pronunciations_last_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("last_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_regional_evidence" ADD CONSTRAINT "dictionary_regional_evidence_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_regional_evidence" ADD CONSTRAINT "dictionary_regional_evidence_source_id_lexical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lexical_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_regional_evidence" ADD CONSTRAINT "dictionary_regional_evidence_lexical_import_id_lexical_imports_id_fk" FOREIGN KEY ("lexical_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_relations" ADD CONSTRAINT "dictionary_relations_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_relations" ADD CONSTRAINT "dictionary_relations_target_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("target_dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_relations" ADD CONSTRAINT "dictionary_relations_first_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("first_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_relations" ADD CONSTRAINT "dictionary_relations_last_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("last_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_senses" ADD CONSTRAINT "dictionary_senses_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_senses" ADD CONSTRAINT "dictionary_senses_first_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("first_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_senses" ADD CONSTRAINT "dictionary_senses_last_seen_import_id_lexical_imports_id_fk" FOREIGN KEY ("last_seen_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_imports" ADD CONSTRAINT "lexical_imports_source_id_lexical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lexical_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regional_lexemes" ADD CONSTRAINT "regional_lexemes_source_id_lexical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lexical_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regional_lexemes" ADD CONSTRAINT "regional_lexemes_lexical_import_id_lexical_imports_id_fk" FOREIGN KEY ("lexical_import_id") REFERENCES "public"."lexical_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_dictionary_mappings" ADD CONSTRAINT "vocabulary_dictionary_mappings_vocabulary_item_id_vocabulary_items_learning_item_id_fk" FOREIGN KEY ("vocabulary_item_id") REFERENCES "public"."vocabulary_items"("learning_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_dictionary_mappings" ADD CONSTRAINT "vocabulary_dictionary_mappings_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_dictionary_mappings" ADD CONSTRAINT "vocabulary_dictionary_mappings_preferred_pronunciation_id_dictionary_pronunciations_id_fk" FOREIGN KEY ("preferred_pronunciation_id") REFERENCES "public"."dictionary_pronunciations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_dictionary_mappings" ADD CONSTRAINT "vocabulary_dictionary_mappings_mapped_by_user_id_users_id_fk" FOREIGN KEY ("mapped_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_selected_senses" ADD CONSTRAINT "vocabulary_selected_senses_vocabulary_item_id_vocabulary_items_learning_item_id_fk" FOREIGN KEY ("vocabulary_item_id") REFERENCES "public"."vocabulary_items"("learning_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_selected_senses" ADD CONSTRAINT "vocabulary_selected_senses_dictionary_sense_id_dictionary_senses_id_fk" FOREIGN KEY ("dictionary_sense_id") REFERENCES "public"."dictionary_senses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_selected_senses" ADD CONSTRAINT "vocabulary_selected_senses_selected_by_user_id_users_id_fk" FOREIGN KEY ("selected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dictionary_entries_lemma_idx" ON "dictionary_entries" USING btree ("language_id","normalized_lemma");--> statement-breakpoint
CREATE INDEX "dictionary_entries_lemma_pos_idx" ON "dictionary_entries" USING btree ("language_id","normalized_lemma","part_of_speech");--> statement-breakpoint
CREATE INDEX "dictionary_entry_versions_entry_idx" ON "dictionary_entry_versions" USING btree ("dictionary_entry_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "dictionary_entry_versions_import_idx" ON "dictionary_entry_versions" USING btree ("lexical_import_id");--> statement-breakpoint
CREATE INDEX "dictionary_forms_normalized_idx" ON "dictionary_forms" USING btree ("normalized_form");--> statement-breakpoint
CREATE INDEX "dictionary_forms_entry_idx" ON "dictionary_forms" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "dictionary_pronunciations_entry_idx" ON "dictionary_pronunciations" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "dictionary_regional_evidence_entry_region_idx" ON "dictionary_regional_evidence" USING btree ("dictionary_entry_id","region_code");--> statement-breakpoint
CREATE INDEX "dictionary_relations_entry_idx" ON "dictionary_relations" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "dictionary_senses_entry_idx" ON "dictionary_senses" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "lexical_imports_source_started_idx" ON "lexical_imports" USING btree ("source_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "regional_lexemes_region_word_idx" ON "regional_lexemes" USING btree ("region_code","normalized_word");--> statement-breakpoint
CREATE INDEX "vocabulary_dictionary_mappings_item_idx" ON "vocabulary_dictionary_mappings" USING btree ("vocabulary_item_id");--> statement-breakpoint
CREATE INDEX "vocabulary_dictionary_mappings_entry_idx" ON "vocabulary_dictionary_mappings" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "vocabulary_dictionary_mappings_status_idx" ON "vocabulary_dictionary_mappings" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "vocabulary_selected_senses_item_idx" ON "vocabulary_selected_senses" USING btree ("vocabulary_item_id");