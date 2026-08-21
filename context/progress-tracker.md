# Progress Tracker

Update after every meaningful implementation change.

Keep this file concise. Do not duplicate rules already defined in the other context files.

This file tracks **implementation/build progress of the Polyglot codebase** — not in-app learner progress (SRS stage, XP, etc.), which is product data governed by `architecture.md`.

## Current Phase

Foundation / repository audit

## Current Goal

Audit the existing Polyglot repository against the project context files and identify the first architecture-compliant implementation unit.

## Completed

- Product overview completed
- Architecture specification completed
- Code standards completed
- UI context completed
- AI workflow rules completed
- Initial progress tracker completed
- Context-file audit (2026-08-20): resolved contradictions across the context files — see Session Notes

## In Progress

- None

## Next Up

1. Audit the existing repository structure, dependencies, and current feature state
2. Identify architecture/spec conflicts and missing foundations
3. Record a concise gap list
4. Select the smallest high-priority implementation unit
5. Implement and verify that unit before moving to the next

## Open Questions

Do not invent these values during implementation:

- SRS penalty factor
- Minimum SRS stage after penalties
- Leech thresholds
- XP awards
- Rank thresholds
- Practice advancement thresholds
- Lesson batch-size limits (min/max; the default of 6 is already defined)
- Practice/test unlock levels (the "Theme tests after Level 5" / "CEFR tests after Level 10" mentions in `project-overview.md`/`architecture.md` are illustrative examples only, not decided values)

Resolve additional product or technical questions here only when they block or materially affect implementation.

## Session Notes

- The six context files are the source of truth.
- Do not assume visible UI means the underlying feature is complete.
- Audit existing code before broad refactoring.
- Preserve existing UI that already matches `ui-context.md`.
- Follow `architecture.md` when existing code conflicts with the intended system design.
- Update this file after every meaningful implementation change.
- Keep completed work summarized as milestones rather than a detailed history.
- Use Git history for implementation detail; this file is only for resuming work efficiently.

### 2026-08-20 Context Audit — Decisions Made

- **Access tiers**: v1 beta gives every authenticated user full curriculum access regardless of tier. Levels 1-3 stay `free`, Level 4+ is `premium`, but the premium gate is not enforced until production launch introduces Stripe. The `beta-tester` role keeps full access permanently, even after the gate activates.
- **New `access` domain** added to own tier definitions, level-to-tier mapping, and access evaluation, kept separate from `users`.
- **Decks**: admin-authored default decks are in v1 scope (reference canonical curriculum items). User-created/custom decks remain deferred.
- **Sentences** are not an independent SRS learning-item type — removed from the official learning-item list in `project-overview.md`. They remain supporting content on vocabulary/grammar items only.
- **Verb conjugations** are not separate curriculum items — conjugation practice references the base verb's vocabulary item directly and tracks its own progress.
- **Roles**: `beta-tester` = permanent full access; `developer` = free use of the isolated sandbox.
- **Navigation**: desktop nav is `logo | levels | reviews | decks | practice | journey | profile`. Primary Pages renamed to match: "Learn" → "Levels", "Progress" → "Journey", "Decks" added.
- **Onboarding** now includes an explicit active-language selection step, even though only Spanish exists in v1.
- **Skill-progression labels** (speaking/listening/etc.) display translated, language-specific stage names rather than reusing the English SRS stage names.
- **SRS stage colors** are grouped by stage name, not per sub-stage: all Beginner sub-stages (1-4) share `--srs-beginner`, both Familiar sub-stages (1-2) share `--srs-familiar`.
- **Primary font**: Shantell Sans, mapped to `--font-sans`.
