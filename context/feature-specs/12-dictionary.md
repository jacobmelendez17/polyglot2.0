# Spec 12 — Lexicon & Dictionary Integration

## 1. Goal

Build Polyglot's production-quality external lexical-data system.

The system integrates:

```text
Wiktionary / Wiktextract / Kaikki
+
RLA-ES regional Spanish resources
```

with existing Polyglot vocabulary items.

The primary goal is to eliminate unnecessary manual vocabulary authoring.

After implementation, an admin should be able to create:

```text
Level: 1
Group: Family
Display word: el padre
Translation: father
```

and have Polyglot locate or suggest the corresponding lexical information:

```text
lemma: padre
part of speech: noun
dictionary definitions: [...]
IPA: [...]
forms: [...]
variants: [...]
synonyms: [...]
usage labels: [...]
regional evidence:
    es-MX: recognized
dictionary source: Wiktionary
regional source: RLA-ES
```

without manually entering that linguistic metadata.

The admin remains in control of:

```text
curriculum placement
learner-facing translation
teaching meaning
selected dictionary senses
examples used as official curriculum
special regional decisions
creator notes
publication
```

Dictionary integration applies to **vocabulary only**.

Grammar remains fully owned by the existing curriculum/grammar system.

---

# 2. Core Architecture

External dictionary data must remain separate from Polyglot curriculum.

Use:

```text
Vocabulary Item
      │
      │ stable relational mapping
      ▼
Dictionary Entry
      │
      ├── Dictionary senses
      ├── Forms
      ├── Pronunciations
      ├── Lexical relationships
      ├── Raw source JSON
      │
      └── Regional evidence
             │
             └── RLA-ES
```

Conceptually:

```text
curriculum.vocabulary_items
        │
        ▼
vocabulary_dictionary_mappings
        │
        ▼
dictionary_entries
        │
        ├── dictionary_senses
        ├── dictionary_forms
        ├── dictionary_pronunciations
        ├── dictionary_relations
        └── dictionary_entry_versions

dictionary_entries
        │
        ▼
dictionary_regional_evidence
        │
        ▼
RLA-ES source data
```

Polyglot must never turn Wiktionary itself into the curriculum.

---

# 3. Domain Boundary

Introduce:

```text
domains/lexicon/
```

The `lexicon` domain owns:

```text
external dictionary sources
external lexical entry storage
dictionary source imports
source version tracking
source normalization
dictionary-entry matching
vocabulary-to-dictionary mapping
dictionary senses
pronunciations
forms
lexical relationships
regional lexical evidence
source provenance
dictionary projections
```

The existing `curriculum` domain continues to own:

```text
levels
groups/themes
display word
curriculum ordering
translation
teaching meaning
official examples
creator notes
curriculum tags
publication state
```

The Admin domain orchestrates review/mapping workflows but does not reimplement lexical rules.

---

# 4. Critical Invariant

External lexical information can enrich curriculum but cannot silently modify authoritative curriculum.

Therefore:

```text
dictionary import
≠
curriculum publication
```

A dictionary update must never automatically change:

```text
level
group
lesson position
SRS
learner progress
official translation
official teaching meaning
official example
creator notes
```

Dictionary updates are independent from curriculum progression.

---

# 5. Curriculum-Owned vs Dictionary-Owned Fields

## Curriculum-owned

Keep these under Polyglot control:

```text
display_word
translation
level
group/theme
curriculum order
lesson priority
teaching meaning
official example
official example translation
creator notes
curriculum tags
publication state
```

## Dictionary-derived

Normally derive these from the mapped dictionary entry:

```text
lemma
part of speech
dictionary definitions
IPA
pronunciation metadata
inflected forms
variants
synonyms
antonyms
usage labels
regional labels
dictionary examples
lexical relationships
etymological metadata where retained
```

This replaces unnecessary manual duplication.

---

# 6. Do Not Copy Dictionary Data into Curriculum by Default

Avoid schema such as:

```text
vocabulary_items.ipa
vocabulary_items.pos
vocabulary_items.wiktionary_definition
vocabulary_items.wiktionary_synonyms
vocabulary_items.wiktionary_forms
```

when the value simply duplicates an imported dictionary record.

Instead:

```text
vocabulary
→ mapping
→ dictionary projection
```

The learner/admin read model may combine both domains into one response.

---

# 7. Manual Overrides

Admins must still be able to override how imported lexical data is presented.

An override does not modify the imported source record.

Example:

```text
Wiktionary IPA:
[paˈðɾe]

Admin preference:
use this pronunciation ✓
```

or:

```text
Wiktionary senses:

1. father; male parent
2. priest
3. originator

Polyglot Level 1:
teach sense 1 only
```

The raw dictionary source remains untouched.

---

# 8. Primary Dictionary Source

Initial Spanish lexical source:

```text
Wiktionary
via Wiktextract / Kaikki structured data
```

Prefer structured extraction rather than HTML scraping.

Wiktextract provides JSON objects containing fields such as:

```text
word
language
language code
part of speech
senses
forms
sounds/pronunciations
synonyms
antonyms
related terms
examples
translations
usage tags
topics
etymology
```

and distributes large exports as JSON Lines, one object per line.

---

# 9. Wiktionary Edition

For the initial Spanish course, prefer Spanish lexical entries extracted from the **English-language Wiktionary edition** because Polyglot's initial learner language is English.

This makes the imported sense glosses useful to an English-speaking learner.

Do not hardcode this assumption throughout the domain.

