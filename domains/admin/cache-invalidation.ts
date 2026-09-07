/**
 * Curriculum cache-invalidation hook point (spec 11 rewrite's "Cache
 * Invalidation"). A deliberate no-op today — grepping the codebase
 * confirms no curriculum read path uses `unstable_cache`/`revalidateTag`/
 * `"use cache"` anywhere; every curriculum page is a live Server Component
 * database read with no caching layer to invalidate. Introducing a real
 * cache now, with nothing yet asking for one, would be exactly the
 * speculative abstraction code-standards.md warns against. This function
 * exists so every mutation site already calls an invalidation point at the
 * right moment — wiring it to `revalidateTag`/`revalidatePath` later is a
 * one-file change, not a hunt through every publish/archive/delete/move/
 * reorder call site.
 */
export function invalidateCurriculumCache(languageId: string): void {
  void languageId;
}
