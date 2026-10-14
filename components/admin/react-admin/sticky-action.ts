/**
 * Keeps an action column in view when a narrow screen scrolls a table sideways:
 * the table scrolls inside its own frame (the page never does), but the one
 * thing a screen is for — Publish, Change role — must not scroll out of reach.
 *
 * Opaque, so the cells scrolling beneath it do not show through, and painted
 * with the same surface as the row it sits in (the header row is the paper
 * colour, body rows the page colour). The edge shadow appears only on phones,
 * where the table always overflows; on a wide screen nothing slides under it.
 */
export const STICKY_ACTION_SX = {
  position: "sticky",
  right: 0,
  backgroundColor: "background.default",
  "thead &": { backgroundColor: "background.paper" },
  boxShadow: { xs: "-8px 0 8px -8px rgba(0, 0, 0, 0.2)", sm: "none" },
} as const;
