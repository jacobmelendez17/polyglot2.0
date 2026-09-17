# Footer

Read `AGENTS.md`, relevant context files, the design system, and existing application layout before starting.

## Goal

Create a reusable global Polyglot footer that appears at the bottom of all applicable pages.

The footer should provide:

- Polyglot branding
- useful navigation
- support/resources
- legal links
- product/version information

The footer should feel like a complete website footer, not simply a copyright bar.

---

## Layout Behavior

The footer should remain at the bottom of the viewport on short pages and naturally appear after the content on long pages.

Do **not** use `position: fixed`.

Use the global layout/page shell so that:

```text
Header
Main Content (flex-grow)
Footer
```

fills at least the full viewport height.

The footer must never cover page content, lesson controls, review controls, dialogs, or mobile navigation.

---

## Footer Content

### Brand

Include:

- Polyglot logo/icon
- **Polyglot**
- short tagline

Use:

**Learn a little. Remember a lot.**

The brand section should be the visually strongest part of the footer without overpowering the page.

---

### Product

Include useful product navigation such as:

- Levels
- Decks
- Reviews
- Practice — only when the route exists
- Journey — only when the route exists

Do not link to unfinished routes or intentional 404 pages.

Authenticated destinations may remain accessible only according to their existing authentication behavior.

---

### Learn / Resources

Include:

- About
- Demo — once the Demo route exists
- Feedback

Additional resource links may be added later when real destinations exist.

Do not add placeholder links.

---

### Legal

Include:

- Privacy
- Terms

Recommended routes:

```text
/privacy
/terms
```

These should be accessible without authentication.

---

### Bottom Bar

Include:

```text
© 2026 Polyglot
```

Use the current year dynamically where appropriate.

Also display the current public version during Beta:

```text
Beta 0.1
```

Example:

```text
© 2026 Polyglot · Beta 0.1
```

The application version should preferably come from a shared application constant/configuration rather than being independently hardcoded in the component.

---

## Recommended Structure

Desktop:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Polyglot             Product             Resources       Legal      │
│  [Logo]               Levels              About           Privacy    │
│                       Decks               Demo            Terms      │
│  Learn a little.      Reviews             Feedback                   │
│  Remember a lot.      Practice*                                      │
│                       Journey*                                       │
│                                                                      │
│  ──────────────────────────────────────────────────────────────────  │
│  © 2026 Polyglot · Beta 0.1                                         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

`Practice` and `Journey` should not appear until their routes are implemented.

On mobile, the sections should stack or wrap into a compact responsive grid.

---

## Design

Follow the existing Polyglot design system.

Use:

- existing theme colors
- existing typography
- existing spacing
- subtle top border
- muted secondary text
- existing link hover/focus treatment
- existing border radius conventions where appropriate

The footer should work in:

- light mode
- dark mode
- system mode

It should visually complement Polyglot's cozy/playful design without becoming another marketing hero section.

Avoid:

- excessive animation
- large illustrations
- huge CTA sections
- unrelated promotional content

---

## Responsive Behavior

Desktop should use multiple columns.

Tablet may reduce column spacing or rearrange sections.

Mobile should stack sections cleanly.

Verify at minimum:

- 390px
- 768px
- desktop

There must be no horizontal overflow.

---

## Accessibility

Use semantic elements:

```html
<footer></footer>
```

Footer navigation should use appropriately labeled `<nav>` elements.

Ensure:

- keyboard navigation works
- focus states are visible
- links meet contrast requirements
- link meaning does not depend only on color
- layout remains usable when text is enlarged

---

## Route Rules

Only show links to routes that actually exist.

Do not use:

```text
href="#"
```

as a temporary destination.

For Beta 0.1, unfinished product links should simply be omitted until their features are implemented.

---

## Scope Limits

Do not add in this spec:

- newsletter signup
- mailing-list infrastructure
- social-media integrations
- community links without real destinations
- language switching
- authentication controls
- account controls
- payments/subscriptions
- app-store badges

The footer should be easy to extend later without requiring a redesign.

---

## Tests

Verify:

- footer renders globally
- short pages push footer to bottom of viewport
- long pages place footer after content
- footer never overlaps content
- every displayed link resolves successfully
- authenticated links retain existing auth behavior
- mobile has no horizontal overflow
- light/dark/system themes work
- keyboard navigation works
- visible focus states work

---

## Check When Done

- [ ] Shared Footer component created
- [ ] Integrated into global application layout
- [ ] Sticky-to-bottom layout behavior works without `position: fixed`
- [ ] Polyglot logo/name/tagline included
- [ ] Product links included where routes exist
- [ ] About included
- [ ] Demo included only when available
- [ ] Feedback included
- [ ] Privacy included
- [ ] Terms included
- [ ] Copyright included
- [ ] Beta version displayed
- [ ] No placeholder or dead links
- [ ] Responsive layout verified
- [ ] Light and dark mode verified
- [ ] Accessibility verified
