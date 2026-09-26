/**
 * `returnTo` is a closed set (`"settings"` or omitted), never an arbitrary
 * client-supplied path — accepting one would be an open-redirect hazard for
 * zero benefit, since every real caller is one of these two (`onboarding/
 * page.tsx`'s own docstring). Shared by every screen a preview can chain
 * through (`/onboarding`, `/onboarding/language`, `/onboarding/curriculum`)
 * so the mapping can't drift between them.
 */
export function resolveOnboardingReturnTo(
  returnTo: string | undefined,
): string {
  return returnTo === "settings" ? "/settings/account" : "/admin/sandbox";
}
