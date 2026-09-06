# Spec 12 — Lexicon & Dictionary Integration

## Goal

Integrate structured external vocabulary data into Polyglot so vocabulary items can automatically obtain lexical metadata instead of requiring every field to be manually authored.

Use:

* **Wiktionary through Kaikki/Wiktextract** as the primary lexical source.
* **RLA-ES** as regional/spelling evidence, especially `es_MX`.
* Polyglot remains authoritative for curriculum and teaching decisions.

Dictionary integration applies only to **vocabulary**, not grammar.

The intended result is:

```text
Polyglot vocabulary item
        ↓
dictionary mapping
        ↓
dictionary entry
        ├── senses
        ├── POS
        ├── IPA
        ├── forms
        ├── variants
        ├── synonyms
        └── regional evidence
```

An admin should be able to create:

```text
Display word: el padre
Translation: father
Level: 1
Group: Family
```

and have Polyglot find or suggest:

```text
lemma: padre
POS: noun
IPA: ...
definitions: [...]
forms: [...]
synonyms: [...]
Mexican Spanish evidence: ...
```

without manually recreating dictionary data.

---

## Architecture

Introduce a new:

```text
domains/lexicon/
```

domain.

`lexicon` owns:

* external lexical sources
* source imports
* source/version metadata
* dictionary entries
* senses
* pronunciations
* forms
* lexical relationships
* regional evidence
* vocabulary-to-dictionary matching
* mapping status
* source projections

`curriculum` continues to own:

* display word
* translation
* Level
* group/theme
* teaching meaning
* curriculum ordering
* official examples
* creator notes
* tags
* publication state

`admin` owns the review and override workflow.

External dictionary imports must never modify:

* curriculum Level
* group/theme
* SRS
* learner progress
* official translation
* teaching summary
* official examples
* curriculum publication state

---

## Curriculum vs Dictionary Data

Keep these Polyglot-owned:

```text
display_word
translation
level
group
order
teaching_summary
official_examples
creator_notes
tags
```

Resolve these through the Lexicon domain:

```text
lemma
part_of_speech
dictionary_senses
IPA
pronunciations
forms
variants
synonyms
usage_labels
regional_information
```

Do not duplicate dictionary-derived fields across `vocabulary_items` unless there is a deliberate manual override.

Dictionary definitions must never automatically replace Polyglot's learner-friendly teaching explanation.

---

## Database

Add additive Drizzle schema and migrations for the Lexicon domain.

Recommended structure:

```text
lexical_sources
lexical_imports

dictionary_entries
dictionary_entry_versions

dictionary_senses
dictionary_forms
dictionary_pronunciations
dictionary_relations

vocabulary_dictionary_mappings
vocabulary_selected_senses

regional_lexemes
dictionary_regional_evidence
```

### `lexical_sources`

Tracks providers independently of Spanish.

Example fields:

```text
id
code
provider
source_type
source_language
entry_language
license_metadata
attribution_text
created_at
updated_at
```

Examples:

```text
wiktionary-en-es
rla-es-mx
rla-es-general
```

Do not spread provider-specific columns such as:

```text
wiktionary_id
rla_data
```

through unrelated tables.

This must remain extensible to future sources such as JMdict.

---

## Dictionary Entries

`dictionary_entries` should provide Polyglot's stable lexical identity.

Suggested fields:

```text
id
language_id
source_id

lemma
normalized_lemma
part_of_speech

source_entry_key
source_status

created_at
updated_at
```

Do not assume an external Wiktionary identifier is permanently stable enough to become Polyglot's primary key.

---

## Raw Dictionary Data

Retain each imported raw Wiktionary object in:

```text
dictionary_entry_versions
```

including:

```text
dictionary_entry_id
lexical_import_id
source_record_key
source_hash
raw_data JSONB
created_at
```

Use a **hybrid relational + JSONB model**.

Normalize data Polyglot must frequently:

* search
* filter
* match
* select
* display

Keep the complete upstream object as JSONB for:

* source history
* future fields
* reprocessing
* admin inspection
* import debugging

