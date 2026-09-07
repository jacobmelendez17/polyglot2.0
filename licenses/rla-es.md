# RLA-ES — Recursos Lingüísticos Abiertos del Español

**Source.** <https://github.com/sbosio/rla-es> — open Spanish linguistic
resources, distributed as Hunspell dictionaries with regional variants
(`es`, `es_MX`, `es_ES`, `es_AR`, …).

**Licence.** Tri-licensed under the GNU GPL v3 or later, the GNU LGPL v3 or
later, and the Mozilla Public License v1.1. See the upstream repository's own
`LICENSE.md` for the authoritative text and the choice-of-licence terms.

## How Polyglot uses it

Only as **regional recognition evidence** — never as a source of definitions,
never as a source of curriculum. A word list answers exactly one question:
does this region's list contain this form?

Absence is recorded as `not_listed` and explicitly does **not** mean the form
is invalid in that region. That distinction is enforced in the data model
(`regional_evidence_status` has three values, not a boolean) rather than left
to whoever reads the column.

## Not yet discharged

Copyleft terms apply to distribution of the dictionary files themselves.
Polyglot ingests them into its own database rather than redistributing them,
but confirm the obligations of the chosen licence before a production release,
including whether the derived `regional_lexemes` projection is itself covered.