Represent it as source configuration:

```text
provider = wiktionary
extractor = wiktextract
distribution = kaikki
source_edition = enwiktionary
entry_language = es
```

A future language could instead use:

```text
Japanese → JMdict
```

without redesigning curriculum tables.

---

# 10. Source Registry

Add a source registry.

Recommended table:

```text
lexical_sources
```

Suggested fields:

```text
id
code
provider
source_type
display_name
source_language
entry_language
homepage_url
license_metadata
attribution_text
active_import_id
created_at
updated_at
```

Example:

```text
code: wiktionary-en-es
provider: wiktionary
source_type: dictionary
source_language: en
entry_language: es
```

and:

```text
code: rla-es-mx
provider: rla-es
source_type: regional_lexicon
entry_language: es-MX
```

Avoid database columns named specifically:

```text
wiktionary_id
rla_data
```

throughout the application.

Provider-specific details belong behind the lexicon abstraction.

---

# 11. Import Snapshots

Every imported source release receives its own immutable import record.

Recommended table:

```text
lexical_imports
```

Fields:

```text
id
source_id
source_version
source_dump_date
extractor_version
source_commit
file_checksum
started_at
completed_at
status
records_read
records_matched
records_created
records_updated
records_failed
error_summary
created_by_user_id nullable
```

Statuses:

```text
STAGED
IMPORTING
VALIDATING
COMPLETED
FAILED
ROLLED_BACK
```

Never overwrite the identity of an earlier import.

---

# 12. Source Versioning

For Kaikki/Wiktextract record:

```text
Wiktionary dump date
Wiktextract version / commit
Kaikki extraction date where available
input file checksum
import timestamp
```

For RLA-ES record:

```text
repository/source version
commit SHA
.dic checksum
.aff checksum
region code
import timestamp
```

This makes imports reproducible and auditable.

---

# 13. Dictionary Entries

Add:

```text
dictionary_entries
```

Recommended fields:

```text
id UUID PK

language_id
source_id

lemma
normalized_lemma
part_of_speech

source_entry_key nullable

source_status
current_source_version_id nullable

created_at
updated_at
```

`id` is Polyglot's stable internal dictionary-entry ID.

Do not assume Wiktionary gives Polyglot a permanent universal entry ID.

---

# 14. Source Identity

External identity and internal identity are different.

Use:

```text
dictionary_entries.id
```

as the stable Polyglot identifier.

An upstream Wiktionary entry may be identified during reimport using a combination such as:

```text
language
word
part of speech
etymology information
provider identifiers when available
```

If upstream identity is ambiguous, do not silently merge records.

Send the candidate to import review.

---

# 15. Raw Source Preservation

Add:

```text
dictionary_entry_versions
```

Each imported dictionary version retains its original source object.

Fields:

```text
id
dictionary_entry_id
lexical_import_id

source_record_key
source_hash

raw_data JSONB

created_at
```

Do not destroy earlier raw source data when Wiktionary changes.

Conceptually:

```text
dictionary entry X

version A → source JSON from March
version B → source JSON from June
version C → source JSON from September
```

The entry remains stable.

---

# 16. Why Keep Raw JSON

The imported JSON must be retained because Wiktextract contains considerably more information than Polyglot will initially expose.

Future features may need:

```text
etymology
additional pronunciation metadata
hyphenation
topics
rare forms
antonyms
hypernyms
related words
Wikidata IDs
audio metadata
```

Retaining the source object avoids having to re-download historical source data simply because a new field becomes useful.

---

# 17. Hybrid Relational + JSONB Model

Do **not** choose between fully normalized data and one giant JSON blob.

Use both.

```text
raw source JSON
+
normalized relational projection
```

Normalize fields Polyglot must:

```text
search
match
select
filter
relate
display frequently
```

Keep less frequently used/provider-specific fields inside the raw JSON.

---

# 18. Dictionary Senses

Add:

```text
dictionary_senses
```

Fields:

```text
id
dictionary_entry_id

source_sense_key nullable
source_fingerprint

sense_order
gloss
raw_gloss nullable

tags
topics

source_status

first_seen_import_id
last_seen_import_id

created_at
updated_at
```

One Wiktionary entry may contain many senses.

---

# 19. Sense Selection Is Required Now

Do not defer sense selection.

The entire point of this integration is allowing the administrator to control which dictionary meaning maps to the curriculum vocabulary.

Add:

```text
vocabulary_selected_senses
```

Fields:

```text
vocabulary_dictionary_mapping_id
dictionary_sense_id

is_primary
display_order

created_at
```

Example:

```text
padre

Wiktionary:
1. father; male parent        ← selected
2. priest
3. founder/originator
```

Polyglot can expose the full dictionary while teaching only the intended sense.

---

# 20. Removed or Changed Senses

Never physically remove an imported sense solely because the next Wiktionary dump does not contain it.

Mark it:

```text
MISSING_FROM_SOURCE
```

If a vocabulary item selected that sense:

```text
mapping status → REVIEW_REQUIRED
```

Do not automatically replace it with another sense.

---

# 21. Dictionary Forms

Add:

```text
dictionary_forms
```

Fields:

```text
id
dictionary_entry_id

form
normalized_form

tags
source_data JSONB nullable

first_seen_import_id
last_seen_import_id
source_status
```

Forms may represent:

```text
plural
feminine
masculine
past forms
participles
alternative spellings
other inflections
```

These are dictionary data rather than new curriculum vocabulary items by default.

---

# 22. Pronunciations