Normal learner page loads should not parse large JSON objects.

---

## Senses

Store imported senses relationally.

```text
dictionary_senses
```

should include:

```text
id
dictionary_entry_id

source_sense_key
source_fingerprint

sense_order
gloss

tags
topics

source_status

first_seen_import_id
last_seen_import_id
```

A vocabulary item must be able to select which dictionary senses it teaches.

Add:

```text
vocabulary_selected_senses
```

Example:

```text
padre

1. father / male parent      ✓
2. priest
3. founder
```

Polyglot may display the full dictionary entry while only accepting/teaching selected meanings.

---

## Forms, Pronunciations, and Relationships

Store frequently used lexical structures relationally:

```text
dictionary_forms
dictionary_pronunciations
dictionary_relations
```

Forms may include:

* plural
* gendered forms
* conjugated/inflected forms
* alternative spellings

Pronunciation may include:

* IPA
* regional labels
* usage labels
* source audio metadata where available

Relationships may include:

```text
synonym
antonym
related
alternative_form
form_of
derived
hypernym
hyponym
```

Do not create new curriculum items automatically from dictionary forms or synonyms.

---

## Vocabulary Mapping

Create:

```text
vocabulary_dictionary_mappings
```

with fields conceptually including:

```text
id
vocabulary_item_id
dictionary_entry_id

lookup_form

match_status
confidence

manual_lock

preferred_pronunciation_id

mapped_by_user_id
mapped_at

created_at
updated_at
```

One vocabulary item maps to one selected dictionary entry for this first implementation.

---

## Mapping States

Use:

```text
UNMATCHED
AUTO_MATCHED
REVIEW_REQUIRED
MANUAL
```

### `AUTO_MATCHED`

One clear candidate exists and there is no material ambiguity.

### `REVIEW_REQUIRED`

Examples:

* several matching entries
* conflicting POS
* homonym ambiguity
* phrase ambiguity
* selected sense disappeared after reimport
* suspicious regional mismatch

### `MANUAL`

An admin explicitly selected the dictionary entry.

Manual mappings must be locked against automatic replacement.

### `UNMATCHED`

Relevant source data has been searched and no suitable entry exists.

Distinguish this from:

```text
SOURCE_DATA_NOT_IMPORTED
```

when Polyglot has simply not imported the relevant dictionary source data yet.

---

## Spanish Matching

Matching must use a language-specific provider rather than hardcoded Spanish rules inside generic repository code.

Example:

```text
deriveDictionaryLookups("el padre")
```

may produce:

```text
el padre
padre
```

Article-aware Spanish lookup may understand:

```text
el
la
los
las
un
una
unos
unas
```

but only where appropriate.

Do not blindly strip the first token of every phrase.

Keep:

```text
display_word = "el padre"
lemma = "padre"
```

separate.

---

## Normalization

Permitted normalization:

* trim whitespace
* normalize Unicode representation
* normalize case for matching
* controlled punctuation normalization

Do **not** remove accents or diacritics.

These remain different:

```text
el ≠ él
tu ≠ tú
si ≠ sí
como ≠ cómo
```

This must align with Polyglot's existing duplicate-detection rules.

---

## Multiword Expressions

Do not decompose every expression into individual words.

For:

```text
buenos días
por favor
de nada
```

attempt exact phrase/expression matching first.

If no safe lexical entry exists:

```text
REVIEW_REQUIRED
```

or:

```text
UNMATCHED
```

Do not fabricate a dictionary entry by combining separate words.

---

## Matching Algorithm

Use deterministic matching rather than opaque AI matching.

Conceptual process:

```text
curriculum vocabulary
→ generate language-aware lookup forms
→ exact lemma candidates
→ form candidates
→ POS comparison
→ phrase/expression comparison
→ regional evidence
→ ambiguity check
→ match status
```

Auto-match only when one clear entry exists.

Do not automatically choose the pedagogically correct sense when multiple dictionary senses exist.

Use categorical confidence:

```text
HIGH
MEDIUM
LOW
```

