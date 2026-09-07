# Curriculum Intake, Dashboard Data & Item Detail

Complete the remaining curriculum-data workflows now that the database, progress, review history, enrollment, and vocabulary detail services exist.

## Curriculum Authoring at Volume

Extend the existing Admin curriculum workflow so large amounts of vocabulary can be added efficiently with data sheet imports. It can take csv, tsv, etc

Support:

* bulk vocabulary intake
* dictionary-assisted field population through the existing Lexicon/Wiktionary integration
* automatic mapping suggestions where confidence is high
* ambiguous mappings sent to the existing dictionary review queue
* batch confirmation of reviewed mappings
* pending items remain unpublished until explicitly approved

Dictionary data may populate or suggest:

* lemma
* part of speech
* IPA/pronunciation
* dictionary senses
* forms/variants
* synonyms
* regional/RLA information

Polyglot-owned fields such as Level, group, learner-facing translation, teaching meaning, and publication remain controlled by Admin.

Do not automatically publish imported or dictionary-enriched curriculum.

## Dashboard Real Data

Replace remaining dashboard fixture/mock data with real server-side data.

Use existing:

* `domains/progress`
* review history
* real SRS enrollment
* curriculum unlock state

Populate dashboard sections with real values such as:

* available lessons
* due reviews
* recently completed activity where currently designed
* current Level/progress
* review forecast/counts
* other existing dashboard widgets that already have a defined real-data source

Keep aggregation server-side through appropriate domain/read-model helpers.

Do not calculate authoritative progress or review state in React components.

Remove obsolete dashboard fixtures once no callers remain.

## Learner Item Detail

Implement:

`/items/[itemId]`

Level cards already link to this route.

For vocabulary, use the existing tested:

`getVocabularyDetail`

read model rather than rebuilding dictionary/curriculum joins in the page.

Display the currently supported data, including where available:

* vocabulary word
* translation
* teaching meaning
* Level/group
* part of speech
* pronunciation / IPA
* selected dictionary senses
* forms/variants
* synonyms
* examples
* regional information
* creator notes/resources
* learner SRS stage and progress information

Clearly distinguish Polyglot-authored teaching content from dictionary-derived information.

Grammar items should use the existing grammar/curriculum data model and must not depend on the vocabulary Lexicon mapping.

Handle:

* invalid item ID
* missing item
* archived item where still referenceable
* unauthenticated/protected access according to existing app rules
* loading/error states

## Scope Limits

* do not redesign the dashboard
* do not change SRS algorithms
* do not change Level unlock rules
* do not add AI-generated curriculum
* do not automatically publish bulk-authored items
* do not duplicate Lexicon data into curriculum records
* do not create a second vocabulary detail data path

## Check When Done

* Admin can efficiently create vocabulary in bulk.
* Dictionary fields are populated/suggested through the existing Lexicon system.
* Ambiguous mappings enter the existing review queue.
* Mapping decisions can be confirmed in batches.
* New curriculum stays Pending until publication.
* Dashboard uses real progress/review/enrollment data with no required fixtures remaining.
* `/items/[itemId]` works from existing Level-card links.
* Vocabulary pages use `getVocabularyDetail`.
* Item Detail shows curriculum, dictionary, and learner progress correctly.
* Grammar Item Detail does not depend on vocabulary dictionary data.
* Existing SRS/progress behavior is unchanged.
* Tests pass.
* `npm run build` passes.
