/**
 * Pure mapping from Polyglot's single free-text `display_name` to Clerk's
 * split `firstName`/`lastName` fields (spec 20 Account — Name). Kept as its
 * own pure function, separate from `user-service.ts`'s `updateName`, so the
 * splitting rule is unit-testable without mocking Clerk's backend client —
 * code-standards.md's "if a domain rule cannot be tested without mocking a
 * repository/provider, the rule and its side effect are not properly
 * separated."
 *
 * A single-word name has no last name in Clerk's model; `lastName` is `""`
 * (never omitted) so an existing Clerk last name is actually cleared rather
 * than left stale from a previous, longer name.
 */
export function splitDisplayNameForClerk(displayName: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = displayName.trim().split(/\s+/);
  return { firstName: firstName ?? "", lastName: rest.join(" ") };
}