rather than fabricated percentages.

---

## Wiktionary / Kaikki Import

Do not scrape Wiktionary pages at runtime.

Use structured Kaikki/Wiktextract JSONL dumps.

Target architecture:

```text
Kaikki/Wiktextract JSONL
        ↓
streaming parser
        ↓
validation
        ↓
staged lexical records
        ↓
normalized relational projection
        +
raw JSONB
        ↓
finalize import
```

Learner requests read only from Polyglot's database.

Do not call Wiktionary when a learner opens an item.

---

## Import Scope

Do not import the entire dictionary into Neon by default.

Support:

```text
CURRICULUM
TERMS
FULL_LANGUAGE
```

but make:

```text
CURRICULUM
```

the initial/default mode.

Workflow:

```text
existing curriculum vocabulary
→ generate required lookup forms
→ stream the source dump
→ retain relevant entries/candidates
→ store them locally
```

This keeps storage and indexing reasonable while preserving the ability to move to full-language ingestion later.

---

## Controlled Import

Dictionary import is a controlled backend/developer operation, not a normal request handler.

Provide commands conceptually like:

```text
npm run lexicon:import
npm run lexicon:import-rla
```

The importer should:

* stream input
* use bounded memory
* batch database writes
* validate every source record
* retain source version information
* generate useful operational output
* never expose credentials

A long-running import may use the pooled DB connection intended for import/migration workloads.

---

## Import Versioning

Track every source snapshot.

Store:

```text
source
source_version
dump_date
extractor_version
commit/version
file_checksum
started_at
completed_at
status
record counts
```

Imports must be idempotent.

Importing the exact same completed source snapshot again must not duplicate lexical records.

---

## Reimports

A newer source import may change:

* definitions
* forms
* pronunciation
* tags
* synonyms
* lexical relationships

Reimport must:

```text
preserve dictionary_entries.id
retain previous raw source versions
update current lexical projection
preserve vocabulary mapping
preserve manually selected senses where possible
```

A dictionary update must never reorganize curriculum.

---

## Removed Entries and Senses

If an upstream entry disappears:

```text
source_status = MISSING_FROM_SOURCE
```

Do not delete it if Polyglot references it.

If a selected sense disappears:

```text
retain old sense
mapping → REVIEW_REQUIRED
```

Never silently select another meaning.

---

## Manual Mapping Protection

Once an admin explicitly selects:

```text
Vocabulary A
→ Dictionary Entry X
```

set:

```text
manual_lock = true
```

Future imports may update Entry X's source data but cannot automatically remap Vocabulary A to Entry Y.

If Entry X disappears, request admin review.

---

## RLA-ES

Use RLA-ES primarily for regional validation, not definitions.

Initial regional sources:

```text
es_MX
es
```

RLA provides evidence such as:

```text
RECOGNIZED
NOT_LISTED
UNKNOWN
```

Do not use a simple:

```text
mexican = false
```

when a word is absent, because absence is not sufficient proof that the form is invalid in Mexican Spanish.

Use an extensible regional model rather than a permanent `Castilian` boolean.

Future data should be able to represent:

```text
es-MX
es-ES
es-AR
es-CO
...
```

---

## RLA Import

Process the configured RLA/Hunspell resources into local relational data.

Potential:

```text
regional_lexemes
```

fields:

```text
id
source_id
lexical_import_id

region_code
word
normalized_word

affix_flags
source_data
```

Index:

```text
(region_code, normalized_word)
```

Hunspell-specific `.dic` / `.aff` handling belongs behind an RLA adapter.

Generic application code should ask:

```text
getRegionalEvidence(term, region)
```

rather than understanding Hunspell implementation details.

---

## Admin UI Integration

Extend Admin with:

```text
/admin/dictionary
```

and add Dictionary controls to vocabulary editing.

The Admin dictionary UI should support:

* mapping status
* dictionary search
* candidate comparison
* manual mapping
* selected senses
* preferred pronunciation
* regional evidence
* imported source metadata
* raw JSON inspection
* mapping review queue

