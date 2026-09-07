# English Wiktionary / Wiktextract — CC BY-SA 4.0

**Source.** Lexical data is extracted from the English Wiktionary by the
[Wiktextract](https://github.com/tatuylonen/wiktextract) project and
published as machine-readable dumps at [kaikki.org](https://kaikki.org/).

**Licence.** Wiktionary content is available under the
[Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA 4.0). Wiktextract's extracted data inherits it.

**Full licence text.** <https://creativecommons.org/licenses/by-sa/4.0/legalcode>

## What this obliges Polyglot to do

- **Attribution.** Credit the source wherever derived content is shown. The
  required wording is stored on the source row itself
  (`lexical_sources.attribution_text`) and is returned by the read model
  alongside any dictionary content, so it cannot be displayed without it.
- **ShareAlike.** Adaptations of CC BY-SA material must be distributed under
  the same licence. This is the reason the schema keeps dictionary-derived
  content strictly separate from Polyglot-authored curriculum: a Wiktionary
  gloss lives in `dictionary_senses`, Polyglot's own teaching explanation
  lives in `vocabulary_items`, and nothing merges them.
- **Indicate changes.** Polyglot normalizes and projects the upstream records
  rather than reproducing pages verbatim; the complete unmodified source
  object is retained in `dictionary_entry_versions.raw_data`.

## Not yet discharged

This file records the obligations the architecture is built to satisfy. It is
**not** a legal review. Confirm the exact dump, its licence notice, and how
attribution must appear in the product before any production release —
particularly the ShareAlike implications of combining this data with
proprietary curriculum content in one interface.
