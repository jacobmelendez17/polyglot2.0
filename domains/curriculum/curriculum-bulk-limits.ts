/**
 * Limits on the commands that act on several curriculum items at once (spec 26
 * Unit 7). Pure constants — no database, no server module — so a client module
 * (the Admin API contract, the list screen) can import them directly.
 */

/**
 * The most items one bulk command (publish, archive, move) may name. It equals
 * the Admin list's largest page, so no selection made from a single page can
 * exceed it, and a request that names more is refused before any work is done.
 */
export const CURRICULUM_BULK_ITEM_LIMIT = 100;

/**
 * The most items the specialist ordering tools can put in order at once. They
 * list one level and type *whole* — an order with a page break in it is not an
 * order — so a level+type with more than this has no tool that can reorder it,
 * and says so instead of showing (and saving) a part of it.
 */
export const CURRICULUM_REORDER_LIMIT = 100;