Add:

```text
dictionary_pronunciations
```

Fields:

```text
id
dictionary_entry_id

ipa nullable

region_tags
usage_tags

audio_source nullable
audio_url nullable

source_data JSONB nullable

first_seen_import_id
last_seen_import_id
source_status
```

A word may have several pronunciations.

Admins can select a preferred pronunciation when necessary.

---

# 23. Preferred Pronunciation

Add an optional preference to the vocabulary/dictionary mapping:

```text
preferred_pronunciation_id
```

or an equivalent relational preference table.

Default behavior may choose a sensible source pronunciation.

The admin can explicitly override it.

---

# 24. Lexical Relationships

Add:

```text
dictionary_relations
```

Fields:

```text
id
dictionary_entry_id
dictionary_sense_id nullable

relation_type

target_word
normalized_target_word

tags
topics

source_data JSONB nullable
```

Supported relationship types may include:

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

Do not require every relation target to already exist as a Polyglot curriculum item.

---

# 25. Vocabulary Mapping

Add:

```text
vocabulary_dictionary_mappings
```

Recommended fields:

```text
id

vocabulary_item_id UNIQUE
dictionary_entry_id

lookup_form

match_status
match_method
confidence_tier

manual_lock

mapped_by_user_id nullable
mapped_at

preferred_pronunciation_id nullable

created_at
updated_at
```

This is the central relationship.

---

# 26. Mapping States

Use:

```text
UNMATCHED
AUTO_MATCHED
REVIEW_REQUIRED
MANUAL
```

### UNMATCHED

No usable candidate exists.

### AUTO_MATCHED

The matcher found one unambiguous high-confidence entry.

### REVIEW_REQUIRED

Potential matches exist but Polyglot cannot safely choose one.

### MANUAL

An administrator explicitly chose the mapping.

---

# 27. Manual Mapping Lock

When an administrator explicitly chooses a dictionary entry:

```text
manual_lock = true
```

Future imports must not silently change the mapped dictionary entry.

If that upstream dictionary entry disappears:

```text
keep mapping
mark source stale/missing
request review
```

Do not silently remap it to another entry.

---

# 28. Display Word vs Lemma

These are separate concepts.

Example:

```text
display_word = "el padre"
dictionary lemma = "padre"
```

The learner-facing word intentionally includes gender information.

The dictionary lookup should not require Wiktionary to contain:

```text
el padre
```

as the lemma.

---

# 29. Spanish Lookup Provider

Spanish-specific normalization belongs behind a language/provider boundary.

Conceptually:

```text
deriveDictionaryLookups(vocabularyItem)
```

For:

```text
el padre
```

the Spanish lookup provider may generate:

```text
el padre
padre
```

For:

```text
la familia
```

generate:

```text
la familia
familia
```

Do not put Spanish article stripping in generic repository code.

---

# 30. Article Handling

For Spanish nouns, permitted article-aware lookup may understand:

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

but only when the curriculum record and Spanish language configuration make the transformation appropriate.

Do not blindly strip the first word from every phrase.

---

# 31. Accent Preservation

Normalization may perform:

```text
trim whitespace
Unicode normalization
case normalization
controlled punctuation normalization
```

It must **not** remove diacritics.

These remain different:

```text
el ≠ él
tu ≠ tú
si ≠ sí
como ≠ cómo
```

This follows Polyglot's existing language-integrity rule.

---

# 32. Multiword Phrases

Do not split every multiword curriculum item into a single lemma.

Examples:

```text
buenos días
por favor
de nada
```

should first attempt exact phrase/expression matching.

Possible behavior:

```text
exact phrase entry exists
→ candidate

no exact phrase
→ REVIEW_REQUIRED or UNMATCHED
```

Do not invent a synthetic dictionary entry from individual words.

---

# 33. Mapping Algorithm

Use deterministic matching tiers instead of opaque AI matching.

Suggested sequence:

```text
1. Generate language-aware lookup forms.
2. Search exact normalized dictionary lemmas.
3. Search exact normalized dictionary forms.
4. Compare part of speech if curriculum POS is known.
5. Compare phrase/expression status.
6. Evaluate form_of / alt_of relationships.
7. Add regional evidence where available.
8. Determine candidate cardinality.
9. Assign match status.
```

---

# 34. Automatic Matching

An item may be `AUTO_MATCHED` when:

```text
one clear candidate exists
+
lookup form matches exactly
+
language matches
+
part of speech does not conflict
+
no unresolved ambiguity exists
```

Do not automatically select between several plausible senses or homonymous dictionary entries.

---

# 35. Review-Required Matching

Use `REVIEW_REQUIRED` when:

```text
multiple exact entries exist
part of speech conflicts
several homonyms exist
phrase handling is ambiguous
dictionary entry identity changed
selected dictionary sense disappeared
regional evidence is unusual
```

The admin resolves it.

---

# 36. Confidence

Use categorical confidence:

```text
HIGH
MEDIUM
LOW
```

rather than exposing a fake precision such as:

```text
93.7%
```

unless the matching algorithm later has a genuinely calibrated statistical confidence model.

Initial matching is deterministic/rule-based.

---

# 37. RLA-ES Role

RLA-ES is **not** Polyglot's definition source.

Use it as regional lexical evidence.

Initial resources:

```text
es_MX
es
```

where:

```text
es_MX = Mexican Spanish
es = general/international Spanish
```

The project contains regional dictionaries across many Spanish varieties and describes RLA-ES primarily as spelling/language-assistance resources.