Example:

```text
Dictionary Mapping

Display:
el padre

Lookup:
padre

Entry:
padre · noun

Status:
AUTO_MATCHED · High

Regional:
es-MX — Recognized

Definitions:
[x] father / male parent
[ ] priest
[ ] founder

Pronunciation:
(*) /.../
( ) /.../

[Change Mapping]
[View Raw Source]
```

---

## Admin Mapping Review

Provide a mapping table with filters.

Example:

```text
Curriculum     Lookup       Candidate      Mexico       Status
el padre       padre        padre/noun     Recognized   Auto
la madre       madre        madre/noun     Recognized   Auto
buenos días    buenos días  2 candidates   Recognized   Review
```

Filter by:

* Level
* group
* match state
* POS
* regional status
* unmatched
* review required

Admins may explicitly select a different dictionary entry.

That action must not reset learner progress.

---

## Curriculum Automation

Once a mapping exists, the vocabulary editor should automatically expose:

* lemma
* POS
* IPA
* senses
* forms
* variants
* synonyms
* usage labels
* regional information

without requiring these to be typed into Polyglot curriculum fields.

Dictionary information may also provide suggestions for:

* accepted translations
* accepted answers
* preferred sense
* pronunciation

But:

```text
suggestion ≠ curriculum publication
```

An admin explicitly accepts anything that becomes official Polyglot teaching content.

---

## Read Model

Create a backend service that composes:

```text
curriculum
+
lexicon
+
regional evidence
+
progress
```

Conceptually:

```ts
VocabularyDetail {
  curriculum: {
    displayWord
    translation
    teachingSummary
    level
    group
    examples
    creatorNotes
  }

  dictionary: {
    lemma
    partOfSpeech
    selectedSenses
    pronunciations
    forms
    synonyms
    usageLabels
    regionalEvidence
    attribution
  }

  progress: {
    ...
  }
}
```

Frontend components must not directly join Drizzle tables.

Do not expose raw dictionary JSON to ordinary learners.

---

## Learner Item Pages

This spec establishes the backend data required by vocabulary item pages.

A future/related Item Detail UI may show:

```text
Polyglot Meaning
...

Dictionary Definitions
...

Pronunciation
...

Forms
...

Regional Usage
...

Source
Wiktionary
```

Dictionary content and Polyglot-authored content should be visually distinguishable.

---

## Licensing and Attribution

Persist:

* provider
* source
* source version
* source URL/reference
* license metadata
* required attribution

Keep third-party data distinguishable from Polyglot-authored data.

Create project documentation for exact datasets and licenses before production.

Potential organization:

```text
/data-sources
/licenses
/attributions
```

Do not assume that an open dataset can be copied into a proprietary product without attribution or ShareAlike considerations.

This requirement is architectural; exact legal compliance should be verified separately before production release.

---

## Security

Imported files and JSON are untrusted.

Validate:

* source type
* encoding
* JSON structure
* maximum field lengths
* language
* record shape
* nested structures
* import file size

Do not:

* execute imported markup
* render upstream HTML directly
* permit arbitrary remote fetch URLs from the Admin UI
* interpolate imported content into SQL
* expose import credentials

Dictionary source locations should be configured server-side.

Admin mapping mutations require authoritative Admin authorization.

---

## Logging and Observability

Track:

```text
source import
source version
duration
records scanned
records retained
entries created
entries updated
AUTO_MATCHED
REVIEW_REQUIRED
UNMATCHED
import failures
rollback
```

Do not log entire source JSON objects.

Admin mapping changes should create audit events such as:

```text
DICTIONARY_MAPPING_CHANGED
DICTIONARY_MAPPING_CONFIRMED
DICTIONARY_SENSE_SELECTED
DICTIONARY_PRONUNCIATION_SELECTED
DICTIONARY_IMPORT_COMPLETED
DICTIONARY_IMPORT_ROLLED_BACK
```

---

## Indexing

Add indexes needed for:

