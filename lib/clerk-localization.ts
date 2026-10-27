import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

// Overrides for Clerk's built-in English strings; anything not listed keeps
// Clerk's default wording. `satisfies` (rather than an annotation) makes a
// misspelled key a type error instead of an override that silently never
// applies.
export const clerkLocalization = {
  userButton: {
    // The account menu's entry opens this app's own Settings
    // (`userProfileUrl="/settings/account"` on every `<UserButton>`), not
    // Clerk's hosted profile UI, so it is named for where it goes.
    action__manageAccount: "Settings",
  },
} satisfies NonNullable<ComponentProps<typeof ClerkProvider>["localization"]>;
