/**
 * Server-only entry point for `domains/danger-zone`. `./reset-binding.ts`
 * transitively imports `db/client.ts` — import from here only in
 * server-only files (Server Actions), never a `"use client"` component.
 * See `domains/users/server.ts` for why this split exists.
 */
export { resetContentTypeReviews, resetToLevel } from "./reset-binding";
export type { ResetContentTypeReviewsInput, ResetToLevelInput } from "./reset-service";
