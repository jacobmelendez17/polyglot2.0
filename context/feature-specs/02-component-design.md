Read `AGENTS.md`, `context/ui-context.md`, `context/architecture.md`, and `context/progress-tracker.md` before starting.

We need the base chrome that frames every public marketing screen — the route group layout and the landing navbar. These will be reused and extended by the landing page, pricing, about, and demo pages that follow.

---

### Layout Tokens

Before building components, add the missing layout tokens to `globals.css`.

`ui-context.md` defines color and radius tokens but not layout, z-index, or motion values. Add them now so this navbar and every later component read from one place.

Requirements:

- nav height: `--nav-h` — `64px` mobile, `80px` at `md` and above
- z-index scale: `--z-header: 40`, `--z-sheet: 50`, `--z-skip: 60`
- motion: `--dur-fast: 140ms`, `--dur-base: 240ms`, `--dur-slow: 520ms`
- easing: `--ease-out: cubic-bezier(.22,.61,.36,1)`, `--ease-soft: cubic-bezier(.4,0,.2,1)`
- add an RGB-triplet variable for the warm surface, `--bg-warm-rgb`, so the navbar can composite it at partial opacity through `rgb(var(--bg-warm-rgb) / <alpha-value>)`

Do not change any existing color values in this unit.

---

### Marketing Layout

Create `app/(marketing)/layout.tsx`.

Requirements:

- server component
- renders the landing navbar, a `<main>` region, and a footer placeholder
- `<main>` carries `id="main"` so the skip link can target it
- footer placeholder is a single bordered `<footer>` with the wordmark and a copyright line — the real footer is a later unit
- the signed-in app shell must not inherit this layout

---

### Landing Navbar

Create `components/shared/site-header.tsx`.

Requirements:

- server component
- `position: sticky`, `top: 0`, full width, `z-index: var(--z-header)`
- height reads from `--nav-h`
- left section contains the Polyglot wordmark, linking to `/`
- right section contains navigation links, then auth actions
- navigation links, in order: `About` → `/about`, `Demo` → `/demo`
- auth actions, in order: `Log in` → `/sign-in`, `Sign up` → `/sign-up`
- `Sign up` uses the primary green pill treatment from `ui-context.md`; every other link is quiet
- navigation links are hidden below the `md` breakpoint and collapse into the mobile menu
- `Sign up` stays visible at every breakpoint
- subtle bottom border, applied only in the scrolled state

**Scroll state**

- at the top of the page the navbar background and bottom border are fully transparent, so the graph-paper background shows through
- past 24px of scroll the navbar takes `rgb(var(--bg-warm-rgb) / 0.85)`, a `backdrop-blur`, and a 1px `--border-default` bottom border
- transition both properties over `--dur-base` with `--ease-soft`
- where `backdrop-filter` is unsupported, fall back to the solid `--bg-warm` value
- read scroll position through a `requestAnimationFrame`-throttled listener, not a raw scroll handler

Sticky positioning means no manual content offset is needed. Add `scroll-margin-top: var(--nav-h)` to any in-page anchor target.

---

### Mobile Menu

Create `components/shared/site-nav-mobile.tsx`.

This is the only client component in the unit. Keep it as low in the tree as possible.

Requirements:

- hamburger trigger, visible only below `md`
- opens a sheet panel anchored under the navbar
- contains `About`, `Demo`, and `Log in`
- trigger carries `aria-expanded` and `aria-controls`
- `Escape` closes the menu and returns focus to the trigger
- focus is trapped inside the panel while it is open
- selecting a link closes the menu
- panel animates with `--dur-base`; under `prefers-reduced-motion` it appears without transition

---

### Skip Link

Add a skip link as the first focusable element in the marketing layout.

Requirements:

- visually hidden until focused
- targets `#main`
- when focused, renders as a normal surface card with visible focus ring

---

### Rules

Use semantic color tokens only. No hex values, no `bg-[#...]`, no arbitrary Tailwind color values in any component.

Follow `architecture.md` file organization: reusable application UI lives in `components/shared/`. Do not create a `components/landing-page/` directory.

Do not modify `components/ui/*`.

Animate only `transform`, `opacity`, `background-color`, and `border-color`.

**Auth state is out of scope.** Clerk is not installed yet. Build the signed-out navbar only. The signed-in variant, which swaps `Log in` / `Sign up` for `Dashboard`, is added in the auth unit. Do not stub, mock, or guess at auth state here.

**Pricing is deliberately omitted.** `project-overview.md` places pricing outside v1 scope. Do not add a pricing link or page.

---

### Scope Limits

- don't build the landing page body — that is the next unit
- don't build the real footer, only the placeholder
- don't add a theme toggle; theme switching belongs to user settings
- don't add auth state, Clerk imports, or session reads
- don't add analytics, Sentry, or middleware
- don't create the `/about` or `/demo` routes; the links may 404 for now

---

### Tests

Add `components/shared/site-header.test.tsx` using Vitest and Testing Library.

Cover:

- the wordmark and all four links render with the expected `href` values
- the mobile trigger toggles `aria-expanded` between `false` and `true`
- `Escape` closes the mobile menu
- the skip link is the first focusable element in the layout

---

### Check when done

- `app/(marketing)/layout.tsx` renders navbar, `<main id="main">`, and the footer placeholder
- navbar is transparent at the top and takes the warm translucent background past 24px
- navigation links collapse below `md` while `Sign up` remains visible
- mobile menu handles `aria-expanded`, `Escape`, and focus return
- layout, z-index, and motion tokens exist in `globals.css` and are used by the components
- no hardcoded colors and no arbitrary Tailwind color values
- no Clerk or auth references anywhere in the unit
- `npx tsc --noEmit` passes
- `npm run lint` passes
- `npm run test` passes
- `npm run build` passes
- `context/progress-tracker.md` updated with what was completed and what is next
