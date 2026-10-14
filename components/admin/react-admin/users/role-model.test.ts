import { describe, expect, it } from "vitest";

import {
  canAccessAdminArea,
  canManageCurriculum,
  canManageUsers,
  canPublishCurriculum,
  canUseDeveloperTools,
} from "@/domains/admin";
import { USER_ROLES, type UserRole } from "@/domains/users";

import {
  ROLE_CHOICES,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  capabilitiesOf,
  personLabel,
  roleChangeImpact,
} from "./role-model";

const CONSOLE = "Open the Admin console";
const AUTHOR = "Browse and write curriculum";
const PUBLISH =
  "Publish curriculum, and manage levels, groups, imports and official decks";
const TOOLS = "Read the logs and use the sandbox";
const ROLES = "See every account and change other people's roles";
const BETA = "Full curriculum access as a learner, whatever the access tier";

const PAIRS = USER_ROLES.flatMap((from) =>
  USER_ROLES.filter((to) => to !== from).map((to) => [from, to] as const),
);

describe("the words for each role", () => {
  it("has a label and a summary for every role", () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
      expect(ROLE_SUMMARIES[role].length).toBeGreaterThan(0);
    }
  });

  it("calls the role `user` a Learner — the word people use", () => {
    expect(ROLE_LABELS.user).toBe("Learner");
  });

  it("offers every role exactly once, from least to most privileged", () => {
    expect(ROLE_CHOICES.map((choice) => choice.id)).toEqual([
      "user",
      "beta-tester",
      "writer",
      "developer",
      "admin",
    ]);
    expect([...ROLE_CHOICES.map((choice) => choice.id)].sort()).toEqual(
      [...USER_ROLES].sort(),
    );
    expect(ROLE_CHOICES.map((choice) => choice.name)).toEqual([
      "Learner",
      "Beta tester",
      "Writer",
      "Developer",
      "Admin",
    ]);
  });
});

describe("capabilitiesOf — the spec's role matrix, as sentences", () => {
  it.each([
    ["user", []],
    ["beta-tester", [BETA]],
    ["writer", [CONSOLE, AUTHOR]],
    ["developer", [CONSOLE, TOOLS]],
    ["admin", [CONSOLE, AUTHOR, PUBLISH, TOOLS, ROLES]],
  ] as [UserRole, string[]][])("describes %s", (role, expected) => {
    expect(capabilitiesOf(role)).toEqual(expected);
  });

  // The sentences are only worth showing if they say what the server does. So
  // each one is tied to the predicate that actually decides it, for every role:
  // change a predicate and this fails until the words follow.
  it.each(USER_ROLES)(
    "agrees with the real authorization predicates for %s",
    (role) => {
      const has = (text: string) => capabilitiesOf(role).includes(text);
      const subject = { role };
      expect(has(CONSOLE)).toBe(canAccessAdminArea(subject));
      expect(has(AUTHOR)).toBe(canManageCurriculum(subject));
      expect(has(PUBLISH)).toBe(canPublishCurriculum(subject));
      expect(has(TOOLS)).toBe(canUseDeveloperTools(subject));
      expect(has(ROLES)).toBe(canManageUsers(subject));
    },
  );

  it("gives only a beta tester the learner benefit, and gives it to no staff role", () => {
    for (const role of USER_ROLES) {
      expect(capabilitiesOf(role).includes(BETA)).toBe(role === "beta-tester");
    }
  });
});

describe("roleChangeImpact", () => {
  it("says a learner made a writer gains the console and curriculum writing, and loses nothing", () => {
    expect(roleChangeImpact("user", "writer")).toEqual({
      gains: [CONSOLE, AUTHOR],
      losses: [],
      takesAccessAway: false,
    });
  });

  it("says a writer made an Admin gains publishing, the tools and role management", () => {
    expect(roleChangeImpact("writer", "admin")).toEqual({
      gains: [PUBLISH, TOOLS, ROLES],
      losses: [],
      takesAccessAway: false,
    });
  });

  it("says an Admin made a writer loses exactly those three — and keeps the console and writing", () => {
    expect(roleChangeImpact("admin", "writer")).toEqual({
      gains: [],
      losses: [PUBLISH, TOOLS, ROLES],
      takesAccessAway: true,
    });
  });

  it("says an Admin made a learner loses everything an Admin has", () => {
    const { gains, losses } = roleChangeImpact("admin", "user");
    expect(gains).toEqual([]);
    expect(losses).toEqual(capabilitiesOf("admin"));
  });

  it("swaps one thing for another when roles do not nest", () => {
    expect(roleChangeImpact("developer", "writer")).toEqual({
      gains: [AUTHOR],
      losses: [TOOLS],
      takesAccessAway: true,
    });
    expect(roleChangeImpact("beta-tester", "writer")).toEqual({
      gains: [CONSOLE, AUTHOR],
      losses: [BETA],
      takesAccessAway: true,
    });
  });

  it("treats losing the learner benefit as taking something away", () => {
    expect(roleChangeImpact("beta-tester", "user")).toEqual({
      gains: [],
      losses: [BETA],
      takesAccessAway: true,
    });
    expect(roleChangeImpact("user", "beta-tester")).toEqual({
      gains: [BETA],
      losses: [],
      takesAccessAway: false,
    });
  });

  describe.each(PAIRS)("%s to %s", (from, to) => {
    const impact = roleChangeImpact(from, to);

    it("never both gains and loses the same thing", () => {
      expect(impact.gains.filter((g) => impact.losses.includes(g))).toEqual([]);
    });

    it("is exactly the difference between the two roles", () => {
      expect(impact.gains).toEqual(
        capabilitiesOf(to).filter((c) => !capabilitiesOf(from).includes(c)),
      );
      expect(impact.losses).toEqual(
        capabilitiesOf(from).filter((c) => !capabilitiesOf(to).includes(c)),
      );
    });

    it("is the mirror image of the change back", () => {
      const back = roleChangeImpact(to, from);
      expect(back.gains).toEqual(impact.losses);
      expect(back.losses).toEqual(impact.gains);
    });

    it("warns exactly when something is taken away", () => {
      expect(impact.takesAccessAway).toBe(impact.losses.length > 0);
    });
  });

  it("is empty, and no warning, when nothing changes", () => {
    for (const role of USER_ROLES) {
      expect(roleChangeImpact(role, role)).toEqual({
        gains: [],
        losses: [],
        takesAccessAway: false,
      });
    }
  });
});

describe("personLabel", () => {
  it("prefers the display name, then the username, then a neutral phrase", () => {
    expect(personLabel({ displayName: "Ana Lopez", username: "ana" })).toBe(
      "Ana Lopez",
    );
    expect(personLabel({ displayName: null, username: "ana" })).toBe("ana");
    expect(personLabel({ displayName: "  ", username: "ana" })).toBe("ana");
    expect(personLabel({ displayName: null, username: null })).toBe(
      "this person",
    );
    expect(personLabel({ displayName: " ", username: " " })).toBe(
      "this person",
    );
  });

  it("trims what it returns", () => {
    expect(personLabel({ displayName: "  Ana  ", username: null })).toBe("Ana");
  });
});
