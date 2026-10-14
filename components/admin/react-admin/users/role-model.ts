import type { UserRole } from "@/domains/users";

/**
 * What each role means in the Admin console, apart from React so every rule can
 * be stated and tested on its own (spec 26 Unit 6).
 *
 * Nothing here decides anything: the server does, from the database role, on
 * every request. This is only the words an Admin reads before confirming — and
 * it follows the spec's role matrix and `architecture.md`'s "Roles" exactly, so
 * the dialog cannot promise a person something the product does not give them.
 */

/** Learner is the role `user`: the word people use, over the value the database stores. */
export const ROLE_LABELS: Record<UserRole, string> = {
  user: "Learner",
  "beta-tester": "Beta tester",
  writer: "Writer",
  developer: "Developer",
  admin: "Admin",
};

/** From least to most privileged, the order a person would list them in. */
const ROLE_ORDER: readonly UserRole[] = [
  "user",
  "beta-tester",
  "writer",
  "developer",
  "admin",
];

export const ROLE_CHOICES = ROLE_ORDER.map((role) => ({
  id: role,
  name: ROLE_LABELS[role],
}));

/** One sentence on what holding the role is. */
export const ROLE_SUMMARIES: Record<UserRole, string> = {
  user: "A normal learner. Access follows the standard access tiers.",
  "beta-tester":
    "A learner with full curriculum access whatever the access tier — including after billing launches.",
  writer:
    "Can write curriculum in the Admin console. Their new items and edits wait for an Admin to publish them.",
  developer:
    "Can read the logs and use the sandbox in the Admin console. No access to the curriculum.",
  admin:
    "Full access to the Admin console, including publishing and managing roles.",
};

type Capability = { text: string; roles: readonly UserRole[] };

/**
 * The spec's role matrix, as sentences. A role *has* a capability if it is
 * listed; the difference between two roles is what a change gives and takes.
 */
const CAPABILITIES: readonly Capability[] = [
  {
    text: "Open the Admin console",
    roles: ["writer", "developer", "admin"],
  },
  { text: "Browse and write curriculum", roles: ["writer", "admin"] },
  {
    text: "Publish curriculum, and manage levels, groups, imports and official decks",
    roles: ["admin"],
  },
  { text: "Read the logs and use the sandbox", roles: ["developer", "admin"] },
  {
    text: "See every account and change other people's roles",
    roles: ["admin"],
  },
  {
    text: "Full curriculum access as a learner, whatever the access tier",
    roles: ["beta-tester"],
  },
];

export function capabilitiesOf(role: UserRole): string[] {
  return CAPABILITIES.filter((c) => c.roles.includes(role)).map((c) => c.text);
}

export type RoleChangeImpact = {
  /** What the person can do afterwards that they could not before. */
  gains: string[];
  /** What they can no longer do. */
  losses: string[];
  /** Whether the change takes something away — which is what makes it worth a warning. */
  takesAccessAway: boolean;
};

/** What changing someone from one role to another gives and takes, from the matrix. */
export function roleChangeImpact(
  from: UserRole,
  to: UserRole,
): RoleChangeImpact {
  const before = new Set(capabilitiesOf(from));
  const after = new Set(capabilitiesOf(to));
  const gains = [...after].filter((text) => !before.has(text));
  const losses = [...before].filter((text) => !after.has(text));
  return { gains, losses, takesAccessAway: losses.length > 0 };
}

/** What to call a person in a sentence: their name, else their username, else a neutral phrase. */
export function personLabel(person: {
  displayName: string | null;
  username: string | null;
}): string {
  return person.displayName?.trim() || person.username?.trim() || "this person";
}
