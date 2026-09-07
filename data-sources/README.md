# Data Sources

Third-party lexical data used by the Lexicon domain (`domains/lexicon`,
spec 12). Everything in this directory is **external data**, kept
deliberately separate from Polyglot-authored curriculum content.

| Directory | Source | Used for | License |
| --- | --- | --- | --- |
| `wiktextract/` | English Wiktionary via [Wiktextract / kaikki.org](https://kaikki.org/) | Dictionary entries, senses, IPA, forms, relations | CC BY-SA 4.0 — see [`/licenses/wiktionary-cc-by-sa-4.0.md`](../licenses/wiktionary-cc-by-sa-4.0.md) |
| `rla-es/` | [RLA-ES](https://github.com/sbosio/rla-es) | Regional recognition evidence (`es-MX`, `es`) | GPL-3.0 / LGPL-3.0 / MPL-1.1 tri-license — see [`/licenses/rla-es.md`](../licenses/rla-es.md) |

## What is committed here

**Small, hand-written fixture files only.** They are shaped exactly like the
real releases and are enough to run `npm run lexicon:import`, the unit
tests, and the integration tests on a fresh clone — they are *not* a
substitute for the real datasets, and they are not redistributions of them.

- `wiktextract/es-sample.jsonl` — ~20 Wiktextract-shaped Spanish records
  covering the cases spec 12 requires fixtures for: a simple noun, a
  multi-sense noun, a verb with forms, pronunciation, synonyms, a homonym
  pair (same lemma and part of speech, different etymology), multiword
  phrases, the `el`/`él`, `si`/`sí`, and `tu`/`tú` accent pairs, a
  region-restricted entry, a record with only the required fields, a record
  with no glossed sense, a record in another language, and one deliberately
  malformed line.
- `rla-es/{es,es_MX}.{dic,aff}` — small Hunspell word lists in the real
  format, including one entry carrying an affix flag.

## Using the real datasets

Real dumps are **not** committed — the Kaikki Spanish extract alone is
around a gigabyte. Download them separately and point the importer at them:

```bash
# Wiktextract / Kaikki Spanish extract (.jsonl or .jsonl.gz — both stream)
export LEXICON_WIKTEXTRACT_PATH=/path/to/kaikki.org-dictionary-Spanish.jsonl
export LEXICON_WIKTEXTRACT_VERSION=2026-01-15   # recorded on the import row

# RLA-ES checkout containing es.dic/es.aff and es_MX.dic/es_MX.aff
export LEXICON_RLA_DIR=/path/to/rla-es/dist
export LEXICON_RLA_VERSION=2.7

npm run lexicon:import        # dictionary entries (CURRICULUM scope by default)
npm run lexicon:import-rla    # regional evidence
```

Source locations are read from the environment on the server only. The Admin
UI cannot supply a path or a URL — spec 12's security rules make that a hard
boundary, not a convention.

`npm run lexicon:import -- --scope full_language` ingests the whole language
instead of only the forms the current curriculum needs. Expect a much larger
database; `curriculum` is the default for a reason.

## Attribution

Attribution text is stored with each source in `lexical_sources` and travels
with any surfaced dictionary content. See [`/attributions`](../attributions).

Exact dataset versions and licence compliance must be verified before a
production release — the architecture carries the obligation, but it does
not discharge it.