---

# 38. RLA Absence Does Not Mean Invalid

RLA explicitly notes that regional coverage can vary in completeness.

Therefore never model:

```text
Mexico:
true / false
```

as though absence were proof that a word is not Mexican Spanish.

Use:

```text
RECOGNIZED
NOT_LISTED
UNKNOWN
```

This distinction matters.

---

# 39. Regional Evidence

Add:

```text
dictionary_regional_evidence
```

Fields:

```text
id
dictionary_entry_id

source_id
lexical_import_id

region_code

status
matched_form nullable

evidence_data JSONB nullable

created_at
updated_at
```

Example:

```text
entry: padre
region: es-MX
status: RECOGNIZED
```

---

# 40. Future Regional Model

Do not create:

```text
vocabulary_items.castilian boolean
```

Instead support:

```text
es-MX
es-ES
es-AR
es-CO
...
```

through data.

Future languages may also require regional variants.

---

# 41. RLA Import Pipeline

RLA-ES uses Hunspell-style dictionary resources.

The import process should consume the appropriate:

```text
.dic
.aff
```

files for each configured region.

Initial regions:

```text
es-MX
es
```

Do not perform RLA parsing during learner page requests.

---

# 42. RLA Lexical Records

Add, if required by implementation:

```text
regional_lexemes
```

Suggested fields:

```text
id

source_id
lexical_import_id

region_code

word
normalized_word

affix_flags nullable

source_data JSONB nullable
```

Index:

```text
(region_code, normalized_word)
```

This lets local mapping/validation avoid live RLA access.

---

# 43. Hunspell Rules

The `.aff` rules may affect whether generated/inflected forms are accepted.

Do not assume that checking only literal `.dic` lines fully represents the regional dictionary.

The RLA adapter should isolate Hunspell-specific logic behind:

```text
RegionalLexiconProvider
```

The rest of Polyglot should ask:

```text
getRegionalEvidence(term, region)
```

not:

```text
readHunspellAffFile(...)
```

---

# 44. Admin Dictionary UI

Extend Spec 11 with:

```text
/admin/dictionary
```

Suggested sections:

```text
Mappings
Entries
Sources
Imports
Review Queue
```

---

# 45. Vocabulary Editor Integration

The Admin Vocabulary editor should gain a:

```text
Dictionary
```

section.

Example:

```text
Dictionary Mapping

Display word
el padre

Lookup
padre

Mapped Entry
padre — noun                         [Change]

Match
AUTO_MATCHED · High confidence

Mexican Spanish
Recognized by RLA-ES es-MX

Definitions
☑ father; male parent
☐ priest
☐ founder or originator

Pronunciation
◉ /.../
○ /.../

Forms
✓ padres

Synonyms
[ ...]

[View Raw Source JSON]
```

---

# 46. Raw JSON Viewer

Admins may inspect the exact imported source object.

Provide:

```text
View Raw Source
```

with:

```text
formatted JSON
source name
source version
import date
checksum/version metadata
```

Raw JSON is Admin-only.

Do not send the entire raw source JSON to ordinary learner pages.

---

# 47. Mapping Search

Admins must be able to manually search dictionary entries.

Search by:

```text
lemma
form
part of speech
```

Example:

```text
Search dictionary: padre
```

Result:

```text
padre · noun
padre · interjection
...
```

Each result may expand to show:

```text
definitions
forms
IPA
usage labels
regional evidence
```

---

# 48. Change Mapping

An admin can explicitly replace:

```text
Vocabulary item A
→ Dictionary entry X
```

with:

```text
Vocabulary item A
→ Dictionary entry Y
```

Require confirmation when the vocabulary item is already published.

The action must be auditable.

Do not reset learner progress.

---

# 49. Bulk Mapping Review

Provide:

```text
/admin/dictionary/mappings
```

Example:

```text
Curriculum     Lookup       Match        Mexico     Status
el padre       padre        padre noun   Recognized Auto
la madre       madre        madre noun   Recognized Auto
él             él           él pronoun   Recognized Auto
buenos días    buenos días  2 matches    Recognized Review
...
```

Filters:

```text
Unmatched
Auto matched
Review required
Manual
Level
Group
Part of speech
Regional status
```

---

# 50. Curriculum Automation

Dictionary mapping should reduce the amount of required Admin input.

After successful mapping, automatically make available:

```text
lemma
POS
IPA
dictionary definitions
forms
variants
synonyms
usage labels
regional evidence
```

without copying those values into curriculum fields.

---

# 51. Dictionary Suggestions

The system may suggest curriculum information from dictionary data.

Examples:

```text
Suggested translation
Suggested accepted answers
Suggested sense
Suggested pronunciation
```

However:

```text
suggest
≠
publish
```

An admin must explicitly accept a suggestion before it becomes Polyglot-authored curriculum data.

---

# 52. Teaching Meaning

Dictionary definitions must not automatically replace:

```text
teaching_summary
```

A source definition may be:

```text
precise
technical
archaic
too broad
too advanced
```

for the learner's level.

Polyglot teaching explanations remain curriculum-owned.

---

# 53. Accepted Answers

Dictionary senses and synonyms may generate candidate accepted answers.

Example:

```text
dictionary:
father
male parent
```

Admin:

```text
Accepted answers:
☑ father
☐ male parent
```

Do not automatically turn every dictionary synonym/gloss into a valid quiz answer.

---

# 54. Dictionary Examples

Wiktionary examples may be imported and displayed in the Admin dictionary panel.

