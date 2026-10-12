# Spec 26 — React Admin Adoption & Admin Console Migration

**Status:** Implementation specification — not implemented  
**Prepared:** 2026-10-12  
**Intended repository location:** `context/feature-specs/26-react-admin-migration.md`  
**Repository inspected:** [`jacobmelendez17/polyglot2.0`](https://github.com/jacobmelendez17/polyglot2.0), `main`, inspected commit [`d271f22`](https://github.com/jacobmelendez17/polyglot2.0/commit/d271f22abd53640df8307fa80a6ed4e2d83889f3)  
**Supersedes:** The *presentation/integration layer* of the existing Admin screens as they are migrated. **Does not supersede** the business, security, schema, or data-integrity rules in Specs 08, 11, 12, 13, 14, 17, 19, 23, 24, or 25.

> **Implementation instruction:** Execute **one unit per Claude coding turn**, not the whole spec in a single change. At the end of every unit, delete or retire only the old UI that the new working unit replaces, run the relevant checks, and update `progress-tracker.md`. Do not report a unit complete while its old and new implementations are both live without a documented rollback reason.

## 1. Goal and user decisions

Incrementally replace the majority of Polyglot's current hand-built Admin *interface* with **React Admin**, while preserving all working administrative capabilities and the existing domain services. Each unit must provide a complete, independently verifiable replacement; the old page or component is removed after parity verification. The final console should visibly use React Admin for its resource lists, data tables, filtering, pagination, selected operations, and administrative navigation while continuing to use existing specialized editors for complicated content.

Approved choices:

1. Integrate React Admin incrementally into the existing `/admin` experience, rather than deploy a parallel console or rewrite everything at once.
2. Prioritize curriculum (levels, groups, vocabulary, grammar), the content review queue, and publishing.
3. Add **admin-only user role management** backed by Clerk-authenticated Polyglot users and database-authoritative roles.
4. Theme React Admin/Material UI to match Polyglot's existing warm visual system.
5. **Keep specialized vocabulary/grammar and other complex domain editors**; replace conventional Admin surfaces around them.
6. Check the actual repository against all six uploaded context files before design/implementation; this spec records a repository inspection, but each coding unit must re-check its own touched files against the then-current `main`/working branch.
7. Use a new numbered feature spec, leaving Spec 11 in place as a record of the previous implementation.
8. By the end, **the majority of the existing Admin screens must actually be React Admin-based**; a merely embedded or unused library does not satisfy this spec.

### Out of scope

- Rebuilding the curriculum, publishing, import, dictionary, decks, SRS, progress, or sandbox *business logic*.
- Replacing Clerk or Neon/Drizzle; creating a second backend/deployment/database.
- Exposing raw database tables as a general-purpose authenticated CRUD API.
- Rewriting the `CurriculumItemForm`, `VocabularyEditor`, `GrammarEditor`, `GrammarContentBlockEditor`, `UsageContextEditor`, `LevelItemBoard`, import resolution workflow, dictionary-sense editor, or sandbox controls **unless an individual subsequent unit identifies and verifies a safe targeted migration**.
- Allowing bulk import or React Admin's default edit/delete mechanics to bypass publication, draft, duplicate, idempotency, validation, ownership, or audit rules.
- Inventing Spec 25's not-yet-backed `Has Validation Warning` and `Recently Imported` per-item filters.
- Changing the `users.role` single-value model into multi-role assignments without a separate approved architecture decision.

## 2. Verified repository baseline and reconciliation

### Actual code and packages

At the inspected commit:

- `package.json` uses **Next.js 16.3.1, React 19.2.8, TypeScript, Clerk `@clerk/nextjs` 7.8.3, Drizzle, Neon, Tailwind 4, shadcn, Zod 4**. **React Admin and Material UI are not yet dependencies.** Check compatibility and lock the chosen supported versions during Unit 1; do not assume this snapshot reflects uncommitted work.
- `proxy.ts` protects `/admin(.*)` through Clerk. **It does not prove a user's database role**, and a new `/api/v1/admin/*` route must authenticate and authorize independently. `app/(admin)/admin/layout.tsx` currently loads `requireUser()`, checks `canAccessAdminArea`, and renders the existing server-side header/sidebar/mobile menu.
- `domains/admin/authorization.ts` defines the existing predicates `canAccessAdminArea`, `canManageCurriculum`, `canPublishCurriculum`, and `canUseDeveloperTools`. `domains/users/role-helpers.ts` contains `hasRole`/`requireRole`; `users.role` in `db/schema/users.ts` is the authoritative **single PostgreSQL enum** with `user`, `admin`, `beta-tester`, `developer`, and `writer`.
- `domains/admin/server.ts` exports domain services and mutation operations; `app/(admin)/admin/curriculum/actions.ts` contains thin Zod-validated Server Actions. **New HTTP handlers must call the same services**, not duplicate rules or call Drizzle ad hoc.
- `domains/curriculum/curriculum-admin-types.ts` defines `AdminCurriculumListItem`, `GetAdminCurriculumItemsInput`, cursor-based `AdminCurriculumItemsPage`, and the work-queue flags. `getAdminCurriculumItems` in `domains/curriculum/curriculum-admin-repository.ts` is language-scoped and has an **opaque `nextCursor`** rather than a numeric total. It calculates **display status `draft`** for a published item with an open revision; do **not** assume `learning_items.status='draft'` is the actual stored status of that item.
- The existing `/admin/curriculum` has `language`, `level`, `type`, `status`, `group`, `search`, `needs`, `cursor`, and `mode` URL parameters; record navigation preserves the query in `?from=`. `REORDER_LIMIT=100` is an existing bound; do not quietly modify it or create a partial reorder.
- `app/(admin)/admin/curriculum/review/page.tsx` retrieves `getReviewQueue`, records author and version, and exposes publication only when `canPublishCurriculum` is true.
- The current routes include `/admin`, `/admin/curriculum`, `/admin/curriculum/review`, `/admin/curriculum/levels`, `/admin/curriculum/levels/[levelId]`, `/admin/curriculum/groups`, `/admin/curriculum/groups/[groupId]`, `/admin/curriculum/items/new`, `/admin/curriculum/items/[itemId]`, `/admin/curriculum/imports/*`, `/admin/dictionary`, `/admin/decks/*`, `/admin/logs`, and `/admin/sandbox`.
- `components/admin/curriculum/*` already contains dedicated tables, filters, pagination, level/group dialogs and forms, item forms, reordering, review actions, and bulk actions. Each is a **migration candidate or a deliberately retained specialist**, not an invitation to rebuild domain logic.
- `domains/admin/audit-types.ts` enumerates audit actions; `db/schema/admin.ts` persists audit events. No existing role-change audit action or general admin user-list/role-update service was located among the inspected files. Verify before Unit 6 and extend intentionally.
- Current page access is finer-grained than the existing navigation: the shared nav gives writers several curriculum links, but *some writes* are admin-only. Preserve read access where already allowed and make destructive/publish action visibility precise; do not accidentally promote a writer's UI access into mutation authority.

### Spec 25 and source-of-truth reconciliation

Spec 25 is **Admin Curriculum Operations & CSV Pipeline** (not a React Admin spec). It defines immutable `curriculum_key`, CSV-first bulk maintenance, manual-owned fields, draft review, editorial work queues, filter-preserving navigation, and canonical export. The current repository already implements the following `needs` values: `definition`, `examples`, `ipa`, `pronunciation`, `synonyms`, `variations`, `draft_changes`, `ready_to_publish`. Its admin types explicitly say `Has Validation Warning` and `Recently Imported` lack backing data; **do not display functioning controls for them** until their source exists. Content metadata completeness must remain distinct from publication eligibility: definitions and examples are not universal publication gates.

`project-overview.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `ai-workflow-rules.md`, `progress-tracker.md` remain authoritative for their respective areas. Where the older Spec 11 says to retain its existing UI, **this user's Spec 26 migration decision authorizes replacement of that UI only**. Preserve all underlying rules in Spec 11. Do not edit old specifications merely to make the new library appear adopted.

**Source verification limits:** This is a GitHub **committed-code inspection**, not execution of the repository, CI, local `.env`, or production database. A coder implementing Unit 1 must revalidate package compatibility and behavior against the checked-out branch. No code or GitHub file was changed by preparing this spec.

## 3. Architecture and mandatory invariants

```text
Clerk-authenticated browser
  └─ /admin/*   (existing Next.js App Router pages and server-side role guard)
      └─ client-only React Admin context + selected RA resource/list UI
          ├─ custom typed dataProvider
          ├─ Clerk-aware UI authProvider / canAccess adapter
          └─ same-origin /api/v1/admin/* (thin, Zod-validated HTTP boundaries)
                └─ existing Admin / Curriculum / User application services
                      └─ repositories / Drizzle / Neon
                           └─ existing audit, draft/publish and integrity rules
```

- **No second authentication system:** Clerk owns credentials and sessions. `authProvider` is **presentation coordination only**; React Admin does not assign trust or manage credentials. On a 401, redirect to existing Clerk sign-in; on a 403, render an access-denied state rather than silently reporting empty data.
- **Every server endpoint reauthenticates and reauthorizes from the actual `users.role`**. Never trust role metadata, request body roles, resource names, disabled buttons, a cached RA `canAccess`, or the page/layout guard alone. Check after Clerk identity lookup and before reading protected rows or invoking an operation.
- **Whitelist operations by resource and action**. Do not map React Admin's generic `update`, `delete`, `deleteMany`, or `updateMany` directly to `users`, `learning_items`, or database tables. Release, archive, move, bulk publish, content updates, and roles are explicit application commands.
- **Business rules are reused**, including stable learning-item IDs and `curriculum_key`, language scope, status-overlay behavior, optimistic version checks, audit writes, cache invalidation, and transactional/idempotent bulk mutations.
- **Read-only features remain read-only** until a unit expressly implements a validated, authorized mutation. Unknown resources/actions must be rejected with a typed error, not guessed or silently accepted.
- **No learner state mutations:** the Admin UI must never write arbitrary SRS stage, unlock, XP, streak, progress or next-review values; the sandbox remains isolated.
- **Server Components remain the default** for layouts/guards. React Admin uses a small client-only boundary. No server/database module may be imported into a client component. Clerk sign-out remains Clerk's operation.
- **API errors**: map `UNAUTHENTICATED`→401; `FORBIDDEN`→403; missing→404; input validation→400/422; stale version→409; unexpected→500 with Sentry/server logging. The UI shows safe messages and retry controls. Never return an empty successful list on authorization failure.
- **Cross-language isolation**: filter required language ID on curriculum endpoints; validate referenced level/group/item relationships belong to that language on the server.
- **Routing**: preserve canonical **Next.js URLs**, including direct deep links and `?from=` return context. Avoid introducing `/admin#/...` as the permanent navigation scheme; React Admin's default SPA/hash router is not a drop-in replacement for existing Next route segments.

### Integration strategy

Prefer **React Admin's context/data components** in the existing Next.js routes: a client-only `AdminContext`/provider boundary, typed `dataProvider`, `authProvider`, `ListBase` or appropriate controller, `DataTable`, filters, selections and notifications. Keep the server-protected `app/(admin)/admin/layout.tsx`; introduce an MUI/React Admin provider **inside** it, without replacing Next routing with a second root router. React Admin's `Admin` component with its default HashRouter must **not** be mounted as a competing root at `/admin`.

React Admin may expect routing context for particular widgets. **Unit 1 must prove in a real Next.js 16 App Router build and browser test** that the chosen controller/components work under the proposed provider. For route-coupled helpers that cannot work without React Router, use the corresponding headless hooks/base primitives with explicit `next/link`/`next/navigation` and URL-state coordination, or document and verify a contained routing adapter. Do not patch third-party internals or fake success.

### Cursor pagination contract

The current `getAdminCurriculumItems` returns `{ items, nextCursor }`, not `{ items, total }`. React Admin supports `getList()` with **partial pagination** (`{ data, pageInfo: { hasNextPage, hasPreviousPage } }`). Use that capability; never invent `total` or fetch all records just to count them. A custom cursor adapter must:

- map UI filter/limit state onto the existing Zod-validated service and expose `id` in every record;
- maintain or encode an **opaque cursor chain** for next/previous, with the server cursor authoritative;
- preserve a page/cursor in the URL for refresh, deep links and `?from=` return navigation;
- invalidate cursor chains on filter, sort, language, per-page, or dataset-changing mutations;
- disable unsupported arbitrary page jumps and sort fields, or implement them correctly in the repository first;
- never reuse cursors across different languages/filters or show stale selected IDs after the query scope changes.

Unit 2 decides between `ListBase` with the supported partial-pagination path and a custom `useGetList`/list-context wrapper, **based on a tested spike**, not on an assumed API behavior.

### Visual and access integration

- Theme MUI/React Admin from Polyglot's **semantic CSS variables**, not a separate hardcoded palette. Respect light/dark/system and `[data-palette]` choices, plus `Shantell Sans` and established headings. Preserve semantic status/learning colors and visible labels.
- Keep notebook/warm-paper visual language, reduced motion, focus/keyboard accessibility, responsive mobile behavior, proper table overflow (`390px` viewport), and consistent loading/empty/error/forbidden states. Material UI may live in the Admin-only subtree; do not globally override shadcn primitives.
- `canAccess`/`getPermissions` for the RA UI mirror the **server-returned effective permissions**, preferably through `GET /api/v1/admin/me`; never hardcode an independent client-side hierarchy. Role changes invalidate or refresh these permissions. The API always re-checks.
- Keep Admin/developer operational pages visible only through `canUseDeveloperTools`, Admin/writer authoring through `canManageCurriculum`, publishing/level-group structural mutation/decks/import confirmation through `canPublishCurriculum`, and role management **admin only**. `beta-tester` is an entitlement role, not an Admin role.

## 4. Route migration matrix and final cutover definition

| Current route | After Spec 26 | What remains specialized |
|---|---|---|
| `/admin` | **RA-integrated overview** (Unit 1) | Existing stats service |
| `/admin/curriculum` | **RA resource table/filter/search/work queue** (Unit 2), bulk UI (Unit 7) | Reorder-specific domain service and safeguards |
| `/admin/curriculum/review` | **RA review list/selection with explicit publish commands** (Unit 3) | Publication/version service |
| `/admin/curriculum/levels` | **RA lists/basic forms** (Unit 4) | Level content board at `[levelId]` |
| `/admin/curriculum/groups` | **RA lists/basic forms** (Unit 5) | Existing ordering rules and complex group edits as needed |
| `/admin/users` | **NEW RA user list + role editor** (Unit 6) | No Clerk credential editing |
| `/admin/curriculum/imports/*` | **RA history/status/list shell** (Unit 8) | Upload, row repair, preview, confirm, CSV/Lambda workflow |
| `/admin/dictionary` | **RA mapping/work-queue list** (Unit 9) | Sense/pronunciation/override decisions |
| `/admin/decks` | **RA list and standard collection chrome** (Unit 10) | Official deck membership/order editor |
| `/admin/curriculum/items/new`, `/admin/curriculum/items/[itemId]` | **Retained existing specialized editors**; linked from RA (Units 2, 7) | Entire item-editing domain UI |
| `/admin/curriculum/levels/[levelId]` | Existing specialist board retained; progressively RA-framed where safe | Lesson ordering and cross-level movement |
| `/admin/logs`, `/admin/sandbox` | **Retained** | Security-sensitive logs and isolated personas |

**Measurable completion:** by Unit 11, at least **eight pre-existing list/overview surfaces** (Overview, Curriculum, Review, Levels, Groups, Imports, Dictionary, Decks) must render actual React Admin data/list components, with their former custom list/table/pagination/filter components **removed when no longer referenced**. Add new Users as a ninth RA-driven surface. Do not count merely wrapping old markup in an unused `<AdminContext>` as a migration. Specialist editing and operational tools intentionally remain Polyglot components.

## 5. API and authorization contracts

Use a **small explicit adapter API** rooted under `/api/v1/admin/`, consistent with `code-standards.md`. Concrete first-unit routes proposed below; verify folder conventions at implementation time. Only add a route when its unit requires it.

| Endpoint/command | Role | Domain service reuse | Contract |
|---|---|---|---|
| `GET /api/v1/admin/me` | admin, writer, developer | `requireUser`, authorization predicates | `{ id, role, permissions }`; no secrets or private Clerk user metadata |
| `GET /api/v1/admin/overview` | admin/writer stats; developer operational view | `getAdminCurriculumStatusCounts` | Counts must be language-scoped; developer must not receive restricted curriculum data |
| `GET /api/v1/admin/curriculum` | admin, writer | `getAdminCurriculumItems` | Required language, allowed filters, page limit and opaque cursor; `items`, `nextCursor` |
| `GET /api/v1/admin/review` | admin, writer | `getReviewQueue`, permitted author lookup | New items and open drafts; `id`, `kind`, `version`, labels, safe author display |
| `POST /api/v1/admin/review/publish` | admin | `publishItem` | Explicit `itemId`, `expectedVersion`, idempotency where applicable; audited |
| `GET /api/v1/admin/levels`, `/groups` | admin, writer read | Existing language/level/group read services | Language scope; groups additionally level-scoped |
| `POST/PATCH /api/v1/admin/levels`, `/groups` | admin | Existing create/update services | Validated and audited; no generic table update |
| `GET /api/v1/admin/users` | admin | **new users-domain safe administrative read service** | Paginated sanitized real-user list, exclude sandbox personas by default |
| `PATCH /api/v1/admin/users/[userId]/role` | admin | **new users-domain role assignment service** + audit | `{ role, expectedUpdatedAt, reason? }`; atomic authorization/concurrency/audit |
| Import, dictionary, decks adapter routes | Existing appropriate roles | Existing domain services | Added only in respective later units, without new business rules |

The precise request/response DTOs must be defined once in strict TypeScript/Zod at the boundary and reused by the typed `dataProvider`. **This table is a proposed transport shape, not a claim the routes already exist.** Reject unsupported list sorts/filters and mutations explicitly. CSRF protection must rely on same-origin, authenticated session-bound requests, validated methods/content types, appropriate Origin/Fetch Metadata checks for state changes, and the project's existing defenses; no credentials in query strings. Never use an `x-user-id` request header as identity.

### Publication and revision contract

A new learning item is `pending`. Editing a published item writes to its open draft while the existing published revision stays live. Published-with-draft may display as `draft` in the Admin read model. A UI save must **not** implicitly publish. Publish commands must use the existing expected-version stale-write protection; partial bulk failures must not masquerade as success. Reuse existing audit/cache invalidation. Work-queue filters and status filters are independent. Reordering must preserve `lesson_priority` and domain-level ordering invariants. CSV import confirmation never implicitly publishes learner-facing changes.

## 6. Staff role management — new functionality

### Data and scope

Use existing `users.id`, `users.clerk_user_id`, `users.role`, `users.is_sandbox`, and `users.updated_at`; do not create duplicate Clerk identity data or a second role table. One user has **one** role from `USER_ROLES`: `user`, `admin`, `beta-tester`, `developer`, `writer`. Existing role semantics remain authoritative. A role change may affect curriculum authoring, sandbox access, and subscription access (`beta-tester`), so show the impact and confirm the change.

**Supported in the first role-management unit:** find real app users by server-supported fields (e.g., username/display name), paginate, inspect safe ID/role/account information, change one user's role with explicit confirmation. **Not supported:** editing passwords, Clerk sessions, email credentials, user progress, or bulk role changes. No assumption that email exists in the Polyglot `users` table; only show email if explicitly fetched by a separately reviewed, limited Clerk integration.

### Mandatory safeguards

- Only an **authenticated, currently database-authorized admin** may list real users or change roles. Developers and writers cannot manage role assignments. The target must be a **real Clerk-linked user**; reject sandbox personas (`isSandbox=true` or missing Clerk user ID).
- Do not allow self-role changes through this UI. No unauthenticated registration, email-based auto-promotion, client metadata, or Clerk role mirroring can grant Admin privileges.
- Prevent removing/demoting the **last Admin**. Enforce transactionally under concurrent requests (serialize role-change decisions using a suitable database lock/transaction strategy); never check admin counts and update outside the same protection boundary.
- Use `expectedUpdatedAt` (or another explicit version token if better supported) so two admins cannot silently overwrite each other; return `409` for stale records and offer refresh. Audit `USER_ROLE_CHANGED` with actor, target, before/after role, reason, timestamp and correlation ID; **write audit and role update in the same transaction**.
- Do not expose raw `clerk_user_id`, email, secrets, or sensitive profile information unnecessarily in list results or audit metadata. Add rate limits for user enumeration and privileged mutations using the project's existing rate-limit infrastructure if appropriate.
- Make role changes effective on the **next server request**, including already-open Admin sessions. A role change must never require Clerk metadata propagation to enforce access; refresh RA UI permission caches and invalidate Next data when relevant.

**Implementation design decisions proposed here for safety:** self-role change disabled; last-admin protection; no bulk changes; only real users. If the owner wants a different role-management policy, explicitly approve a change before implementing Unit 6. No separate superadmin/owner concept is invented.

### Role permission matrix

| Capability | `user` | `beta-tester` | `writer` | `developer` | `admin` |
|---|---:|---:|---:|---:|---:|
| Enter `/admin` | No | No | Yes | Yes | Yes |
| Browse official curriculum / editorial review | No | No | Yes | No | Yes |
| Create/edit items, drafts, dictionary mapping | No | No | Yes | No | Yes |
| Publish/archive/delete, level/group structural mutations, imports | No | No | No | No | Yes |
| Official decks management | No | No | No | No | Yes |
| Logs and isolated sandbox | No | No | No | Yes | Yes |
| Change user role | No | No | No | No | **Yes** |

**Nuance:** Writer access to existing level/group *pages* is not proof of permission to create/update the corresponding structures. Page-level reads and action-level writes must be modeled separately; reuse `canPublishCurriculum` for the latter. This table reflects the inspected source, not a new broad user-level permission system.

## 7. Implementation units — one complete unit per coding turn

### Unit 1 — Foundation + visibly migrated Admin Overview

**Outcome:** React Admin is running in Polyglot, and `/admin` becomes the first real RA-integrated page. Existing `/admin/*` routes continue to work.

- Recheck branch/package versions; install only compatible `react-admin`, `@mui/material` and required Emotion dependencies. **Do not install an unneeded external REST provider**: Polyglot needs its own typed adapter.
- Add client-only `components/admin/react-admin/` provider, theme adapter, Clerk-aware auth adapter, data provider foundation, and typed error mapper. Keep server-side `app/(admin)/admin/layout.tsx` role gating; no duplicate full app shell or generic HashRouter.
- Add `GET /api/v1/admin/me` with real DB permissions, and only the read API necessary for Overview. Reuse existing curriculum counts. Do not leak counts to developer-only accounts.
- Replace the `/admin` Overview cards/navigation **with a real React Admin-context-driven presentation** (e.g. RA data fetching/controller/notifications); keep existing server guard. Remove obsolete Overview-only markup/helpers after tests prove parity.
- **Spike and prove** SSR boundary, context/router compatibility, theme syncing, keyboard behavior, mobile layout, Next build, server 401/403 and role-matrix behavior. Unit 1 is not done if RA loads only on a separate scratch page.
- **Schema:** none. **Tests:** provider/auth adapter unit; Next route 401/403 integration; real signed-in role-matrix Playwright; light/dark/palette visual and mobile checks.

### Unit 2 — Replace curriculum listing, search, filters and cursor pagination

**Outcome:** `/admin/curriculum` uses RA list/table/filter/selection primitives instead of the current custom list.

- Use existing `getAdminCurriculumItems`, `AdminCurriculumListItem`, Zod schema, languages/levels/groups lookups; preserve item type/status/work-queue flags, case-insensitive accent-preserving search and list-column meanings.
- Implement tested cursor-to-RA partial-pagination adapter, URL state (`language`, `level`, `type`, `status`, `group`, `search`, `needs`, `cursor`), selected-record isolation, back/forward/deep-link behavior. **Do not fabricate a total count** or allow arbitrary sort/page jumps without support.
- Link rows to existing `/admin/curriculum/items/[itemId]?from=...`; link creation to existing `/admin/curriculum/items/new`. The existing vocabulary/grammar editors are unchanged. Keep a route to reorder mode until Unit 7.
- Once parity is verified, **delete unused** `curriculum-table`, `curriculum-table-section`, filter and pagination components/tests that the replacement has genuinely made obsolete. Keep components still referenced by specialist editors.
- **Schema:** none. **Tests:** filter equivalence with legacy query, two+ cursor pages, deep-link restoration, role restrictions, mobile table overflow, stale data, multi-language isolation.

### Unit 3 — Replace content review queue and its presentation of publishing

**Outcome:** `/admin/curriculum/review` becomes a RA list/data-table workflow.

- Adapt `getReviewQueue` and safe author lookup into a typed review-list endpoint; preserve new-vs-draft distinction, author display, updated time, version, language filter, links to specialist item editors.
- Keep writer's read visibility; hide/disable publish for writer, **and** recheck Admin authority in the publish HTTP command. Use `publishItem` with the existing `expectedVersion`, audit, invalidation and `409` stale conflict UX. Bulk publish remains available only through supported existing service semantics, never default `updateMany`.
- Replace old review table/actions chrome; remove unused old `review-queue-actions` and layout code only after parity tests. Maintain explicit confirmation/impact when publication can change learner-visible content.
- **Schema:** none. **Tests:** writer/administrator/developer role matrix, concurrent editor stale version, pending vs published-with-draft, audit once, no silent publish on edit.

### Unit 4 — Replace Levels index and conventional Level metadata forms

**Outcome:** `/admin/curriculum/levels` lists levels with RA controls while retaining Level detail's specialized `LevelItemBoard`.

- Reuse `getLevelsByLanguage`, `getLevelContentCounts`, existing create/update/publication services. Preserve language scope, flexible per-level item counts and optional metadata (no resurrected 48/12 publish gate).
- Replace list and simple create/edit metadata controls where parity is feasible; link level rows to `[levelId]`. Keep level content board, cross-level move and lesson-priority order logic intact.
- Writers may view what they can currently view but do not gain Admin-only create/update/publish access; actions must be independently authorized.
- Remove displaced legacy level-list/form UI only when confirmed unused; specialist board remains.
- **Schema:** none. **Tests:** level validation, writer forbidden mutation, editor links, counts and empty-level publish semantics unchanged.

### Unit 5 — Replace Groups index and conventional Group metadata forms

**Outcome:** `/admin/curriculum/groups` is RA-managed, with scoped group records and appropriate create/edit forms.

- Reuse level-scoped groups and existing `createVocabularyGroup`, `updateVocabularyGroup`, `reorderVocabularyGroups` services. Group `position` remains significant; never silently renumber a different level's groups.
- Implement list/filter/metadata forms; carry current language and level on navigation. Preserve specialist group-reorder UI until an actual parity-verified replacement exists; do not misuse generic RA sorting to persist group `position`.
- Enforce admin-only structure mutation; preserve writer's read access where currently granted. Remove obsolete group index components when unreferenced.
- **Schema:** none. **Tests:** correct level scoping, add/edit/reorder authorization, deterministic order, same-group state after save and reload.

### Unit 6 — New Users & Roles console

**Outcome:** `/admin/users` exists; a verified Admin can safely manage another real user's single database role.

- Add sanitized paginated admin-user read model to `domains/users`, role-change service/repository with transactional safety, Zod input, exact-role validation, concurrency guard, `USER_ROLE_CHANGED` audit event and integration tests. Keep `domains/admin` responsible for Admin authorization/audit orchestration rather than moving Clerk into UI.
- Add whitelisted GET and PATCH routes in `/api/v1/admin/users/*`, Admin-only RA list and explicit role-edit confirmation dialog. Default to excluding and rejecting sandbox personas. Never update Clerk credentials or rely on Clerk metadata as authority.
- Implement policy safeguards above; log the role effect, invalidate relevant permissions, and verify a demoted logged-in staff member is denied by the server on their next request.
- **Schema:** normally **none** (`users.role` and `updated_at` exist; audit action set is code-only). If transaction/version requirements demand a new column/index, plan an additive migration and obtain approval for any destructive action.
- **Tests:** all five roles, no self-change, no last-admin demotion under concurrent requests, sandbox/missing-Clerk rejection, stale updates, audit atomicity, no information leak, no arbitrary progress mutation.

### Unit 7 — Replace curriculum bulk-action chrome; integrate specialist ordering

**Outcome:** Standard list selection and common bulk controls are RA-driven, and reorder remains correctly integrated.

- Replace legacy `bulk-actions-bar` selection chrome with RA selected-record state and **explicit** whitelisted commands that call `bulkMoveItems`, `bulkArchiveItems`, `bulkPublishPendingItems` with idempotency keys and server guards.
- Do not assume all selected items can be archived or published. Show validation/impact and preserve all-or-nothing semantics where current services require them; surface partial pre-validation without partial unauthorized writes.
- Link to existing `ItemReorderList`/`LevelItemBoard` rather than replacing drag-and-drop with arbitrary visual ordering. Preserve `lesson_priority`, `position`, level/type limits and the `100`-item bound.
- Remove now-unused legacy bulk-selection/list controls after parity, clear selection on scope changes, and verify 409/403 behaviors.
- **Schema:** none. **Tests:** mixed statuses/types, stale IDs, cross-language targeting, selected-page boundaries, concurrency, idempotent retry, no partial reorder.

### Unit 8 — Replace Imports listing/status/navigation (do not rewrite import engine)

**Outcome:** Admin import history/status/list surfaces use RA list/controller UI, but the specialized import wizard, repair and approval screens remain connected to the same routes and pipeline.

- First compare current code with the *latest implementation state of Spec 25 and Spec 19*; do not implement an imagined completed importer. Reuse `listActiveCurriculumImports`, `listArchivedCurriculumImportsForHistory`, `getCurriculumImportStatus`, and current Lambda/queue/review services as applicable.
- Migrate history, status badges, filters, links and archive/unarchive UI only where already backed by real services; preserve upload/review/confirm/idempotency semantics and the distinction between import commit and explicit publish.
- Delete replaced custom import listing components only after real status transitions and navigation parity. No storage, AWS, import-worker, or schema refactor in this UI unit.
- **Schema:** none expected. **Tests:** pending/processing/failed/complete views; admin-only confirmation; refresh/retry; imported draft not live; failure recovery.

### Unit 9 — Replace Dictionary work-queue/list chrome

**Outcome:** `/admin/dictionary` uses RA data tables/filter/pagination for mapping work queues.

- Reuse `getMappingQueue`, `getMappingStatusCounts` and lexicon/admin mapping commands. Preserve regional evidence, match statuses, draft promotion of approved fields, no grammar dictionary mappings, and no implicit changes to term/primary graded meaning.
- Keep mapping-sense/pronunciation selection and manual override dialogs as specialized UI. Writers retain approved mapping authoring; releases remain Admin-only. Avoid making an RA `edit` auto-confirm a mapping.
- Remove old mapping table/filter/list chrome after parity; maintain mobile containment behavior.
- **Schema:** none. **Tests:** selected sense and IPA mapping, draft-on-published behavior, writer boundaries, wrong-language/grammar exclusion, mapping status filters.

### Unit 10 — Replace official Decks list and ordinary collection chrome

**Outcome:** `/admin/decks` is an RA list/resource, backed by the existing Polyglot-deck service.

- Only list admin-authored *official* decks; never expose or administrate learner-owned personal decks. Keep existing detail membership/reordering screens unless separately verified for migration.
- Reuse `listPolyglotDecks` and current authorized/audited create/update/delete services, with canonical item references and gating preserved. Use explicit delete confirmation and rejected writes for non-admins.
- Delete replaced old list/dialog chrome when unused; avoid rewriting personal deck workflows.
- **Schema:** none. **Tests:** official-vs-personal isolation, publishing/content reference invariants, admin-only writes, correct navigation.

### Unit 11 — Final shell, navigation and dead-code cutover

**Outcome:** The majority of Admin now visibly runs on React Admin; no abandoned parallel custom list layer remains.

- Review the route matrix row by row against actual components; make the Admin navigation React Admin-aware, keep existing Next URLs, preserve EnvironmentBadge, Exit, keyboard navigation and role-specific links. Ensure writer menus do not suggest unavailable Admin-only actions.
- Remove old sidebar/list/table/filter/pagination wrappers **only if no retained specialist depends on them**; no mass deletion of useful forms or domain tests. Eliminate duplicate theming/routing/state providers and dead imports. Avoid broad unrelated refactors.
- Regression-test all legacy specialist pages, logs, sandbox, imports and links from curriculum item detail to return-to-results, including mobile/dark/system/palettes.
- Produce a **cutover matrix** marked `migrated`, `retained specialist`, or `blocked with reason` for every route above; demonstrate the eight migrated existing screens and new Users console. If fewer than eight are migrated, Spec 26 is **not complete**.
- **Schema:** none. **Tests:** full production-like build, role/E2E matrix, direct route/deep links, visual/mobile regression, stale mutation, audit and permission error handling.

## 8. Cross-unit test and release requirements

Every unit must state: (1) business/domain scope, (2) touched files, (3) whether migration/backfill is required, (4) reusable service/API contract, (5) exact legacy UI being replaced and what is retained, (6) verification results, (7) rollback strategy, (8) durable tracker update. A visible UI cutover must be reversible via normal Git rollback of that unit, without rolling back schema or already-published data.

Minimum checks for every meaningful unit, using the repository's real scripts:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test:integration   # scoped first, full when feasible
npm run build
npm run db:verify          # when schema/migrations are touched
npm run test:e2e           # relevant role/route scenarios, with safe E2E branch
```

Tests must use isolated fixtures/Neon test branches and approved test Clerk accounts. **Never** create or alter real production users, roles, curriculum, published revisions, or audit trails while verifying a unit. Explicitly test the five-role matrix and role changes in both authenticated Next pages and new API handlers. Also verify:

- Clerk session absent/expired, role revoked while browser remains open, malformed request, CSRF/cross-origin attempt, direct endpoint access without page access;
- language scoping and IDs, optimistic version conflict, duplicate protection, status overlay `draft`, pending publish, save draft, author/publisher separation, transactional/idempotent bulk writes;
- filter, page cursor, `?from=` preservation, browser back, reload, record selection scope, screen-reader labels, keyboard use, reduced motion, 390px layout, current light/dark/system/palette;
- error responses are visible and do not suppress Sentry/audit/system diagnostics; no accidentally cached privileged API response shared between users;
- production deploy/smoke checks and CI still pass; this spec makes **no** changes to the Spec 23 release process.

**Cache rules:** privileged API responses should be user/role-scoped, non-public and explicitly non-cacheable where necessary. React Query/React Admin client caches are convenience state, not authorization state. Invalidate relevant records/lists after a successful mutation; on 401/403 clear stale privileged UI and navigate to the appropriate Clerk/forbidden route.

**Schema changes:** No migration is presently required for React Admin adoption; Unit 6 should normally use the existing roles enum, user update timestamp and audit table. If later work requires an additive index/version field, write a reviewed forward-safe migration. Never edit applied migrations. Any destructive change must be separately approved.

## 9. Handoff format for each coding turn

Use the following prompt pattern, replacing the unit number:

> Implement **Spec 26, Unit N only**. Read all six Polyglot context files in the documented order, this spec, and the currently applicable older feature specs. Inspect the current relevant code before edits; compare to the inspected baseline commit but follow the newer checked-out source of truth if the repository has advanced. Provide a short plan and identify any unresolved decisions before high-risk changes. Keep existing domain services authoritative. Build a complete replacement for the unit's specified old UI; after real parity verification remove only its obsolete UI, retain specialist editors, run applicable checks, update `progress-tracker.md`, and report completion, remaining work, and the next unit. Do not continue into Unit N+1.

The implementation report for each unit must include:

```text
Spec 26 Unit N
Outcome: ...
Old UI replaced/removed: ...
Specialist UI retained: ...
New/modified API: ...
Auth/permission checks: ...
Schema/migration: none | detailed migration/backfill
Tests executed and results: ...
E2E/browser behavior verified: ...
Unresolved issues and rollback note: ...
progress-tracker.md update: ...
Next unit: N+1
```

## 10. Completion / acceptance checklist

- [ ] Eight existing Admin list/overview routes and the new Users console genuinely use RA data/controller/table UI.
- [ ] Existing specialized editors and sandbox/log interfaces still work without a separate deployment or database.
- [ ] Every migrated route preserves canonical Next URLs, deep-link return context and current URL filters where applicable.
- [ ] Old displaced custom list/filter/pagination UI is deleted when unused; no lingering shadow console.
- [ ] Clerk remains the only identity provider; DB remains role-authoritative, and every admin API has independent server guards.
- [ ] Admins can safely change other real users' roles; no self-change, last-admin loss, sandbox assignment, stale overwrite or missing audit.
- [ ] Writers can author and review but cannot publish, import-confirm or administer roles; developers have sandbox/log access but no unauthorized curriculum access.
- [ ] `draft` overlay, `pending` create, explicit publish, stable IDs/keys, cursor pagination, level/group order, idempotent imports and safe bulk actions are unchanged.
- [ ] UI matches `ui-context.md` across theme modes, accent palettes, mobile and accessibility checks.
- [ ] Full project checks and E2E role matrix pass; rollout follows the existing production pipeline with no unsafe data manipulation.
- [ ] `progress-tracker.md` records every unit; no old source-of-truth spec was silently rewritten.

## 11. Primary references

**Repository code inspected:**

- [Admin layout](https://github.com/jacobmelendez17/polyglot2.0/blob/main/app/%28admin%29/admin/layout.tsx), [current nav](https://github.com/jacobmelendez17/polyglot2.0/blob/main/components/admin/admin-nav-items.ts), [authorization predicates](https://github.com/jacobmelendez17/polyglot2.0/blob/main/domains/admin/authorization.ts), [Clerk proxy](https://github.com/jacobmelendez17/polyglot2.0/blob/main/proxy.ts)
- [Users role schema](https://github.com/jacobmelendez17/polyglot2.0/blob/main/db/schema/users.ts), [users roles](https://github.com/jacobmelendez17/polyglot2.0/blob/main/domains/users/user-types.ts), [audit actions](https://github.com/jacobmelendez17/polyglot2.0/blob/main/domains/admin/audit-types.ts)
- [Curriculum admin types](https://github.com/jacobmelendez17/polyglot2.0/blob/main/domains/curriculum/curriculum-admin-types.ts), [admin repository](https://github.com/jacobmelendez17/polyglot2.0/blob/main/domains/curriculum/curriculum-admin-repository.ts), [admin actions](https://github.com/jacobmelendez17/polyglot2.0/blob/main/app/%28admin%29/admin/curriculum/actions.ts)
- [Spec 11](https://github.com/jacobmelendez17/polyglot2.0/blob/main/context/feature-specs/11-admin.md), [Spec 17](https://github.com/jacobmelendez17/polyglot2.0/blob/main/context/feature-specs/17-authoring.md), [Spec 25](https://github.com/jacobmelendez17/polyglot2.0/blob/main/context/feature-specs/25-etl.md)

**Official integration documentation checked:**

- [React Admin Next.js integration](https://marmelab.com/react-admin/NextJs.html), [Admin / routing](https://marmelab.com/react-admin/Admin.html), [partial pagination in data providers](https://marmelab.com/react-admin/DataProviderWriting.html)
- [React Admin authorization](https://marmelab.com/react-admin/Permissions.html), [ListBase](https://marmelab.com/react-admin/ListBase.html), [theming](https://marmelab.com/react-admin/Theming.html)
- [Clerk Next.js protecting content](https://clerk.com/docs/nextjs/guides/secure/protect-content), [Clerk route handlers](https://clerk.com/docs/reference/nextjs/app-router/route-handlers)

**Internal context:** uploaded `project-overview.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `ai-workflow-rules.md`, `progress-tracker.md` (versions supplied for this task).