```text
dictionary_entries(language_id, normalized_lemma)

dictionary_entries(
  language_id,
  normalized_lemma,
  part_of_speech
)

dictionary_forms(normalized_form)

dictionary_senses(dictionary_entry_id)

dictionary_relations(dictionary_entry_id)

regional_lexemes(region_code, normalized_word)

dictionary_regional_evidence(
  dictionary_entry_id,
  region_code
)

vocabulary_dictionary_mappings(vocabulary_item_id)

vocabulary_dictionary_mappings(dictionary_entry_id)

vocabulary_dictionary_mappings(match_status)
```

Do not add broad JSONB indexes unless an actual query needs them.

---

## Caching

Dictionary projections may be cached because they are shared/read-heavy.

Potential tags:

```text
dictionary-entry:{id}
vocabulary-lexicon:{itemId}
```

Invalidate only affected entries after:

* mapping changes
* source reimport
* sense selection changes
* pronunciation changes
* regional-data changes

Raw source JSON should never be required for normal cached learner responses.

---

## Rollback

A failed import must never leave half of a new source release active.

Use:

```text
import
→ stage
→ validate
→ finalize
```

Only a successful finalization becomes current.

Retain enough source/version state to restore the last valid lexical projection if a bad source import is discovered.

Rollback must not modify:

* curriculum organization
* SRS
* learner progress
* manual vocabulary placement

---

## Multilingual Requirement

Do not build the Lexicon domain around Spanish-specific table names.

Language-specific behavior belongs in adapters/providers.

Conceptually:

```text
Spanish
→ Wiktionary/Wiktextract + RLA

Japanese
→ JMdict

future language
→ appropriate lexical source
```

Generic vocabulary and curriculum APIs should not care which provider supplied the dictionary record.

---

# Final Verification

After the entire implementation is complete, run the full test/verification pass once.

### Type / Static Verification

```text
npm run typecheck
npm run lint
npm run build
```

All must pass.

### Unit Tests

Test at minimum:

```text
Unicode normalization
accent preservation

el padre → padre
la madre → madre
él remains distinct from el
sí remains distinct from si

exact lemma match
form match
multiple candidates
POS conflict
phrase handling

AUTO_MATCHED
REVIEW_REQUIRED
MANUAL
UNMATCHED

sense selection
pronunciation selection

RLA recognized
RLA not listed
RLA unknown

idempotent source import
manual mapping preservation
removed source entry
removed selected sense
```

### Import Tests

Use small deterministic Wiktextract fixture JSONL files rather than real full-language dumps in CI.

Include fixtures for:

```text
simple noun
multi-sense noun
verb/forms
pronunciation
synonyms
homonym
multiword phrase
accent pair
malformed row
missing optional fields
```

Verify streaming behavior and transaction safety.

### Integration Tests

Against the real integration DB strategy, verify:

```text
source import persists
raw JSON version retained
relational projection created

vocabulary maps to dictionary entry
selected senses persist

reimport preserves internal entry ID
reimport preserves curriculum mapping
manual mapping cannot be replaced

removed selected sense → REVIEW_REQUIRED

RLA evidence relates correctly

dictionary import never modifies:
  user_item_progress
  user_level_progress
  SRS
  curriculum level
  curriculum group
```

### Browser/Admin Test

Test one full real workflow:

```text
Admin creates:

el padre
father
Level 1
Family

→ dictionary lookup derives "padre"
→ matching finds padre / noun
→ lexical metadata appears
→ Mexican regional evidence appears
→ Admin selects correct sense
→ Admin publishes vocabulary
→ learner projection contains curriculum + dictionary data
```

Then test an ambiguous vocabulary item:

```text
multiple candidates
→ REVIEW_REQUIRED
→ admin manually selects entry
→ mapping becomes MANUAL
→ reimport cannot replace mapping
```

### Regression

Finally run the existing complete project test suite to verify Lexicon changes did not break:

* lessons
* reviews
* curriculum
* progress
* Admin
* database migrations/build

Update:

```text
architecture.md
progress-tracker.md
```

only after all final verification passes.