They are not automatically promoted to:

```text
official Polyglot example
```

An administrator must explicitly select/use them.

Their external-source provenance must remain known.

---

# 55. Learner Vocabulary Projection

Add a service conceptually similar to:

```text
getVocabularyDetail(itemId, userId)
```

which composes:

```text
curriculum vocabulary
+
selected lexical mapping
+
dictionary projection
+
regional evidence
+
user progress
```

The frontend should not join these concepts itself.

---

# 56. Example Read Model

Return a safe DTO conceptually shaped like:

```text
VocabularyDetail {
  curriculum: {
    displayWord
    translation
    teachingMeaning
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

Do not return Drizzle rows or raw source JSON to learners.

---

# 57. Learner Dictionary Display

Vocabulary information pages may eventually show:

```text
Meaning
Polyglot learner-friendly meaning

Dictionary
1. ...
2. ...

Pronunciation
...

Forms
...

Regional usage
...

Source
Wiktionary
```

The exact visual Item Detail page can remain in its own UI spec.

This spec establishes the backend read model.

---

# 58. Import Strategy

Do not make Wiktionary requests when a learner opens a vocabulary page.

Target:

```text
External source snapshot
        ↓
controlled importer
        ↓
Polyglot lexicon database
        ↓
Vocabulary relationship
        ↓
learner/admin read model
```

Learner runtime reads Polyglot's database only.

---

# 59. Do Not Import the Entire Dictionary by Default

V1 should use **curriculum-scoped ingestion**.

Current Kaikki Spanish datasets are large enough that storing the entire raw corpus plus normalized projections and indexes in Neon would conflict with Polyglot's existing free-tier cost posture.

Initial workflow:

```text
current curriculum vocabulary
        ↓
generate target lookup forms
        ↓
stream dictionary source
        ↓
retain relevant entries/candidates
        ↓
