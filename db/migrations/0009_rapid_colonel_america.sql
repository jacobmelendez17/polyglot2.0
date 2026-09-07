-- Spec 12 follow-up to 0007: `dictionary_entries` was unique on
-- (source, source entry key) alone, which is wrong the moment one dictionary
-- source serves more than one Polyglot language. Wiktionary's Spanish extract
-- backs `es-MX` today and would back an `es-ES` added later; under the old
-- constraint, importing the second language would have UPSERTed onto the
-- first's rows and silently reassigned their `language_id`, taking every
-- vocabulary mapping and sense selection with them.
--
-- Widening a unique constraint never rejects data the old one allowed, so
-- this is safe against the previously deployed application version and needs
-- no backfill. 0007 has not been released.
ALTER TABLE "dictionary_entries" DROP CONSTRAINT "dictionary_entries_source_entry_key";--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_source_language_entry_key" UNIQUE("source_id","language_id","source_entry_key");