store raw JSON + relational projection
```

---

# 60. Import Scope Modes

Design the importer to support:

```text
CURRICULUM
TERMS
FULL_LANGUAGE
```

### CURRICULUM

Import entries needed for current vocabulary.

Default v1 mode.

### TERMS

Import data for an explicit list of terms.

Useful for newly added vocabulary.

### FULL_LANGUAGE

Import the complete language dictionary.

Supported architecturally but not the default until storage/cost justifies it.

---

# 61. New Vocabulary After Initial Import

If an admin adds:

```text
el aeropuerto
```

but no matching local dictionary candidate exists:

```text
dictionary status:
SOURCE_DATA_NOT_IMPORTED
```

The admin may request that term for the next controlled lexical import.

Do not incorrectly label it:

```text
UNMATCHED
```

until the relevant source data has actually been searched.

---

# 62. Controlled Import Command

Large dictionary ingestion should not run inside an ordinary Vercel request.

Provide a controlled import entry point such as:

```text
npm run lexicon:import
```

Conceptual options:

```text
--source wiktionary-en-es
--scope curriculum
--file <local-jsonl>
```

and:

```text
npm run lexicon:import-rla
```

The exact CLI syntax may differ.

---

# 63. Streaming

Never load the entire dictionary source into memory.

Kaikki/Wiktextract exports use JSON Lines specifically so they can be processed record-by-record.

Pipeline:

```text
read line
→ JSON parse
→ boundary validate
→ determine relevance
→ normalize
→ batch
→ persist
→ continue
```

---

# 64. Import Database Connection

Long-running dictionary imports may use the pooled database connection intended for migrations/import workloads.

Do not use a request-scoped serverless handler for long-running source ingestion.

This follows the existing database architecture.

---

# 65. Import Validation

External dictionary data is untrusted input.

Validate:

```text
JSON shape
language
word
part of speech
senses
forms
pronunciations
relationship structures
maximum field sizes
source version
encoding
```

Unknown JSON fields may be preserved inside:

```text
raw_data
```

without becoming trusted application fields.

---

# 66. Reimport Strategy

Dictionary imports must be idempotent.

Importing the same source snapshot twice must not duplicate:

```text
entries
senses
forms
pronunciations
relations
regional evidence
```

Identify the source snapshot by metadata/checksum.

If already completed:

```text
SOURCE_VERSION_ALREADY_IMPORTED
```

unless an explicit administrative recovery operation is requested.

---

# 67. Updating Existing Entries

A new source version may change:

```text
glosses
forms
IPA
tags
relations
examples
```

Reimport should:

```text
preserve dictionary_entries.id
retain old raw source version
create new source version record
update the current normalized projection
mark removed data as missing
preserve vocabulary mapping
```

It must not modify curriculum organization.

---

# 68. Mapping Preservation

A dictionary reimport must never silently change:

```text
vocabulary_dictionary_mappings.dictionary_entry_id
```

for an already confirmed mapping.

For `AUTO_MATCHED` mappings:

* re-evaluate integrity
* keep the existing mapping when still valid
* if no longer valid, mark `REVIEW_REQUIRED`

Do not jump automatically to a different lexical entry.

---

# 69. Selected Sense Preservation

During reimport:

```text
old selected sense
→ try stable source sense identifier
→ otherwise compare source fingerprint
```

If confidently preserved:

```text
keep selection
```

If not:

```text
retain old record
mark it missing
mapping → REVIEW_REQUIRED
```

Never silently select a new meaning.

---

# 70. Source Deletion / Rename

If a dictionary entry disappears from a later source:

```text
dictionary_entries.source_status =
MISSING_FROM_SOURCE
```

Keep:

```text
stable entry
old source version
curriculum mapping
selected senses
source history
```

Admin can review it later.

---

# 71. Staged Import Finalization

Do not let partially processed dictionary data become current.

Use:

```text
parse
→ stage
→ validate
→ normalize
→ finalize
```

Only finalization changes the active/current source projection.

If parsing fails halfway through:

```text
current dictionary data remains unchanged
```

---

# 72. Import Rollback

Because raw versions are retained, an administrator/developer must be able to restore the previous successful source projection.

Conceptually:

```text
Import 12 active
↓ bad source discovered
Rollback to Import 11
```

Rollback:

```text
rebuild current normalized projection
from previous retained source version
```

It must not affect:

```text
curriculum placement
learner progress
SRS
```

---

# 73. Source Import Logs

Log:

```text
source
version
checksum
records examined
records retained
entries created
entries updated
ambiguous identities
mapping reviews created
duration
failure code
```

Do not dump entire Wiktionary records into application logs.

---

# 74. Observability

Measure:

```text
import duration
records/sec
DB batch duration
matching success rate
AUTO_MATCHED count
REVIEW_REQUIRED count
UNMATCHED count
source data missing count
```

These are operational metrics.

Do not send large dictionary payloads to Sentry or PostHog.

---

# 75. Indexes

At minimum add indexes supporting:

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

Do not add GIN indexes to raw JSON merely because the column is JSONB.

Add a JSON index only when an actual query requires it.

---

# 76. Query Performance

Normal vocabulary page loading should not parse raw JSON.

Use normalized relational data for frequently displayed fields.

Raw JSON is for:

```text
history
future extraction
admin inspection
reprocessing
```

not ordinary page rendering.

---

# 77. Caching

The lexical projection is read-heavy and may be cached.

Possible cache tags:

```text
dictionary-entry:{id}
vocabulary-lexicon:{vocabularyItemId}
dictionary-source:{sourceId}
```

Invalidate when:

```text
dictionary mapping changes
selected senses change
preferred pronunciation changes
source import updates that entry
regional evidence changes
```

Do not invalidate unrelated vocabulary.

---

# 78. Admin Authorization

All mapping changes require:

```text
admin
```

authorization.

`developer` may inspect dictionary/import diagnostics but cannot change official vocabulary mapping unless that account also has the admin role.

Reuse Spec 11 authorization.

---

# 79. Audit Events

Add administrative audit actions such as:

```text
DICTIONARY_MAPPING_AUTO_CREATED
DICTIONARY_MAPPING_CHANGED
DICTIONARY_MAPPING_MANUALLY_CONFIRMED
DICTIONARY_SENSE_SELECTED
DICTIONARY_SENSE_REMOVED
DICTIONARY_PRONUNCIATION_SELECTED
DICTIONARY_IMPORT_COMPLETED
DICTIONARY_IMPORT_ROLLED_BACK
REGIONAL_SOURCE_IMPORTED
```

Automated bulk matching may use one import-level audit event plus per-item records only where necessary.

---

# 80. Concurrency

Admin mapping edits must use the same optimistic conflict protection as the Admin spec.

If two admins modify the same mapping:

```text
LEXICON_MAPPING_CONFLICT
```

Do not silently use last-write-wins.

---

# 81. Structured Errors

Possible errors:

```text
DICTIONARY_ENTRY_NOT_FOUND
DICTIONARY_MAPPING_NOT_FOUND
DICTIONARY_MAPPING_CONFLICT
DICTIONARY_SOURCE_DATA_NOT_IMPORTED
DICTIONARY_AMBIGUOUS_MATCH
DICTIONARY_SENSE_NOT_FOUND
DICTIONARY_SENSE_STALE

LEXICON_IMPORT_INVALID
LEXICON_IMPORT_FAILED
LEXICON_IMPORT_ALREADY_EXISTS
LEXICON_IMPORT_NOT_FINALIZED

REGIONAL_SOURCE_NOT_AVAILABLE

FORBIDDEN
RATE_LIMITED
```

---

# 82. Security

Never allow an Admin browser to submit an arbitrary remote URL and instruct the backend to fetch it.

Configured source locations must be controlled server-side.

This prevents the dictionary importer from becoming an SSRF/network-access mechanism.

Validate:

```text
source
file
format
size
JSON
encoding
```

Treat imported text as plain data.

Do not render Wiktionary HTML directly.

---

# 83. Source Licensing

Dictionary provenance is a product requirement, not optional metadata.

Kaikki states that its Wiktionary-derived dictionary data is distributed under the same licenses as Wiktionary, including CC-BY-SA and GFDL.

RLA-ES currently describes its dictionaries under a selectable multi-license arrangement including GPL 3+, LGPL 3+, or MPL 1.1+, with its synonym resource licensed separately.

Before production, record the exact source and chosen legal basis for every imported resource.

This spec is not legal advice.

---

# 84. Attribution Architecture

Add source attribution metadata sufficient to render:

```text
Dictionary information from Wiktionary
Structured using Wiktextract / Kaikki
Source version: ...
License: ...
```

and:

```text
Regional lexical validation: RLA-ES
Region: es-MX
Version: ...
License: ...
```

Do not hardcode attribution strings across UI components.

Resolve them through:

```text
lexical_sources
```

---

# 85. Keep Licensed Data Distinguishable

Polyglot must be able to distinguish:

```text
Polyglot-authored content
```

from:

```text
Wiktionary-derived content
RLA-derived data
```

Do not copy dictionary definitions into `teaching_summary` automatically.

Source-derived learner-facing material should retain its provenance.

---

# 86. Suggested Code Organization

```text
domains/
  lexicon/
    types.ts
    normalization.ts

    dictionary/
      entry-types.ts
      entry-repository.ts
      entry-service.ts
      projection-service.ts

    matching/
      match-types.ts
      candidate-service.ts
      matching-service.ts
      spanish-matching.ts

    sources/
      source-types.ts
      source-repository.ts

      wiktextract/
        adapter.ts
        parser.ts
        normalizer.ts

      rla/
        adapter.ts
        parser.ts
        regional-service.ts

    imports/
      import-service.ts
      import-repository.ts
      import-finalizer.ts

    server.ts
    index.ts

db/schema/
  lexicon.ts

scripts/
  lexicon/
    import-wiktionary.ts
    import-rla.ts
    rematch-curriculum.ts

components/admin/dictionary/
  mapping-panel.tsx
  entry-search.tsx
  dictionary-entry-preview.tsx
  sense-selector.tsx
  pronunciation-selector.tsx
  regional-evidence.tsx
  raw-json-viewer.tsx
  mapping-review-table.tsx
  source-import-history.tsx
```

---

# 87. Migration Strategy

Implement through additive Drizzle migrations.

Suggested migration grouping:

```text
Migration A
lexical_sources
lexical_imports
dictionary_entries
dictionary_entry_versions

Migration B
dictionary_senses
dictionary_forms
dictionary_pronunciations
dictionary_relations

Migration C
vocabulary_dictionary_mappings
vocabulary_selected_senses

Migration D
regional_lexemes
dictionary_regional_evidence

Migration E
indexes
```

Follow the existing migration rule:

```text
never rewrite an applied migration
```

and review generated migrations before application.

---

# 88. Implementation Units

## Unit 1 — Lexicon domain and source registry

Implement:

```text
lexicon domain
lexical_sources
lexical_imports
source metadata
source/version types
```

Seed/configure:

```text
Wiktionary / Wiktextract / Kaikki
RLA-ES es-MX
RLA-ES es
```

No vocabulary mapping yet.

---

## Unit 2 — Dictionary entry storage

Implement:

```text
dictionary_entries
dictionary_entry_versions
raw JSONB retention
stable internal identity
source lifecycle
```

Create repository/service boundaries.

---

## Unit 3 — Wiktextract normalization

Implement streaming parsing for:

```text
word
language
POS
senses
forms
sounds
relations
```

Add:

```text
dictionary_senses
dictionary_forms
dictionary_pronunciations
dictionary_relations
```

Retain complete source JSON.

---

## Unit 4 — Curriculum-scoped importer

Build the controlled importer.

Flow:

```text
query curriculum vocabulary
→ derive lookup targets
→ stream Wiktextract JSONL
→ retain candidate entries
→ stage
→ validate
→ persist
→ finalize source import
```

Verify bounded memory usage.

---

## Unit 5 — Vocabulary mapping engine

Implement:

```text
language-aware lookup generation
article handling
accent-preserving normalization
exact lemma matching
form matching
POS filtering
phrase handling
match status
confidence tier
```

No Admin UI yet.

---

## Unit 6 — Sense selection and lexical preferences

Implement:

```text
vocabulary_dictionary_mappings
vocabulary_selected_senses
preferred pronunciation
manual lock
mapping history/audit integration
```

Verify a multi-sense entry can teach only selected meanings.

---

## Unit 7 — RLA-ES integration

Implement:

```text
RLA source import
es-MX
general es
regional lexeme lookup
regional evidence projection
```

Verify:

```text
RECOGNIZED
NOT_LISTED
UNKNOWN
```

semantics.

---

## Unit 8 — Reimport/version handling

Implement:

```text
idempotent imports
entry updates
raw source history
removed-source detection
selected-sense preservation
mapping preservation
review-required transitions
rollback
```

---

## Unit 9 — Admin mapping UI

Extend Spec 11.

Implement:

```text
/admin/dictionary

mapping panel
dictionary search
candidate comparison
sense selection
pronunciation selection
regional evidence
raw JSON viewer
manual mapping
mapping review queue
```

---

## Unit 10 — Vocabulary Admin automation

Integrate dictionary data into the Admin Vocabulary editor.

After entering:

```text
display word
language
translation
```

allow:

```text
Find Dictionary Data
```

or automatically run the local mapping service.

Populate dictionary-backed metadata without requiring manual duplication.

---

## Unit 11 — Vocabulary read projection

Build the application service combining:

```text
curriculum
+
dictionary
+
regional
+
progress
```

Do not implement the entire learner Item Detail visual redesign unless that spec is currently in scope.

---

## Unit 12 — Attribution and licensing

Implement:

```text
source metadata
license metadata
attribution DTO
learner/admin source notice components
project license/source documentation
```

Add:

```text
/data-sources
/licenses
/attributions
```

or the project's chosen equivalent.

---

## Unit 13 — Browser/security/import verification

Verify:

```text
Admin matching
ambiguous mapping
manual override
multiple senses
stale source
RLA evidence
raw JSON inspection
source update
rollback
authorization
attribution
```

Update:

```text
architecture.md
progress-tracker.md
```

with the finalized Lexicon architecture.

---

# 89. Unit Tests

Cover at minimum:

```text
Unicode normalization
accent preservation

el padre → padre lookup generation
la madre → madre
él remains él
sí remains distinct from si

exact lemma candidate
form candidate
multiple candidates
POS conflict
phrase candidate
unmatched entry

AUTO_MATCHED
REVIEW_REQUIRED
MANUAL
UNMATCHED

sense selection
multiple sense selection
preferred pronunciation

RLA recognized
RLA not listed
RLA unknown

source version identity
same import idempotency
removed sense
removed entry
manual mapping preservation
```

---

# 90. Import Tests

Use small fixture JSONL files containing:

```text
simple noun
multi-sense noun
verb with forms
pronunciation
synonyms
regional tags
multiword phrase
accent pair
homonym
missing field
malformed record
```

Do not run the entire real Wiktionary dump in normal CI.

The import parser must be testable against small deterministic fixtures.

---

# 91. Integration Tests

With the real integration database, verify:

```text
raw entry import
normalized projections
mapping FK integrity
selected-sense FK integrity

same source import does not duplicate
new source version preserves stable entry
manual mapping survives reimport

missing selected sense creates review state
rollback restores previous projection

RLA evidence attaches to dictionary entry

dictionary changes do not modify:
  user_item_progress
  user_level_progress
  SRS stage
  curriculum level/group
```

---

# 92. Admin Component Tests

Cover:

```text
mapping candidate display
mapping status
sense selection
multiple senses
pronunciation selection
regional evidence
manual mapping confirmation
raw JSON viewer
review queue filters
source history
stale mapping warning
```

---

# 93. Browser Verification

Test this complete flow:

```text
Admin creates vocabulary draft:

el padre
father
Level 1
Family

↓

Polyglot derives:
padre

↓

Local dictionary finds:
padre · noun

↓

Mapping:
AUTO_MATCHED

↓

Admin sees:
definitions
POS
IPA
forms
synonyms
Mexican regional evidence

↓

Admin chooses:
sense 1

↓

Admin publishes vocabulary

↓

Learner data resolves:
Polyglot curriculum
+
selected dictionary data

↓

No dictionary data was manually duplicated.
```

---

# 94. Ambiguous Browser Test

Test:

```text
curriculum word
→ multiple dictionary candidates
→ REVIEW_REQUIRED
→ no arbitrary mapping
→ admin compares candidates
→ admin selects one
→ MANUAL
→ mapping locked
```

---

# 95. Reimport Browser/Integration Test

Test:

```text
Import A
→ padre maps successfully
→ sense X selected

Import B
→ dictionary content changes
→ dictionary entry identity preserved
→ mapping preserved
→ sense X retained if matchable
```

Then:

```text
Import C
→ selected source sense disappears
→ no automatic replacement
→ REVIEW_REQUIRED
```

---

# 96. Out of Scope

Do not include in this spec:

```text
grammar generation from Wiktionary
AI-generated curriculum publication
live Wiktionary calls on learner page load
full web scraping
learner editing of dictionary data
automatic acceptance of every dictionary synonym
automatic replacement of teaching meanings
automatic curriculum reordering
automatic SRS changes
automatic Level changes
dictionary-based grammar generation
full-language dictionary import as the default
dictionary audio asset mirroring
real-time Wiktionary synchronization
```

---

# 97. Completion Criteria

Spec 12 is complete when:

1. A generic `lexicon` domain exists.
2. External lexical data is separate from curriculum data.
3. Vocabulary items can map relationally to stable dictionary entries.
4. Grammar items cannot use the vocabulary dictionary mapping accidentally.
5. Wiktextract/Kaikki JSONL can be streamed through a controlled importer.
6. Raw source JSON is retained.
7. Source version/import metadata is retained.
8. Frequently used lexical fields are normalized relationally.
9. Dictionary senses are stored independently.
10. Vocabulary can select one or more dictionary senses.
11. Forms are relationally queryable.
12. Pronunciations are relationally queryable.
13. Lexical relationships are relationally queryable.
14. Spanish lookup can map `el padre` to `padre`.
15. Spanish article logic is isolated behind language-specific matching.
16. Diacritics are never stripped.
17. Multiword expressions are handled safely.
18. High-confidence mappings may auto-match.
19. Ambiguous mappings require Admin review.
20. Admin manual mappings cannot be silently replaced.
21. RLA-ES `es-MX` can supply regional evidence.
22. RLA absence does not automatically mean a term is invalid.
23. Dictionary imports cannot modify curriculum placement.
24. Dictionary imports cannot modify learner progress or SRS.
25. Existing vocabulary IDs remain stable.
26. Current mapping remains stable across normal source updates.
27. Source-deleted entries remain historically referenceable.
28. Removed selected senses cause review rather than silent replacement.
29. Imports are idempotent.
30. Failed/staged imports cannot partially replace active dictionary data.
31. Previous source data can be restored.
32. Admins can search and manually map dictionary entries.
33. Admins can select definitions/senses.
34. Admins can select preferred pronunciation.
35. Admins can inspect regional evidence.
36. Admins can inspect raw source JSON.
37. Vocabulary Admin forms automatically expose dictionary-derived metadata.
38. Learner read models use normalized local database data rather than external calls.
39. Raw dictionary JSON is not sent unnecessarily to learner clients.
40. Source provenance and attribution are preserved.
41. License/source requirements are documented before production.
42. Unit, integration, component, and browser tests pass.
43. Typecheck, lint, build, and migration validation pass.
44. `architecture.md` documents the new Lexicon domain and invariants.
45. `progress-tracker.md` records completion and any unresolved source/licensing decisions.
